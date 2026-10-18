# 架构说明

## 目标
前端与后端在**代码、依赖和通信方式**上分离：它们可以独立修改、独立测试，之间只有一份 HTTP 契约。

## 三个包
| 包 | 职责 | 允许依赖 |
| --- | --- | --- |
| `packages/shared` (`#shared`) | 契约：类型、常量、`apiPaths`、日报解析、导入校验、错误类型 | 无 |
| `packages/api` (`#api`) | 后端：`createApiHandler(options)` 返回 `(Request, env) => Promise<Response>` | `#shared`、`drizzle-orm`（仅 schema） |
| `packages/web` (`#web`) | 前端：`<App />`，通过 `createApiClient()` 发请求 | `#shared`、React、`@/components/ui/*` |

包别名来自 `package.json` 的 `imports` 字段，Node（测试）、TypeScript 与 Vite 共用同一套解析，无需额外插件。

`app/` 是宿主层，只负责把两端接起来：

- `app/_host/api.ts`：给 API 注入 `env` 绑定与历史日报种子。
- `app/api/[...path]/route.ts`：把所有 `/api/*` 请求交给 API 包。
- `app/page.tsx`：服务端进程内调用同一个 `/api/reports` 取首屏数据，作为 `initial` 传给 `<App />`。
- `app/layout.tsx`：全局样式与主题初始化脚本（来自 `#web`）。

## 依赖规则（ESLint 强制）
```
shared ◀── api        api 不得引用 #web / React / Next / cloudflare:workers
   ▲
   └────── web        web 不得引用 #api / Next / cloudflare:workers / drizzle
```
`api` 与 `web` 互相不可见。需要共享的东西（类型、常量、路径）放进 `shared`。

## 后端分层
```
routes/        HTTP：解析请求、鉴权、映射状态码   （reports.ts, search.ts, sync.ts, credential.ts, health.ts）
               service-errors.ts：ValidationError→400、回读不一致→503、其它→记录日志 + 503
services/      业务：导入去重、版本历史、归档合并与排序、同步状态   （不知道 HTTP）
repositories/  SQL：只有这一层写 SQL；列名显式列出   （不知道业务规则）
schema.ts      drizzle 表与索引定义，仅用于 `npm run db:generate` 生成 drizzle/ 迁移
http.ts        HttpError、统一错误响应；所有响应默认带 no-store + nosniff
auth.ts        平台登录头、所有者名单、程序同步协议、同源检查、常量时间比较
router.ts      极小路由器：路径参数、404、405 + Allow
```
运行环境绑定（`DB`、`INGEST_TOKEN`、`SITES_SERVICE_ACCESS`、`OWNER_EMAILS`）由宿主在每次请求时传入，API 包不读取任何全局，所以测试里可以直接传入内存 D1。时间也一样：`createApiHandler({ now })` 可注入时钟，每个请求在入口取一次 `now`，业务层不直接调用 `new Date()`。

查询约定：
- 单篇下载（Apps Script 每个文件回读一次）只按 id 查一行，不加载整个归档。
- 写入新版本时，旧版本在库内用 `INSERT … SELECT` 复制进 `report_versions`，全文不经过 Worker。
- `sync_runs` 每 15 分钟一行，最新回执走 `sync_runs_received_at_idx` 索引；每次写入新回执时在同一个 batch 里删掉 30 天（`SYNC_RUN_RETENTION_MS`）以前的旧行，表大小保持在约 3 000 行。
- 回执带最近一轮失败文件的明细（`failures`，最多 10 条：文件 ID、文件名、原因），存为 JSON 列，同步面板直接列出；旧版脚本不上报时为空。

列表与全文分离：
- `GET /api/reports` 只返回元数据（`ReportSummary`：字数 `chars`、链接数 `links`）和每期的条目摘要（标题、摘要、标签），不含原文 `raw` 和条目正文 `body`。阅读页按需请求 `GET /api/reports/{id}` 取原文。
- 条目在导入时由 `digestFor` 解析一次，写进 `report_stories`（与 `reports` 的写入同一个 batch）；`reports` 上记 `char_count`、`link_count`、`digest_version`。
- 解析规则变了就把 `#shared` 的 `DIGEST_VERSION` 加一。读列表时版本落后的报告会从原文重算：每个请求最多回写 `DIGEST_HEAL_LIMIT`（20）期，其余本次在内存里算，下次请求继续回写，不需要单独的迁移脚本。
- 种子随代码发布，派生数据在进程内按种子数组缓存一次。

搜索：
- `GET /api/search?q=` 在全部条目的标题与正文里做不区分大小写的字面子串匹配（`instr(lower(...))`，中文无需分词，`%`/`_` 不是通配符），返回命中的条目 id；`q` 最长 `MAX_SEARCH_CHARS`（100）字符。
- 种子和尚未回写的报告在内存里用同一个 `storyMatches` 匹配；被数据库记录取代的种子不参与。
- 前端输入防抖 200 ms、新请求取消旧请求；搜索失败时退回本地的标题 + 摘要匹配并提示。

### 信任边界
身份全部来自 Sites 入口，API 不再二次校验：
- `oai-authenticated-user-*`：入口在登录后注入，并负责剥离客户端伪造的同名头。
- `/api/sync*`：凭证 `OAI-Sites-Authorization` 由入口校验；API 只识别协议头 `X-Sites-Report-Sync`，并拒绝带 `Origin` / `Sec-Fetch-Site` 的浏览器请求。
- `setup-credential`：需同源、已登录；配置 `OWNER_EMAILS`（逗号分隔，不区分大小写）后只有名单内账号能取回凭证，未配置时依赖站点本身的私有访问。

## 前端分层
```
api/client.ts      唯一的 HTTP 出口；ApiError；可注入 fetcher 与 baseUrl
state/             纯 reducer：浏览状态（视图/筛选/搜索/期数）、归档加载状态
lib/               纯函数：markdown 解析、选择器（过滤/统计/高亮）、格式化、本机存储
hooks/             把外部状态接进 React：路由（hash）、主题、收藏、滚动、提示、全文搜索（useSearch）、原文按需加载（useReportText，按 id+revision+importedAt 缓存）
components/        只负责展示；业务状态都从 props 来
App.tsx            组合以上各层
```
浏览器偏好（主题、布局、收藏）通过 `useSyncExternalStore` 读取 localStorage，服务端渲染与水合一致，存储不可用时退回内存。

## 为什么仍然是一个 Worker
站点托管在 Sites 平台：构建产物是单个 Worker（`vinext build`），登录身份由平台入口注入请求头（`oai-authenticated-user-*`），程序同步凭证也在平台入口校验。因此部署形态保持单 Worker，分离发生在代码与契约层。

如果将来需要独立部署，接缝已经就位：`createApiHandler` 是普通的 Fetch 处理器，可以挂到单独的 Worker；前端把 `createApiClient({ baseUrl })` 指向它即可。需要额外处理的是跨域（CORS）与身份传递，目前**没有实现，也没有做过独立部署的验证**。

## 测试
- `tests/shared`：解析器与种子日报。
- `tests/api`：对 `createApiHandler` 发真实 `Request`，数据库是 `node:sqlite` 内存库加载真实迁移（`tests/api/helpers/d1.ts`）。
- `tests/web`：纯模块（解析、选择器、reducer、存储、API 客户端）。
- `tests/api-smoke.py`：对运行中站点的端到端检查。

## 新增一个接口
1. 在 `shared/src/constants.ts` 的 `apiPaths` 加路径，在 `types.ts` 加请求/响应类型。
2. 在 `api/src/routes/` 写处理函数，必要时加 service / repository，在 `app.ts` 注册。
3. 在 `tests/api/` 补测试；在 `openapi.yaml` 更新。
4. 在 `web/src/api/client.ts` 加方法并使用。
