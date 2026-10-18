import { MAX_BODY_BYTES, MAX_STATUS_BODY_BYTES, SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_RETIRED } from '#shared';
import { isProgramSync } from '../auth.ts';
import { requireDb } from '../database.ts';
import { HttpError, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { ingestReport } from '../services/reports.ts';
import { getSyncState, recordSyncRun } from '../services/sync-state.ts';
import { mapServiceErrors } from './service-errors.ts';

/** POST /api/sync — Google Apps Script 把 Drive 文件搬运进来。 */
export const ingestSyncRoute: Handler = async ({ request, env, now }) => {
  if (request.headers.get(SYNC_PROTOCOL_HEADER) === SYNC_PROTOCOL_RETIRED) {
    throw new HttpError(410, '旧 AI 定时同步通道已退役，请使用 Google Apps Script。', { code: 'legacy_ai_sync_retired' });
  }
  if (!isProgramSync(request)) throw new HttpError(403, '仅接受受保护的程序同步请求。');

  const data = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES, tooLarge: '文件过大。', invalid: 'JSON 格式无效。' });
  return json(
    await mapServiceErrors('sync.ingest', '归档暂时写入失败。', () => ingestReport(requireDb(env), data, now, { requireSourceFileId: true })),
  );
};

/** GET /api/sync/status — 读取真实回执；空表即「等待授权」。 */
export const readSyncStatusRoute: Handler = async ({ env, now }) =>
  json(await mapServiceErrors('sync.status', '同步状态暂时读取失败。', () => getSyncState(requireDb(env), now)));

/** POST /api/sync/status — Google 脚本上报触发器与统计。 */
export const recordSyncStatusRoute: Handler = async ({ request, env, now }) => {
  if (!isProgramSync(request)) throw new HttpError(403, '请求来源无效。');
  const input = await readJsonBody(request, { maxBytes: MAX_STATUS_BODY_BYTES, tooLarge: '状态请求过大。', invalid: '同步状态格式无效。' });
  return json(await mapServiceErrors('sync.record', '同步状态暂时写入失败。', () => recordSyncRun(requireDb(env), input, now)));
};
