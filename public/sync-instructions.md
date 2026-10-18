# 零 AI 的云端同步

Google Apps Script 每 15 分钟扫描指定 Google Drive 文件夹，仅发送新增或更新的完整 Markdown。不会调用 Codex、ChatGPT 或其他模型，不依赖个人电脑开机。

## 一次性安装
1. 在拥有源文件夹读取权的 Google 账号中创建独立 Apps Script 项目。
2. 将 `Code.gs` 的内容粘贴到默认脚本文件。在项目设置勾选“在编辑器中显示 appsscript.json 清单文件”，再将本包的 `appsscript.json` 内容粘贴到清单。
3. 在项目设置 → 脚本属性中配置站点凭证。凭证只保存在脚本属性，不写进脚本正文或执行日志。
   - **部署在 Cloudflare（Access 保护）**：在 Cloudflare Zero Trust → Access → Service Auth 创建服务令牌，把 Client ID、Client Secret 分别存为 `CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`；再把站点地址（如 `https://shixun.<子域>.workers.dev`）存为 `SITE_URL`。
   - **部署在 Sites**：配置 `SITE_SERVICE_TOKEN`，值在拾讯站点「数据与同步」中点击“复制站点连接凭证”获取。
4. 手动运行 `installSync`，在 Google 授权页核对只读 Drive、向外部服务发出请求及管理本项目触发器的权限。需要所有者本人完成授权。
5. 确认执行日志 `installed: true`，站点同步面板出现 Google Apps Script 的成功回读记录，再视为自动同步已启用。

源目录与站点地址写在 `Code.gs` 的非敏感配置里；凭证只在脚本属性中。这个方案使用 Google 账号的只读 Drive 权限，程序只枚举指定目录，不修改源文件。

文件命名和正文格式（日期、专题、能拆成卡片的条目写法）见仓库根目录的 `REPORT_FORMAT.md`。

运行 `disableSync` 可以撤销本项目的同步触发器；不会删除日报。

## 失败排查
某个文件同步失败时，脚本会把文件 ID、文件名和原因（含站点返回的错误信息）随运行回执一起上报，站点「数据与同步」面板直接列出，最多 10 个；更多的只计数，详情见执行日志。失败的文件不会被标记为已同步，下一轮会自动重试。

更新脚本：用本包新的 `Code.gs` 覆盖原内容即可，脚本属性和触发器不受影响。

## 状态边界
源连接器可读不代表此脚本已获得授权；脚本文件准备好也不代表触发器已安装。实际授权、首次执行与触发器状态应分别核验。
