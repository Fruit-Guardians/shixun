import type { DeleteReportResponse } from '#shared';
import { requireDb } from '../database.ts';
import { HttpError, SAFE_HEADERS, json } from '../http.ts';
import type { Handler } from '../router.ts';
import { deleteReport, listVersions, readVersion, restoreVersion } from '../services/reports.ts';
import { mapServiceErrors } from './service-errors.ts';
import { requireOwner } from './owner.ts';

/** GET /api/reports/:id/versions — 当前版本与历史版本元数据。 */
export const listVersionsRoute: Handler = async ({ env, seeds, params }) => {
  const versions = await mapServiceErrors('reports.versions', '版本历史暂时读取失败，请稍后重试。', () => listVersions(requireDb(env), seeds, params.id));
  if (!versions) throw new HttpError(404, '日报不存在。');
  return json(versions);
};

/** GET /api/reports/:id/versions/:versionId — 原样下载某个历史版本。 */
export const downloadVersionRoute: Handler = async ({ env, params }) => {
  const version = await mapServiceErrors('reports.version', '历史版本暂时读取失败，请稍后重试。', () => readVersion(requireDb(env), params.id, params.versionId));
  if (!version) throw new HttpError(404, '历史版本不存在。');
  const stamp = version.savedAt.slice(0, 19).replace(/[:T]/g, '-');
  return new Response(version.raw, {
    headers: {
      ...SAFE_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${params.id}_${stamp}.md`)}`,
    },
  });
};

/** POST /api/reports/:id/versions/:versionId/restore — 所有者把历史版本恢复为当前版本。 */
export const restoreVersionRoute: Handler = async (context) => {
  const { env, params, now } = context;
  await requireOwner(context, '只有站点所有者可以恢复历史版本。');
  const outcome = await mapServiceErrors('reports.restore', '恢复暂时失败，当前版本保持不变。', () => restoreVersion(requireDb(env), params.id, params.versionId, now));
  if ('missing' in outcome) throw new HttpError(404, outcome.missing === 'report' ? '日报不存在或不能恢复。' : '历史版本不存在。');
  return json(outcome.result);
};

/** DELETE /api/reports/:id — 所有者删除导错的一期；当前版本保留在历史里。 */
export const deleteReportRoute: Handler = async (context) => {
  const { env, seeds, params, now } = context;
  await requireOwner(context, '只有站点所有者可以删除日报。');
  const outcome = await mapServiceErrors('reports.delete', '删除暂时失败，日报保持不变。', () => deleteReport(requireDb(env), seeds, params.id, now));
  if (outcome === 'seed') throw new HttpError(409, '随站点发布的历史日报不能删除。', { code: 'seed_report' });
  if (outcome === 'missing') throw new HttpError(404, '日报不存在。');
  const body: DeleteReportResponse = { id: params.id, deleted: true };
  return json(body);
};
