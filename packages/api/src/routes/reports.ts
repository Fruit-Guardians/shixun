import { MAX_BODY_BYTES } from '#shared';
import { hasBearerToken, isSameOrigin } from '../auth.ts';
import { requireDb } from '../database.ts';
import { HttpError, SAFE_HEADERS, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { getArchive, ingestReport, readReport } from '../services/reports.ts';
import { mapServiceErrors } from './service-errors.ts';

/** GET /api/reports — 日报列表、导入状态与真实同步回执。 */
export const listReportsRoute: Handler = async ({ env, seeds, now }) =>
  json(await mapServiceErrors('reports.list', '归档暂时读取失败，请稍后刷新。', () => getArchive(requireDb(env), seeds, now)));

/** POST /api/reports — 登录用户（或持服务凭证的程序）手动导入。 */
export const importReportRoute: Handler = async ({ request, env, now, caller }) => {
  if (!isSameOrigin(request, { allowMissing: true })) throw new HttpError(403, '请求来源不匹配。');
  if (!(await caller()).user && !hasBearerToken(request, env.INGEST_TOKEN)) {
    throw new HttpError(401, '请先登录，再导入日报。');
  }

  const input = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES, tooLarge: '文件过大。', invalid: '提交格式无效。' });
  return json(await mapServiceErrors('reports.import', '导入暂时失败，原文件保持不变。', () => ingestReport(requireDb(env), input, now)));
};

/** GET /api/reports/:id — 原样下载 Markdown。 */
export const downloadReportRoute: Handler = async ({ env, seeds, params }) => {
  const report = await readReport(requireDb(env), seeds, params.id);
  if (!report) throw new HttpError(404, '日报不存在。');
  return new Response(report.raw, {
    headers: {
      ...SAFE_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${report.date}_${report.topic}.md`)}`,
    },
  });
};
