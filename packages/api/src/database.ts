import type { ApiEnv } from './env.ts';
import { HttpError, NO_STORE } from './http.ts';

export function requireDb(env: ApiEnv): D1Database {
  if (!env.DB) throw new HttpError(503, '归档数据库尚未配置。', { headers: NO_STORE });
  return env.DB;
}
