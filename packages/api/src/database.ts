import type { ApiEnv } from './env.ts';
import { HttpError } from './http.ts';

export function requireDb(env: ApiEnv): D1Database {
  if (!env.DB) throw new HttpError(503, '归档数据库尚未配置。');
  return env.DB;
}
