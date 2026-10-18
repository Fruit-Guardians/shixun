import { SYNC_RUN_RETENTION_MS, SYNC_STALE_MS, validateSyncRun } from '#shared';
import type { SyncState } from '#shared';
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
  failures: [],
  legacyWriterDisabled: true,
};

/** 只反映 Google 脚本真实上报的回执；没有回执就是「等待授权」，绝不伪造运行状态。 */
export async function getSyncState(db: D1Database, now: Date): Promise<SyncState> {
  const run = await latestSyncRun(db);
  if (!run) return EMPTY;
  const stale = now.getTime() - Date.parse(run.receivedAt) > SYNC_STALE_MS;
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
    failures: run.failures,
  };
}

export async function recordSyncRun(db: D1Database, input: unknown, now: Date): Promise<SyncState> {
  const run = validateSyncRun(input);
  const receivedAt = now.toISOString();
  const pruneBefore = new Date(now.getTime() - SYNC_RUN_RETENTION_MS).toISOString();
  await insertSyncRun(db, { ...run, receivedAt, checkedAt: run.checkedAt ?? receivedAt }, pruneBefore);
  return getSyncState(db, now);
}
