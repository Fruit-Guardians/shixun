# 部署到 Cloudflare Workers + D1（Cloudflare Access 保护）

整个站点（页面和接口）都在 Cloudflare Access 后面。Access 负责登录；Worker 自己再校验 Access 签发的 JWT，
所以即使有人绕过 Access 直连 Worker，或者伪造身份头，也拿不到数据、写不进去。Google Apps Script 用 Access
**服务令牌**同步。

免费额度够用：Workers Free、D1 Free、Zero Trust Free（50 人以内）都不需要绑卡。

配置都在 [`wrangler.cloudflare.jsonc`](wrangler.cloudflare.jsonc)。下面的命令在 `site/` 目录执行，
`npx wrangler` 用的是项目里锁定的版本。

## 1. 登录并创建数据库

```sh
npx wrangler login
npx wrangler d1 create shixun
```

把输出里的 `database_id` 填进 `wrangler.cloudflare.jsonc` 的 `d1_databases[0].database_id`，提交。
`database_id` 不是机密，可以放在公开仓库里。

## 2. 首次部署

```sh
npm run build:cloudflare
npm run deploy:cloudflare     # 先对远程 D1 执行 drizzle/ 下尚未执行的迁移，再部署 Worker
```

部署完成会打印地址，形如 `https://shixun.<你的子域>.workers.dev`。此时还没有配置 AUD，Worker
对所有请求都返回 403（配置缺失时宁可拒绝），这是预期的。

## 3. 用 Access 保护 workers.dev 地址

1. Cloudflare 后台 → Workers & Pages → `shixun` → 设置 → 域和路由 → `workers.dev` 一行 →
   启用 **Cloudflare Access**。它会在 Zero Trust 里创建一个 Access 应用。
   （也可以在 Zero Trust → Access → 应用程序 → 添加 → 自托管，域名填 `shixun.<你的子域>.workers.dev`。）
2. 在 Zero Trust → Access → 应用程序里打开这个应用，检查策略：
   - 一条 **Allow** 策略，包含（Include）→ 电子邮件 → 只填你自己的邮箱。不要用「Everyone」。
3. 在应用的概述（Overview）里复制 **Application Audience (AUD) Tag**。
4. 把 AUD 和所有者邮箱设为 Worker 的 secret（部署不会覆盖 secret）：

   ```sh
   npx wrangler secret put CF_ACCESS_AUD --config wrangler.cloudflare.jsonc
   npx wrangler secret put OWNER_EMAILS --config wrangler.cloudflare.jsonc    # 例如 you@example.com，多个用逗号分隔
   ```

团队域名 `tiny-silence-378c.cloudflareaccess.com` 已写在配置的 `vars` 里。如果换了团队，在
Zero Trust → 设置 → 自定义页面（或团队域名设置）里查看，并修改 `CF_ACCESS_TEAM_DOMAIN`。

打开站点地址：会先跳到 Access 登录，登录后能看到归档。删除、恢复版本只对 `OWNER_EMAILS` 里的账号开放。

## 4. 给 Google Apps Script 创建服务令牌

1. Zero Trust → Access → 服务凭据（Service credentials）→ 服务令牌 → 创建。
   复制 **Client ID** 和 **Client Secret**（Secret 只显示这一次）。
2. 回到第 3 步的 Access 应用，再加一条策略：操作（Action）选 **Service Auth**，包含 → Service Token → 选刚创建的令牌。
3. 在 Apps Script 项目设置 → 脚本属性中添加：
   - `CF_ACCESS_CLIENT_ID` = Client ID
   - `CF_ACCESS_CLIENT_SECRET` = Client Secret
   - `SITE_URL` = `https://shixun.<你的子域>.workers.dev`（不带结尾斜杠和路径）
4. 用仓库里新的 `integrations/google-apps-script/Code.gs` 覆盖脚本内容，运行一次 `installSync`。

Worker 只接受**服务令牌**的 JWT 调用 `/api/sync*`：普通登录用户、浏览器请求、只带协议头的请求都会被拒绝。

**从 Sites 迁过来时注意**：新数据库是空的（随代码发布的历史日报除外）。如果沿用原来的 Apps Script 项目，
它的脚本属性里有 `FILE_*` 记录，会把没改过的文件当作「已同步」跳过。最简单的办法是新建一个 Apps Script
项目；或者在原项目里删除所有 `FILE_*` 和 `DRIVE_SCAN_CURSOR` 属性后再运行 `installSync`。
在 Sites 上手动导入、且不在 Drive 里的日报，需要先从旧站下载原文，再到新站导入。

## 5. 检查

```sh
CF_ACCESS_CLIENT_ID=… CF_ACCESS_CLIENT_SECRET=… SMOKE_BASE_URL=https://shixun.<你的子域>.workers.dev npm run smoke
```

服务令牌只用来通过 Access；冒烟检查只读，同时确认所有未授权写操作都被拒绝。

## 6.（可选）推送即部署：连接 GitHub

Workers & Pages → `shixun` → 设置 → 构建（Builds）→ 连接 GitHub 仓库 `Fruit-Guardians/shixun`：

| 项 | 值 |
| --- | --- |
| 根目录 | `site`（如果仓库根就是本目录则留空） |
| 构建命令 | `npm run build:cloudflare` |
| 部署命令 | `npm run deploy:cloudflare` |

Worker 名称必须和配置里的 `name`（`shixun`）一致。之后每次推送到 `main` 都会执行迁移并部署。

## 安全要点

- `preview_urls` 已关闭：预览地址不在 Access 应用范围内。
- 如果以后绑定自定义域名，必须把这个域名也加入 Access 应用，否则 Worker 会因为没有 JWT 而对所有请求返回 403。
- `AUTH_PROVIDER=cloudflare-access` 时，`oai-authenticated-user-*` 等明文身份头一律忽略。不要在 Cloudflare 上去掉这个变量：
  未设置时 API 会信任这些头，只适合 Sites。
- 站点「数据与同步」里的「复制站点连接凭证」在 Access 部署下会提示改用服务令牌，站点不保存服务令牌。
