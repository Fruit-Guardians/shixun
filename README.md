# 拾讯 · 每日技术观察

浅色技术日报阅读网站。Grok 生成完整 Markdown 并保存至 Google Drive；本站原样归档，提供动态卡片、分类、跨日报搜索、完整阅读、原文下载和本机稍后阅读。

## 已实现
- React / Vinext 页面与响应式 CSS。
- Cloudflare D1 持久化，SHA-256 内容去重；更新保留旧版本，写入后全文回读。
- 筛选标签由确定性关键词规则生成，不代表技术结论得到独立核验。
- 历史原文保留在 data/seed-reports.json，实际 Drive 文本通过后端导入数据库，不固化到源码。
- `GET /api/reports` 列表；`GET /api/reports/:id` 下载原始 Markdown。
- `POST /api/reports` 登录用户手动导入；`POST /api/sync` 受 Sites owner-private 边界保护的无人值守接收端。

## 运行
```sh
npm run dev -- --hostname 127.0.0.1
node --test tests/parser.test.mjs
npx tsc --noEmit
```
数据库迁移与构建按 Sites 工作流执行。生产数据库与本地数据库独立。

## 自动同步
源目录：`1K0N3bIvwxE8x38BKc9vVeKxqqDdlGjpT`。
完整约定在 `public/sync-instructions.md`。后台任务使用自身的 Google Drive 连接读取文件，再用 Sites 支持的 service access 投递并回读，不需要用户电脑常开。Google Drive 数据不通过浏览器插件代理，不依赖浏览器登录 Cookie。

这是仅所有者可访问的网站。`/api/sync` 的授权边界是 Sites 私有访问控制，不是可伪造的 `X-Sites-Report-Sync` 标头；该标头只标识调用协议。如果未来公开网站，必须先改造 writer 鉴权并验证匿名写入被拒绝，再调整访问范围。定时任务也必须每次检查站点访问范围。

## 验证边界
成功导入、回读及去重只能证明全文传输完整；不证明日报中第三方研究、数字和链接的真实性。云端定时任务保存成功，也不等于未来运行已成功。
