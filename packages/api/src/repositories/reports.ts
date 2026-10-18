import type { Report, ReportTopic } from '#shared';

/** reports 表的 SQL 全在这里。列名显式列出，避免把不需要的列（hash）读出来。 */
interface ReportRow {
  id: string;
  date: string;
  title: string;
  topic: string;
  source: string;
  source_file_id: string | null;
  raw: string;
  imported_at: string;
  revision: number;
}

const REPORT_COLUMNS = 'id,date,title,topic,source,source_file_id,raw,imported_at,revision';

function toReport(row: ReportRow): Report {
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
  const { results } = await db.prepare(`SELECT ${REPORT_COLUMNS} FROM reports ORDER BY date DESC`).all<ReportRow>();
  return (results ?? []).map(toReport);
}

export async function findReport(db: D1Database, id: string): Promise<Report | null> {
  const row = await db.prepare(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = ?`).bind(id).first<ReportRow>();
  return row ? toReport(row) : null;
}

/** 去重与计算版本号只需要摘要和版本，不读全文。 */
export async function findReportState(db: D1Database, id: string): Promise<{ hash: string; revision: number } | null> {
  const row = await db.prepare('SELECT hash, revision FROM reports WHERE id = ?').bind(id).first<{ hash: string; revision: number }>();
  return row ? { hash: String(row.hash), revision: Number(row.revision) } : null;
}

export async function existsForDateTopic(db: D1Database, date: string, topic: ReportTopic): Promise<boolean> {
  return (await db.prepare('SELECT 1 AS found FROM reports WHERE date = ? AND topic = ? LIMIT 1').bind(date, topic).first()) !== null;
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

const ARCHIVE_PREVIOUS = 'INSERT INTO report_versions (id,report_id,raw,hash,saved_at) SELECT ?, id, raw, hash, ? FROM reports WHERE id = ?';

const UPSERT = `INSERT INTO reports (${REPORT_COLUMNS},hash) VALUES (?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET date=excluded.date,title=excluded.title,topic=excluded.topic,raw=excluded.raw,hash=excluded.hash,source=excluded.source,source_file_id=excluded.source_file_id,imported_at=excluded.imported_at,revision=excluded.revision`;

/**
 * 原子地：先在库内把当前版本复制进历史（全文不经过 Worker），再写入新版本。
 * 记录不存在时复制语句不产生任何行。
 */
export async function saveReport(db: D1Database, next: ReportWrite, savedAt: string): Promise<void> {
  await db.batch([
    db.prepare(ARCHIVE_PREVIOUS).bind(crypto.randomUUID(), savedAt, next.id),
    db
      .prepare(UPSERT)
      .bind(next.id, next.date, next.title, next.topic, next.source, next.sourceFileId, next.raw, next.importedAt, next.revision, next.hash),
  ]);
}

export async function readBack(db: D1Database, id: string): Promise<{ raw: string; hash: string } | null> {
  const row = await db.prepare('SELECT raw, hash FROM reports WHERE id = ?').bind(id).first<{ raw: string; hash: string }>();
  return row ? { raw: String(row.raw), hash: String(row.hash) } : null;
}
