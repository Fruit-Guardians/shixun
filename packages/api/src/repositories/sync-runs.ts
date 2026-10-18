import type { SyncFailure, ValidatedSyncRun } from '#shared';

interface SyncRunRow {
  received_at: string;
  trigger_installed: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  failed_count: number;
  failures: string;
}

export interface SyncRun {
  receivedAt: string;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  failures: SyncFailure[];
}

/** 列在写入时已校验；读出时仍然防御一下损坏的 JSON，不让一行坏数据拖垮状态页。 */
function parseFailures(text: string): SyncFailure[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? (value as SyncFailure[]) : [];
  } catch {
    return [];
  }
}

/** 依赖 sync_runs_received_at_idx，不做全表扫描。 */
export async function latestSyncRun(db: D1Database): Promise<SyncRun | null> {
  const row = await db
    .prepare(
      'SELECT received_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count,failures FROM sync_runs ORDER BY received_at DESC, rowid DESC LIMIT 1',
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
    failures: parseFailures(String(row.failures ?? '[]')),
  };
}

export interface SyncRunInsert extends Omit<ValidatedSyncRun, 'checkedAt'> {
  receivedAt: string;
  checkedAt: string;
}

/** 写入一条回执，并在同一个 batch 里删掉 pruneBefore 之前的旧回执（走 received_at 索引）。 */
export async function insertSyncRun(db: D1Database, run: SyncRunInsert, pruneBefore: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        'INSERT INTO sync_runs (id,received_at,checked_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count,failures) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        run.receivedAt,
        run.checkedAt,
        run.triggerInstalled ? 1 : 0,
        run.created,
        run.updated,
        run.unchanged,
        run.failed,
        JSON.stringify(run.failures),
      ),
    db.prepare('DELETE FROM sync_runs WHERE received_at < ?').bind(pruneBefore),
  ]);
}
