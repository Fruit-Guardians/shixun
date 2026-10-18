import { apiPaths } from '#shared';
import type { ApiEnv, ApiOptions } from './env.ts';
import { HttpError, errorResponse, json } from './http.ts';
import { Router } from './router.ts';
import { setupCredentialRoute } from './routes/credential.ts';
import { healthRoute } from './routes/health.ts';
import { downloadReportRoute, importReportRoute, listReportsRoute } from './routes/reports.ts';
import { searchRoute } from './routes/search.ts';
import { deleteReportRoute, downloadVersionRoute, listVersionsRoute, restoreVersionRoute } from './routes/versions.ts';
import { ingestSyncRoute, readSyncStatusRoute, recordSyncStatusRoute } from './routes/sync.ts';

export function buildRouter(): Router {
  return new Router()
    .get(apiPaths.health, healthRoute)
    .get(apiPaths.reports, listReportsRoute)
    .post(apiPaths.reports, importReportRoute)
    .get('/api/reports/:id', downloadReportRoute)
    .delete('/api/reports/:id', deleteReportRoute)
    .get('/api/reports/:id/versions', listVersionsRoute)
    .get('/api/reports/:id/versions/:versionId', downloadVersionRoute)
    .post('/api/reports/:id/versions/:versionId/restore', restoreVersionRoute)
    .get(apiPaths.search, searchRoute)
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
  const seeds = options.seedReports ?? [];
  const clock = options.now ?? (() => new Date());
  return async (request, env) => {
    try {
      const url = new URL(request.url);
      const { handler, params } = router.resolve(request.method, url.pathname);
      return await handler({ request, url, env, params, seeds, now: clock() });
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error('api unhandled error', error);
      return json({ error: '服务暂时不可用，请稍后重试。' }, { status: 500 });
    }
  };
}
