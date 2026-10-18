import { MAX_BODY_BYTES } from '#shared';
import { hasBearerToken, isSameOrigin, loginHint, usesAccess } from '../auth.ts';
import { requireDb } from '../database.ts';
import { HttpError, SAFE_HEADERS, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { getArchive, ingestReport, readReport } from '../services/reports.ts';
import { isCallerOwner, requireOwner } from './owner.ts';
import { mapServiceErrors } from './service-errors.ts';

/**
 * GET /api/reports — 日报列表、导入状态与真实同步回执。
 * Cloudflare Access 部署下站点公开：失败文件明细（Drive 文件 ID、文件名、错误原因）只给所有者，访客只看到计数。
 */
export const listReportsRoute: Handler = async (context) => {
  const { env, seeds, now } = context;
  const archive = await mapServiceErrors('reports.list', '归档暂时读取失败，请稍后刷新。', () => getArchive(requireDb(env), seeds, now));
  if (usesAccess(env) && archive.sync.failures.length > 0 && !(await isCallerOwner(context))) {
    return json({ ...archive, sync: { ...archive.sync, failures: [] } });
  }
  return json(archive);
};

/**
 * POST /api/reports — 手动导入：持服务凭证的程序，或登录用户。
 * Cloudflare Access 部署下站点公开，只有所有者能从本站页面导入。
 */
export const importReportRoute: Handler = async (context) => {
  const { request, env, now, caller } = context;
  if (!isSameOrigin(request, { allowMissing: true })) throw new HttpError(403, '请求来源不匹配。');
  if (!hasBearerToken(request, env.INGEST_TOKEN)) {
    const { user, access } = await caller();
    if (access) await requireOwner(context, '只有站点所有者可以导入日报。');
    else if (!user) throw new HttpError(401, loginHint(false, '导入日报'));
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
