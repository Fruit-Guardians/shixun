type Row = Record<string, unknown>;

export interface SyncRunRow {
  receivedAt: string;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export async function latestSyncRun(db: D1Database): Promise<SyncRunRow | null> {
  const row = await db.prepare('SELECT * FROM sync_runs ORDER BY received_at DESC, rowid DESC LIMIT 1').first<Row>();
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

export interface SyncRunInsert {
  receivedAt: string;
  checkedAt: string;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export async function insertSyncRun(db: D1Database, run: SyncRunInsert): Promise<void> {
  await db
    .prepare(
      'INSERT INTO sync_runs (id,received_at,checked_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), run.receivedAt, run.checkedAt, run.triggerInstalled ? 1 : 0, run.created, run.updated, run.unchanged, run.failed)
    .run();
}
