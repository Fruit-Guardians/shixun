## 改了什么

<!-- 一两句话说明改动和原因 -->

## 检查

- [ ] `npm run check` 通过（类型检查 + ESLint + 全部测试）
- [ ] 行为变化有对应测试
- [ ] HTTP 契约变化已同步 `packages/shared`、`openapi.yaml` 和 `packages/web/src/api/client.ts`
- [ ] 解析规则变化已把 `DIGEST_VERSION` 加一，并更新 `REPORT_FORMAT.md`
- [ ] 涉及数据库时已运行 `npm run db:generate` 并提交 `drizzle/` 迁移
