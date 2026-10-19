<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/shixun-logo-dark.svg">
  <img src="public/brand/shixun-logo-light.svg" alt="拾讯" width="300">
</picture>

**每日技术观察 · 从信息中拾取信号**

Grok 每天写一份 Markdown 技术日报放进 Google Drive，拾讯把它原样归档成一个可搜索、可阅读的网站；另有「信源速递」定时直连 Hacker News、GitHub Trending、技术博客和漏洞库。

[![在线站点](https://img.shields.io/badge/在线站点-shixun.bx33661.workers.dev-0F7A35?style=flat-square)](https://shixun.bx33661.workers.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?style=flat-square&logo=cloudflare&logoColor=white)](DEPLOY.md)
[![React 19](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white)](packages/web)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.13-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.6.0-6BA539?style=flat-square&logo=openapiinitiative&logoColor=white)](openapi.yaml)

[在线阅读](https://shixun.bx33661.workers.dev) · [部署](DEPLOY.md) · [架构](ARCHITECTURE.md) · [日报格式](REPORT_FORMAT.md) · [自动同步](integrations/google-apps-script/README.md) · [接口](openapi.yaml)

</div>

---

## 它做什么

```
 Grok 定时任务 ──▶ Google Drive ──▶ Apps Script（每 15 分钟） ──▶ 拾讯 · Cloudflare Workers + D1 ──▶ 读者
  生成 Markdown       存放原文         增量投递 + 全文回读            归档 / 解析 / 搜索                公开阅读
```

- **原样归档**：日报全文按 SHA-256 去重存进 D1。更新时保留旧版本，写入后全文回读核对。
- **动态卡片**：从「① 昨日重要动态」里拆出每一条，生成标题、摘要和标签。格式见 [REPORT_FORMAT.md](REPORT_FORMAT.md)。
- **跨日报搜索**：在全部条目的标题和正文中做字面匹配，中文不用分词，命中的关键词会高亮。
- **阅读体验**：
  - 阅读进度条、目录高亮、复制阅读链接、回到顶部
  - 浅色/深色主题
  - 稍后阅读（保存在本机）
  - 下载原文和历史版本
- **信源速递**：Workers Cron 每 5 分钟抓取最该更新的四个公开频道（各频道有自己的刷新间隔），独立成一个信息流，可按来源筛选。「信息源」页面按分组列出全部 138 个频道的介绍、首页、抓取频率和最近状态。
  - 社区：Hacker News 首页与 Show HN、Lobsters、V2EX 热门。
  - GitHub：Trending，以及 React、Next.js、Bun、vLLM、Ollama、llama.cpp、Transformers、Deno、Vite、Kubernetes、Rust、Python、Linux 内核的版本发布。
  - 论文与模型：Hugging Face Daily Papers 与热门模型、arXiv cs.AI/CL/LG/CR/SE。
  - AI 研究：DeepMind、Google Research、微软研究院、PyTorch、Together AI，以及 Import AI、Latent Space、Interconnects、Sebastian Raschka、Lilian Weng、Karpathy。
  - 工程博客：Netflix、Meta、Stripe、Discord、Dropbox、Fly.io、Tailscale，以及 Pragmatic Engineer、Martin Fowler、Julia Evans、Dan Luu。
  - 平台与周刊：Rust、Go、Python、Node.js、TypeScript、Kubernetes、Chromium、Vercel 官方博客；This Week in Rust、JavaScript Weekly、Golang Weekly、GitHub Changelog、AWS 新功能、Product Hunt。
  - 博客与中文：8 个技术与安全新闻博客；阮一峰的网络日志、科技爱好者周刊、InfoQ 中文、少数派、美团技术团队、Solidot、开源中国、IT 之家、爱范儿、极客公园、小众软件、Tw93、HelloGitHub。
  - 安全资讯：BleepingComputer、Schneier、Risky Business、oss-security、Full Disclosure、Exploit-DB、CERT/CC、CISA、Chrome 发布、Debian 与 Ubuntu 安全通告、安全客、先知社区、嘶吼。
  - 安全研究：37 个研究博客，分 10 组（Web、二进制与浏览器、Windows 与 AD、云、威胁情报、移动与硬件、供应链、密码学、AI 安全、旧文精读），如 PortSwigger、Project Zero、watchTowr、Trail of Bits、腾讯科恩与玄武。
  - 漏洞：CISA KEV（在野利用）、NVD 高危/严重 CVE、GitHub Advisory、OSV（PyPI、npm、Go、crates.io）。
  - 不调用任何模型，只去掉 HTML、只保留 http(s) 链接；条目保留 30 天。频道列表在 [channels.ts](packages/api/src/feeds/channels.ts)。
- **零 AI 同步**：同步只是一个普通的 Google Apps Script，不调用任何模型，也不需要电脑开机。
- **公开阅读，写入受保护**：
  - 任何人都能浏览。导入、删除和恢复版本只对所有者开放，由 Cloudflare Access JWT 校验。
  - 访客看不到写操作按钮，也看不到同步失败明细。
  - 整站带 CSP、HSTS、禁止嵌入等安全头。

> [!NOTE]
> 标签由确定性关键词规则生成。导入成功只能证明全文传输完整，不代表日报里第三方研究、数字和链接已经核实。

## 快速开始

```sh
npm install
npm run dev -- --hostname 127.0.0.1   # 本地开发站
npm run check                         # 类型检查 + ESLint + 全部测试
```

| 命令 | 用途 |
| --- | --- |
| `npm test` | 只跑测试。用 Node 内置测试运行器，接口测试在加载了真实迁移的内存 D1 上运行 |
| `npm run smoke` | 对运行中站点的只读冒烟检查，不写入任何数据。查线上用 `SMOKE_BASE_URL=https://… npm run smoke` |
| `npm run build:cloudflare` | 构建 Cloudflare Workers 产物 |
| `npm run deploy:cloudflare` | 先执行远程 D1 迁移，再部署 Worker |
| `npm run db:generate` | 根据 `packages/api/src/schema.ts` 生成 `drizzle/` 迁移 |

需要 Node ≥ 22.13。

## 部署与同步

1. **部署站点**：按 [DEPLOY.md](DEPLOY.md) 部署到 Cloudflare Workers + D1。免费额度就够用，不需要绑卡。
   - Access 只保护 `/login`（所有者登录）和 `/api/sync`（服务令牌）。
2. **接上 Google Drive**：按 [integrations/google-apps-script](integrations/google-apps-script/README.md) 安装 Apps Script，运行一次 `installSync`。
   - 之后每 15 分钟增量同步一次。
   - 站点「数据与同步」面板会显示每次真实回执。
3. **让 Grok 按格式写**：文件名和一级标题里都要带同一个 `YYYY-MM-DD` 日期。动态条目写在「①」章节里，每条用一行加粗标题开头，详见 [REPORT_FORMAT.md](REPORT_FORMAT.md)。

## 项目结构

```
packages/
  shared/   前后端共用的契约：类型、常量、API 路径、日报解析与导入校验（无运行时依赖）
  api/      后端：与框架无关的 Fetch 处理器 (Request, env) → Response
            routes（HTTP）→ services（业务）→ repositories（SQL）；schema.ts 为 drizzle 表定义
  web/      前端：React 客户端，只通过 src/api/client.ts 以 HTTP 访问后端
app/        宿主（Vinext / Cloudflare Worker），只做接线：/api/* 转给 api 包，页面渲染 web 包
components/ui/  vendored shadcn 组件
drizzle/        数据库迁移
integrations/   Google Apps Script 同步器
data/           随代码发布的历史日报种子
tests/          shared / api / web 的单元、接口与组件渲染测试
```

包之间的依赖由 ESLint 强制：
- 前端不能引用 `#api`、Next 或 drizzle。
- 后端不能引用 `#web`、React 或 `cloudflare:workers`。

分层与信任边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 接口一览

| 方法 | 路径 | 说明 | 身份 |
| --- | --- | --- | --- |
| `GET` | `/api/reports` | 归档列表（元数据 + 条目摘要） | 公开 |
| `GET` | `/api/reports/{id}` | 下载原始 Markdown | 公开 |
| `GET` | `/api/reports/{id}/versions` | 版本历史 | 公开 |
| `GET` | `/api/search?q=` | 跨日报全文搜索 | 公开 |
| `GET` | `/api/health` | 健康检查 | 公开 |
| `GET` | `/api/session` | 当前访客是否所有者（只决定显示哪些按钮） | 公开 |
| `GET` | `/api/feed?source=&cursor=` | 信源速递，按发布时间倒序分页 | 公开 |
| `POST` | `/api/reports` | 手动导入 | 所有者 |
| `GET` | `/api/feed/channels` | 全部信源频道：介绍、首页、频率、最近状态 | 公开 |
| `POST` | `/api/feed/refresh` | 立即抓取信源（最该更新的一批，或指定频道） | 所有者 |
| `DELETE` | `/api/reports/{id}` | 删除一期（原文留在历史里） | 所有者 |
| `POST` | `/api/reports/{id}/versions/{versionId}/restore` | 恢复历史版本 | 所有者 |
| `POST` | `/api/sync` | Apps Script 无人值守投递 | 服务令牌 |
| `GET` | `/api/sync/status` | 同步状态与最近回执 | 服务令牌 |

完整契约见 [openapi.yaml](openapi.yaml)。

<details>
<summary><b>在 Sites 平台上运行（旧部署方式）</b></summary>

不设置 `AUTH_PROVIDER` 时，API 信任 Sites 入口注入的 `oai-authenticated-user-*` 身份头。整个站点仅所有者可访问。

- `/api/sync` 的授权边界是 Sites 的私有访问控制。
- `X-Sites-Report-Sync: google-apps-script` 只用来标识协议。
- Apps Script 用脚本属性 `SITE_SERVICE_TOKEN` 投递，值在站点「数据与同步」里复制。
- 旧的 `google-drive` 协议返回 410。

这种模式只能部署在 Sites 后面，否则身份头可以伪造。

</details>

## 同步状态怎么读

`sync_runs` 只记录 Google 程序的真实回执。面板显示的状态含义如下：

| 状态 | 含义 |
| --- | --- |
| 待授权 | 还没收到过回执 |
| 停用 | 触发器未安装 |
| 待检查 | 最近一轮失败，面板会列出失败的文件和原因 |
| 延迟 | 一小时没有收到回执 |

不要通过生产测试伪造「已安装」状态。

<div align="center">
<sub>拾讯 · Daily Signal</sub>
</div>
