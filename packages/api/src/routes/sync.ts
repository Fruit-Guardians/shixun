import {
  MAX_BODY_BYTES,
  MAX_STATUS_BODY_CHARS,
  SYNC_PROTOCOL_HEADER,
  SYNC_PROTOCOL_RETIRED,
  ValidationError,
} from '#shared';
import { isProgramSync } from '../auth.ts';
import { requireDb } from '../database.ts';
import { HttpError, NO_STORE, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { ReadbackMismatchError, ingestReport } from '../services/reports.ts';
import { getSyncState, recordSyncRun } from '../services/sync-state.ts';

/** POST /api/sync — Google Apps Script 把 Drive 文件搬运进来。 */
export const ingestSyncRoute: Handler = async ({ request, env }) => {
  const headers = NO_STORE;
  if (request.headers.get(SYNC_PROTOCOL_HEADER) === SYNC_PROTOCOL_RETIRED) {
    throw new HttpError(410, '旧 AI 定时同步通道已退役，请使用 Google Apps Script。', { code: 'legacy_ai_sync_retired', headers });
  }
  if (!isProgramSync(request)) throw new HttpError(403, '仅接受受保护的程序同步请求。', { headers });

  const data = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES, tooLarge: '文件过大。', invalid: 'JSON 格式无效。', headers });
  if (!data || typeof data !== 'object' || Array.isArray(data) || !(data as { sourceFileId?: unknown }).sourceFileId) {
    throw new HttpError(400, '同步需要已核实的 Drive 文件 ID。', { headers });
  }

  try {
    return json(await ingestReport(requireDb(env), data), { headers });
  } catch (error) {
    if (error instanceof ValidationError) throw new HttpError(400, error.message, { headers });
    if (error instanceof ReadbackMismatchError) throw new HttpError(503, error.message, { headers });
    console.error('sync.ingest failed', error);
    throw new HttpError(503, '归档暂时写入失败。', { headers });
  }
};

/** GET /api/sync/status — 读取真实回执；空表即「等待授权」。 */
export const readSyncStatusRoute: Handler = async ({ env }) => {
  try {
    return json(await getSyncState(requireDb(env)), { headers: NO_STORE });
  } catch (error) {
    console.error('sync.status failed', error);
    throw new HttpError(503, '同步状态暂时读取失败。', { headers: NO_STORE });
  }
};

/** POST /api/sync/status — Google 脚本上报触发器与统计。 */
export const recordSyncStatusRoute: Handler = async ({ request, env }) => {
  if (!isProgramSync(request)) throw new HttpError(403, '请求来源无效。');
  const text = await request.text();
  if (text.length > MAX_STATUS_BODY_CHARS) throw new HttpError(413, '状态请求过大。');

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new HttpError(400, '同步状态格式无效。');
  }
  try {
    return json(await recordSyncRun(requireDb(env), input), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ValidationError) throw new HttpError(400, '同步状态格式无效。');
    console.error('sync.record failed', error);
    throw new HttpError(503, '同步状态暂时写入失败。');
  }
};
