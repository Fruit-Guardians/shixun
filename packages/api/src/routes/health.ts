import type { HealthResponse } from '#shared';
import { json } from '../http.ts';
import type { Handler } from '../router.ts';

/** GET /api/health — 存活探针；只报告数据库绑定是否存在，不暴露任何配置。 */
export const healthRoute: Handler = ({ env }) => {
  const body: HealthResponse = { ok: true, database: Boolean(env.DB) };
  return json(body);
};
