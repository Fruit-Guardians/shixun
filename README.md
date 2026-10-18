# 拾讯 · 每日技术观察

浅色技术日报阅读网站。Grok 生成完整 Markdown 并保存至 Google Drive；本站原样归档，提供动态卡片、分类、跨日报搜索、完整阅读、原文下载和本机稍后阅读。

## 已实现
- 前后端按包分离（见下方「项目结构」与 [ARCHITECTURE.md](ARCHITECTURE.md)）：`shared` 契约、`api` 后端、`web` 前端，包之间的依赖由 ESLint 强制。
- React / Vinext 页面；统一设计令牌的响应式样式（packages/web/src/styles/ui.css），支持浅色/深色主题（跟随系统，可手动切换并记忆）。
- 阅读体验：阅读进度条、目录高亮、复制阅读链接、搜索关键词高亮、回到顶部、键盘「跳到主要内容」；弹窗基于 shadcn Dialog（焦点锁定、Esc 关闭）。
- Cloudflare D1 持久化，SHA-256 内容去重；更新保留旧版本，写入后全文回读。
- 筛选标签由确定性关键词规则生成，不代表技术结论得到独立核验。
- 历史原文保留在 data/seed-reports.json，实际 Drive 文本通过后端导入数据库，不固化到源码。
- `GET /api/reports` 列表；`GET /api/reports/:id` 下载原始 Markdown；`GET /api/health` 健康检查。
- `POST /api/reports` 登录用户手动导入；`POST /api/sync` 受 Sites owner-private 边界保护的无人值守接收端。

## 项目结构
```
packages/
  shared/   前后端共用的契约：类型、常量、API 路径、日报解析与导入校验（无运行时依赖）
  api/      后端：与框架无关的 Fetch 处理器 (Request, env) → Response
            routes（HTTP）→ services（业务）→ repositories（SQL）；schema.ts 为 drizzle 表定义
  web/      前端：React 客户端。只通过 src/api/client.ts 以 HTTP 访问后端
app/        宿主（Vinext / Cloudflare Worker），只做接线：/api/* 转给 api 包，页面渲染 web 包
components/ui/  vendored shadcn 组件（设计系统，前端可用）
drizzle/        数据库迁移
integrations/   Google Apps Script 同步器
tests/          shared / api / web 的单元、接口与组件渲染测试
```
前端不能引用 `#api`，后端不能引用 `#web`、React 或 `cloudflare:workers`，违反时 `npm run lint` 失败。

## 运行
```sh
npm run dev -- --hostname 127.0.0.1   # 本地开发
npm run check                         # 类型检查 + ESLint + 全部测试
npm test                              # 仅测试（Node 内置测试运行器，无需额外依赖）
```
接口测试用 `node:sqlite` 加载真实的 `drizzle/*.sql` 迁移，在内存 D1 上运行，不需要启动站点。对运行中站点的只读冒烟检查：`npm run smoke`（默认本地开发站，`SMOKE_BASE_URL=https://… npm run smoke` 检查线上；不写入任何数据）。

数据库迁移与构建按 Sites 工作流执行。生产数据库与本地数据库独立。

## 自动同步
源目录：`1K0N3bIvwxE8x38BKc9vVeKxqqDdlGjpT`。
完整安装说明在 `integrations/google-apps-script/README.md` 与站点「数据与同步」面板。普通 Google Apps Script 每15分钟扫描一次源目录，增量投递与全文回读；不调用 AI，不依赖个人电脑开机。首次运行 `installSync` 需要所有者完成 Google 授权，文件准备好不代表触发器已安装。停用运行 `disableSync`。

`SITE_SERVICE_TOKEN` 仅存 Google 脚本属性；站点对应 `SITES_SERVICE_ACCESS` 是后台 secret。前端显式点击、同源且登录后才能复制（可选设置 `OWNER_EMAILS` 限定为所有者邮箱），不写入脚本包或客户端源码。Google 授权包括只读 Drive、外部请求和触发器管理；代码只枚举指定源目录。

这是仅所有者可访问的网站。`/api/sync` 的授权边界是 Sites 私有访问控制，`X-Sites-Report-Sync: google-apps-script` 仅标识协议。旧 `google-drive` 协议返回410。若未来调整为公开，必须先重新设计写入与设置凭证接口的独立授权。

`sync_runs` 只记录 Google 程序真实回执。尚未收到记录显示待授权；触发器未安装显示停用；失败显示待检查；一小时未收到回执显示延迟。不要通过生产测试伪造已安装状态。

## 验证边界
成功导入、回读及去重只能证明全文传输完整；不证明日报中第三方研究、数字和链接的真实性。云端定时任务保存成功，也不等于未来运行已成功。
