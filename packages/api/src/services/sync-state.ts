import { MAX_SYNC_COUNT, SYNC_STALE_MS, ValidationError } from '#shared';
import type { SyncRunInput, SyncState } from '#shared';
import { insertSyncRun, latestSyncRun } from '../repositories/sync-runs.ts';

const EMPTY: SyncState = {
  mode: 'google-apps-script',
  state: 'awaiting_setup',
  lastCheckedAt: null,
  triggerInstalled: false,
  created: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  legacyWriterDisabled: true,
};

/** 只反映 Google 脚本真实上报的回执；没有回执就是「等待授权」，绝不伪造运行状态。 */
export async function getSyncState(db: D1Database, now = Date.now()): Promise<SyncState> {
  const run = await latestSyncRun(db);
  if (!run) return EMPTY;
  const stale = now - Date.parse(run.receivedAt) > SYNC_STALE_MS;
  const state = !run.triggerInstalled ? 'disabled' : run.failed > 0 ? 'attention' : stale ? 'stale' : 'active';
  return {
    ...EMPTY,
    state,
    lastCheckedAt: run.receivedAt,
    triggerInstalled: run.triggerInstalled,
    created: run.created,
    updated: run.updated,
    unchanged: run.unchanged,
    failed: run.failed,
  };
}

const COUNT_KEYS = ['created', 'updated', 'unchanged', 'failed'] as const;

function parseRun(input: unknown): Required<Omit<SyncRunInput, 'checkedAt'>> & { checkedAt?: string } {
  if (!input || typeof input !== 'object') throw new ValidationError('同步状态格式无效。');
  const value = input as Record<string, unknown>;
  if (typeof value.triggerInstalled !== 'boolean') throw new ValidationError('缺少 Google 触发器实际安装状态。');

  const counts = {} as Record<(typeof COUNT_KEYS)[number], number>;
  for (const key of COUNT_KEYS) {
    const n = value[key] ?? 0;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_SYNC_COUNT) throw new ValidationError('同步统计无效。');
    counts[key] = n;
  }
  const checkedAt = typeof value.checkedAt === 'string' && !Number.isNaN(Date.parse(value.checkedAt)) ? value.checkedAt : undefined;
  return { triggerInstalled: value.triggerInstalled, ...counts, checkedAt };
}

export async function recordSyncRun(db: D1Database, input: unknown): Promise<SyncState> {
  const run = parseRun(input);
  const now = new Date().toISOString();
  await insertSyncRun(db, { ...run, receivedAt: now, checkedAt: run.checkedAt ?? now });
  return getSyncState(db);
}
