import { apiPaths } from '#shared';
import { defaultAccessVerifier } from './access.ts';
import { resolveCaller } from './auth.ts';
import type { Caller } from './auth.ts';
import type { ApiEnv, ApiOptions } from './env.ts';
import { HttpError, errorResponse, json } from './http.ts';
import { Router } from './router.ts';
import { setupCredentialRoute } from './routes/credential.ts';
import { feedChannelsRoute, feedRoute, refreshFeedRoute } from './routes/feed.ts';
import { healthRoute } from './routes/health.ts';
import { downloadReportRoute, importReportRoute, listReportsRoute } from './routes/reports.ts';
import { searchRoute } from './routes/search.ts';
import { sessionRoute } from './routes/session.ts';
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
    .get(apiPaths.session, sessionRoute)
    .get(apiPaths.feed, feedRoute)
    .get(apiPaths.feedChannels, feedChannelsRoute)
    .post(apiPaths.feedRefresh, refreshFeedRoute)
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
  const verifier = options.accessVerifier ?? defaultAccessVerifier;
  const feedFetch = options.feedFetch ?? ((input, init) => fetch(input, init));
  return async (request, env) => {
    try {
      const url = new URL(request.url);
      const { handler, params } = router.resolve(request.method, url.pathname);
      let caller: Promise<Caller> | undefined;
      const resolve = () => (caller ??= resolveCaller(request, env, verifier));
      return await handler({ request, url, env, params, seeds, now: clock(), caller: resolve, feedFetch });
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error('api unhandled error', error);
      return json({ error: '服务暂时不可用，请稍后重试。' }, { status: 500 });
    }
  };
}
