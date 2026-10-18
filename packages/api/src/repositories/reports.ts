import type { Report, ReportTopic } from '#shared';

/** D1 里 reports 表的一行。所有 SQL 集中在 repositories 目录。 */
type Row = Record<string, unknown>;

export interface StoredReport extends Report {
  hash: string;
}

function toReport(row: Row): Report {
  return {
    id: String(row.id),
    date: String(row.date),
    title: String(row.title),
    topic: String(row.topic) as ReportTopic,
    source: String(row.source),
    sourceFileId: row.source_file_id ? String(row.source_file_id) : null,
    raw: String(row.raw),
    importedAt: String(row.imported_at),
    revision: Number(row.revision),
  };
}

export async function selectReports(db: D1Database): Promise<Report[]> {
  const { results } = await db.prepare('SELECT * FROM reports ORDER BY date DESC').all<Row>();
  return (results ?? []).map(toReport);
}

export async function findReport(db: D1Database, id: string): Promise<StoredReport | null> {
  const row = await db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<Row>();
  return row ? { ...toReport(row), hash: String(row.hash) } : null;
}

export interface ReportWrite {
  id: string;
  date: string;
  title: string;
  topic: ReportTopic;
  raw: string;
  hash: string;
  source: string;
  sourceFileId: string | null;
  importedAt: string;
  revision: number;
}

const UPSERT = `INSERT INTO reports (id,date,title,topic,raw,hash,source,source_file_id,imported_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET date=excluded.date,title=excluded.title,topic=excluded.topic,raw=excluded.raw,hash=excluded.hash,source=excluded.source,source_file_id=excluded.source_file_id,imported_at=excluded.imported_at,revision=excluded.revision`;

/** 原子地：先把旧版本存入历史，再写入新版本。 */
export async function saveReport(db: D1Database, next: ReportWrite, previous: StoredReport | null, savedAt: string): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (previous) {
    statements.push(
      db
        .prepare('INSERT INTO report_versions (id,report_id,raw,hash,saved_at) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(), previous.id, previous.raw, previous.hash, savedAt),
    );
  }
  statements.push(
    db
      .prepare(UPSERT)
      .bind(next.id, next.date, next.title, next.topic, next.raw, next.hash, next.source, next.sourceFileId, next.importedAt, next.revision),
  );
  await db.batch(statements);
}

export async function readBack(db: D1Database, id: string): Promise<{ raw: string; hash: string } | null> {
  const row = await db.prepare('SELECT raw, hash FROM reports WHERE id = ?').bind(id).first<Row>();
  return row ? { raw: String(row.raw), hash: String(row.hash) } : null;
}
