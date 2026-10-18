import { apiPaths } from '#shared';
import type { ApiEnv, ApiOptions } from './env.ts';
import { HttpError, NO_STORE, errorResponse, json } from './http.ts';
import { Router } from './router.ts';
import { setupCredentialRoute } from './routes/credential.ts';
import { healthRoute } from './routes/health.ts';
import { downloadReportRoute, importReportRoute, listReportsRoute } from './routes/reports.ts';
import { ingestSyncRoute, readSyncStatusRoute, recordSyncStatusRoute } from './routes/sync.ts';

export function buildRouter(): Router {
  return new Router()
    .get(apiPaths.health, healthRoute)
    .get(apiPaths.reports, listReportsRoute)
    .post(apiPaths.reports, importReportRoute)
    .get('/api/reports/:id', downloadReportRoute)
    .post(apiPaths.sync, ingestSyncRoute)
    .get(apiPaths.syncStatus, readSyncStatusRoute)
    .post(apiPaths.syncStatus, recordSyncStatusRoute)
    .post(apiPaths.setupCredential, setupCredentialRoute);
}

export type ApiHandler = (request: Request, env: ApiEnv) => Promise<Response>;

/**
 * 创建与运行时无关的 API 入口：`(Request, env) => Response`。
 * 宿主只需要把请求和绑定传进来，不依赖任何框架。
 */
export function createApiHandler(options: ApiOptions = {}): ApiHandler {
  const router = buildRouter();
  return async (request, env) => {
    try {
      const url = new URL(request.url);
      const { handler, params } = router.resolve(request.method, url.pathname);
      return await handler({ request, url, env, options, params });
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error('api unhandled error', error);
      return json({ error: '服务暂时不可用，请稍后重试。' }, { status: 500, headers: NO_STORE });
    }
  };
}
