import { DRIVE_FOLDER_ID, MAX_BODY_BYTES, ValidationError } from '#shared';
import type { ReportsResponse } from '#shared';
import { getPlatformUser, hasBearerToken, isSameOrigin } from '../auth.ts';
import { HttpError, NO_STORE, SAFE_HEADERS, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { requireDb } from '../database.ts';
import { ReadbackMismatchError, ingestReport, listReports, readReport } from '../services/reports.ts';
import { getSyncState } from '../services/sync-state.ts';

/** GET /api/reports — 日报列表、导入状态与真实同步回执。 */
export const listReportsRoute: Handler = async ({ env, options }) => {
  try {
    const db = requireDb(env);
    const reports = await listReports(db, options.seedReports ?? []);
    const body: ReportsResponse = {
      reports,
      sync: await getSyncState(db),
      drive: { status: reports.some((r) => r.sourceFileId) ? 'imported' : 'not_connected', folderId: DRIVE_FOLDER_ID },
    };
    return json(body, { headers: SAFE_HEADERS });
  } catch (error) {
    console.error('reports.list failed', error);
    throw new HttpError(503, '归档暂时读取失败，请稍后刷新。', { headers: SAFE_HEADERS });
  }
};

/** POST /api/reports — 登录用户（或持服务凭证的程序）手动导入。 */
export const importReportRoute: Handler = async ({ request, env }) => {
  const headers = SAFE_HEADERS;
  if (!isSameOrigin(request, { allowMissing: true })) throw new HttpError(403, '请求来源不匹配。', { headers });
  if (!getPlatformUser(request.headers) && !hasBearerToken(request, env.INGEST_TOKEN)) {
    throw new HttpError(401, '请先登录，再导入日报。', { headers });
  }

  const input = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES, tooLarge: '文件过大。', invalid: '提交格式无效。', headers });
  try {
    return json(await ingestReport(requireDb(env), input), { headers });
  } catch (error) {
    if (error instanceof ValidationError) throw new HttpError(400, error.message, { headers });
    if (error instanceof ReadbackMismatchError) throw new HttpError(503, error.message, { headers });
    console.error('reports.import failed', error);
    throw new HttpError(503, '导入暂时失败，原文件保持不变。', { headers });
  }
};

/** GET /api/reports/:id — 原样下载 Markdown。 */
export const downloadReportRoute: Handler = async ({ env, options, params }) => {
  const report = await readReport(requireDb(env), options.seedReports ?? [], params.id);
  if (!report) throw new HttpError(404, '日报不存在。', { headers: NO_STORE });
  return new Response(report.raw, {
    headers: {
      ...SAFE_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${report.date}_${report.topic}.md`)}`,
    },
  });
};
