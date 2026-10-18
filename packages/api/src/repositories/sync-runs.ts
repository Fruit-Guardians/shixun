import type { ValidatedSyncRun } from '#shared';

interface SyncRunRow {
  received_at: string;
  trigger_installed: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  failed_count: number;
}

export interface SyncRun {
  receivedAt: string;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

/** 依赖 sync_runs_received_at_idx，不做全表扫描。 */
export async function latestSyncRun(db: D1Database): Promise<SyncRun | null> {
  const row = await db
    .prepare(
      'SELECT received_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count FROM sync_runs ORDER BY received_at DESC, rowid DESC LIMIT 1',
    )
    .first<SyncRunRow>();
  if (!row) return null;
  return {
    receivedAt: String(row.received_at),
    triggerInstalled: Boolean(row.trigger_installed),
    created: Number(row.created_count),
    updated: Number(row.updated_count),
    unchanged: Number(row.unchanged_count),
    failed: Number(row.failed_count),
  };
}

export interface SyncRunInsert extends Omit<ValidatedSyncRun, 'checkedAt'> {
  receivedAt: string;
  checkedAt: string;
}

export async function insertSyncRun(db: D1Database, run: SyncRunInsert): Promise<void> {
  await db
    .prepare(
      'INSERT INTO sync_runs (id,received_at,checked_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), run.receivedAt, run.checkedAt, run.triggerInstalled ? 1 : 0, run.created, run.updated, run.unchanged, run.failed)
    .run();
}
