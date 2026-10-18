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
完整安装说明在 `integrations/google-apps-script/README.md` 与站点「数据与同步」面板。普通 Google Apps Script 每15分钟扫描一次源目录，增量投递与全文回读；不调用 AI，不依赖个人电脑开机。首次运行 `installSync` 需要所有者完成 Google 授权，文件准备好不代表触发器已安装。停用运行 `disableSync`。

`SITE_SERVICE_TOKEN` 仅存 Google 脚本属性；站点对应 `SITES_SERVICE_ACCESS` 是后台 secret。前端显式点击、同源且登录后才能复制，不写入脚本包或客户端源码。Google 授权包括只读 Drive、外部请求和触发器管理；代码只枚举指定源目录。

这是仅所有者可访问的网站。`/api/sync` 的授权边界是 Sites 私有访问控制，`X-Sites-Report-Sync: google-apps-script` 仅标识协议。旧 `google-drive` 协议返回410。若未来调整为公开，必须先重新设计写入与设置凭证接口的独立授权。

`sync_runs` 只记录 Google 程序真实回执。尚未收到记录显示待授权；触发器未安装显示停用；失败显示待检查；一小时未收到回执显示延迟。不要通过生产测试伪造已安装状态。

## 验证边界
成功导入、回读及去重只能证明全文传输完整；不证明日报中第三方研究、数字和链接的真实性。云端定时任务保存成功，也不等于未来运行已成功。
