# 部署到 Cloudflare Workers + D1（公开阅读，Cloudflare Access 保护写操作）

站点对互联网公开：任何人都能浏览归档、阅读和下载原文、搜索、看版本历史。Cloudflare Access 只保护两个路径：

- `/login`：所有者登录入口。登录后 Access 在本站域名写下 `CF_Authorization` cookie，之后在任意页面都能导入、删除、恢复版本。
- `/api/sync`（含 `/api/sync/status`）：只给 Google Apps Script 的 Access **服务令牌**用。

Worker 自己校验 Access 签发的 JWT（请求头或 cookie），只认 `OWNER_EMAILS` 里的邮箱做写操作，
所以伪造身份头、绕过 Access 都写不进去。

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

部署完成会打印地址，形如 `https://shixun.<你的子域>.workers.dev`。此时已经可以公开浏览；还没有配置 AUD，
所有写操作和同步都会被拒绝（配置缺失时宁可拒绝），这是预期的。

## 3. 用 Access 保护登录入口和同步接口

不要在 Workers & Pages → `shixun` → 设置 → 域和路由里给 `workers.dev` 启用 Cloudflare Access：那会把整个站点藏到登录后面。

1. Zero Trust → Access → 应用程序 → 添加 → 自托管，添加两个公共主机名（同一个应用，共用一个 AUD）：
   - `shixun.<你的子域>.workers.dev`，路径 `login`
   - `shixun.<你的子域>.workers.dev`，路径 `api/sync`（`/api/sync/status` 自动包含在内）
2. 策略：
   - 一条 **Allow** 策略，包含（Include）→ 电子邮件 → 只填你自己的邮箱。不要用「Everyone」。
   - 第 4 步创建服务令牌后，再加一条 **Service Auth** 策略。
3. 在应用的概述（Overview）里复制 **Application Audience (AUD) Tag**。
4. 把 AUD 和所有者邮箱设为 Worker 的 secret（部署不会覆盖 secret）：

   ```sh
   npx wrangler secret put CF_ACCESS_AUD --config wrangler.cloudflare.jsonc
   npx wrangler secret put OWNER_EMAILS --config wrangler.cloudflare.jsonc    # 例如 you@example.com，多个用逗号分隔
   ```

团队域名 `tiny-silence-378c.cloudflareaccess.com` 已写在配置的 `vars` 里。如果换了团队，在
Zero Trust → 设置 → 自定义页面（或团队域名设置）里查看，并修改 `CF_ACCESS_TEAM_DOMAIN`。

打开站点地址直接就能浏览。需要导入、删除或恢复版本时，先访问 `https://shixun.<你的子域>.workers.dev/login`，
Access 登录完成后会回到首页；登录有效期由 Access 应用的会话时长决定，过期后再访问一次 `/login`。

### 信源速递（定时抓取）

`wrangler.cloudflare.jsonc` 里的 `triggers.crons`（`*/5 * * * *`）每 5 分钟抓取最该更新的三个频道，各频道按自己的间隔（30 分钟～1 天）刷新。
单次调用最多二十几个子请求，在免费版的子请求限制之内；部署后不需要额外操作，两个小时左右全部 68 个频道会抓取一遍。
抓取情况可以在站点的「信息源」页面查看。

GitHub Advisory 匿名调用按出口 IP 限流，Workers 共用出口，基本都会被限流。建议配置一个**不勾选任何权限**的
GitHub fine-grained 令牌（只用来提高额度）；NVD 的 API Key 可选：

```sh
npx wrangler secret put GITHUB_TOKEN --config wrangler.cloudflare.jsonc
npx wrangler secret put NVD_API_KEY --config wrangler.cloudflare.jsonc   # 可选
```

想立刻看到内容：所有者登录后在「信源速递」点「立即抓取」，或用 `INGEST_TOKEN` 调 `POST /api/feed/refresh`。
一次请求有子请求上限，会先抓最久没更新的约 30 个频道（预算 40 个子请求），剩下的交给定时任务或再点一次。

## 4. 给 Google Apps Script 创建服务令牌

1. Zero Trust → Access → 服务凭据（Service credentials）→ 服务令牌 → 创建。
   复制 **Client ID** 和 **Client Secret**（Secret 只显示这一次）。
2. 回到第 3 步的 Access 应用，加上第 3 步提到的策略：操作（Action）选 **Service Auth**，包含 → Service Token → 选刚创建的令牌。
3. 在 Apps Script 项目设置 → 脚本属性中添加：
   - `CF_ACCESS_CLIENT_ID` = Client ID
   - `CF_ACCESS_CLIENT_SECRET` = Client Secret
   - `SITE_URL` = `https://shixun.<你的子域>.workers.dev`（不带结尾斜杠和路径）
4. 用仓库里新的 `integrations/google-apps-script/Code.gs` 覆盖脚本内容，运行一次 `installSync`。
5. 让 Grok 按 [REPORT_FORMAT.md](REPORT_FORMAT.md) 命名文件和书写条目，否则日期识别会失败或拆不出卡片。

Worker 只接受**服务令牌**的 JWT 调用 `/api/sync*`：普通登录用户、浏览器请求、只带协议头的请求都会被拒绝。

**从 Sites 迁过来时注意**：新数据库是空的（随代码发布的历史日报除外）。如果沿用原来的 Apps Script 项目，
它的脚本属性里有 `FILE_*` 记录，会把没改过的文件当作「已同步」跳过。最简单的办法是新建一个 Apps Script
项目；或者在原项目里删除所有 `FILE_*` 和 `DRIVE_SCAN_CURSOR` 属性后再运行 `installSync`。
在 Sites 上手动导入、且不在 Drive 里的日报，需要先从旧站下载原文，再到新站导入。

## 5. 检查

```sh
CF_ACCESS_CLIENT_ID=… CF_ACCESS_CLIENT_SECRET=… SMOKE_BASE_URL=https://shixun.<你的子域>.workers.dev npm run smoke
```

服务令牌只用来通过 `/api/sync` 上的 Access；冒烟检查只读，同时确认所有未授权写操作都被拒绝。不带令牌也能跑，只是同步状态那一项会被 Access 拦下。

## 6.（可选）推送即部署：连接 GitHub

Workers & Pages → `shixun` → 设置 → 构建（Builds）→ 连接 GitHub 仓库 `Fruit-Guardians/shixun`：

| 项 | 值 |
| --- | --- |
| 根目录 | 留空（仓库根就是本目录） |
| 构建命令 | `npm run build:cloudflare` |
| 部署命令 | `npm run deploy:cloudflare` |

Worker 名称必须和配置里的 `name`（`shixun`）一致。之后每次推送到 `main` 都会执行迁移并部署。

## 安全要点

- 访客看不到导入、恢复、删除和同步设置，也看不到同步失败明细。所有者访问 `/login` 登录后才会出现，「数据与同步」里有退出登录入口。
- 所有响应都带 CSP、HSTS、`X-Frame-Options: DENY` 等安全头（`packages/api/src/security.ts`）。以后如果引入新的外部脚本、字体或接口地址，要同步放行。
- 信源条目来自第三方：只保存去掉 HTML 的纯文本，链接只接受 http(s)，以新窗口打开且不带 opener/referrer。抓取失败只记录状态码或超时，不保存响应内容。
- `preview_urls` 已关闭：预览地址不在 Access 应用范围内，同步接口在那里拿不到服务令牌 JWT。
- 如果以后绑定自定义域名，要把这个域名的 `/login` 和 `/api/sync` 也加入 Access 应用，否则在新域名上无法登录和同步（阅读不受影响）。
- `AUTH_PROVIDER=cloudflare-access` 时，`oai-authenticated-user-*` 等明文身份头一律忽略。不要在 Cloudflare 上去掉这个变量：
  未设置时 API 会信任这些头，只适合 Sites。
- 站点「数据与同步」里的「复制站点连接凭证」在 Access 部署下会提示改用服务令牌，站点不保存服务令牌。
