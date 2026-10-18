import type { Report, ReportDigest, ReportTopic, StorySummary } from '#shared';

/** reports / report_stories 的 SQL 全在这里。列名显式列出，列表路径从不读取原文。 */

/** D1 单条语句最多绑定 100 个参数。 */
const MAX_BOUND_PARAMS = 100;

export interface ReportMeta extends Omit<Report, 'raw'> {
  chars: number;
  links: number;
  digestVersion: number;
}

interface MetaRow {
  id: string;
  date: string;
  title: string;
  topic: string;
  source: string;
  source_file_id: string | null;
  imported_at: string;
  revision: number;
  char_count: number;
  link_count: number;
  digest_version: number;
}

const META_COLUMNS = 'id,date,title,topic,source,source_file_id,imported_at,revision,char_count,link_count,digest_version';

function toMeta(row: MetaRow): ReportMeta {
  return {
    id: String(row.id),
    date: String(row.date),
    title: String(row.title),
    topic: String(row.topic) as ReportTopic,
    source: String(row.source),
    sourceFileId: row.source_file_id ? String(row.source_file_id) : null,
    importedAt: String(row.imported_at),
    revision: Number(row.revision),
    chars: Number(row.char_count),
    links: Number(row.link_count),
    digestVersion: Number(row.digest_version),
  };
}

export async function selectReportMeta(db: D1Database): Promise<ReportMeta[]> {
  const { results } = await db.prepare(`SELECT ${META_COLUMNS} FROM reports ORDER BY date DESC`).all<MetaRow>();
  return (results ?? []).map(toMeta);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 只为需要重建摘要的那几期读取原文。 */
export async function selectRaw(db: D1Database, ids: readonly string[]): Promise<Map<string, string>> {
  const raw = new Map<string, string>();
  for (const group of chunk(ids, MAX_BOUND_PARAMS)) {
    const placeholders = group.map(() => '?').join(',');
    const { results } = await db.prepare(`SELECT id, raw FROM reports WHERE id IN (${placeholders})`).bind(...group).all<{ id: string; raw: string }>();
    for (const row of results ?? []) raw.set(String(row.id), String(row.raw));
  }
  return raw;
}

interface StoryRow {
  report_id: string;
  idx: number;
  title: string;
  summary: string;
  tags: string;
}

/** 所有动态的摘要（不含正文），按期分组。 */
export async function selectStorySummaries(db: D1Database): Promise<Map<string, Omit<StorySummary, 'date' | 'topic'>[]>> {
  const { results } = await db.prepare('SELECT report_id,idx,title,summary,tags FROM report_stories ORDER BY report_id, idx').all<StoryRow>();
  const grouped = new Map<string, Omit<StorySummary, 'date' | 'topic'>[]>();
  for (const row of results ?? []) {
    const reportId = String(row.report_id);
    const index = Number(row.idx);
    const list = grouped.get(reportId) ?? [];
    list.push({ id: `${reportId}--${index}`, index, reportId, title: String(row.title), summary: String(row.summary), tags: JSON.parse(String(row.tags)) as string[] });
    grouped.set(reportId, list);
  }
  return grouped;
}

/** 在动态标题与正文里找字面子串；needle 须已转为小写（SQLite lower() 只处理 ASCII）。 */
export async function searchStoryRows(db: D1Database, needle: string): Promise<{ reportId: string; index: number }[]> {
  const { results } = await db
    .prepare("SELECT report_id, idx FROM report_stories WHERE instr(lower(title || char(10) || body), ?) > 0 ORDER BY report_id, idx")
    .bind(needle)
    .all<{ report_id: string; idx: number }>();
  return (results ?? []).map((row) => ({ reportId: String(row.report_id), index: Number(row.idx) }));
}

const STORY_COLUMNS = 6;

/** 写入一期的派生数据：统计列 + 全量替换动态行。返回语句，由调用方放进同一个 batch。 */
export function digestStatements(db: D1Database, reportId: string, digest: ReportDigest, version: number): D1PreparedStatement[] {
  const statements = [
    db.prepare('UPDATE reports SET char_count = ?, link_count = ?, digest_version = ? WHERE id = ?').bind(digest.chars, digest.links, version, reportId),
    db.prepare('DELETE FROM report_stories WHERE report_id = ?').bind(reportId),
  ];
  for (const group of chunk(digest.stories, Math.floor(MAX_BOUND_PARAMS / STORY_COLUMNS))) {
    const placeholders = group.map(() => '(?,?,?,?,?,?)').join(',');
    const values = group.flatMap((s) => [reportId, s.index, s.title, s.summary, s.body, JSON.stringify(s.tags)]);
    statements.push(db.prepare(`INSERT INTO report_stories (report_id,idx,title,summary,body,tags) VALUES ${placeholders}`).bind(...values));
  }
  return statements;
}

export async function writeDigests(db: D1Database, entries: readonly { id: string; digest: ReportDigest }[], version: number): Promise<void> {
  if (entries.length === 0) return;
  await db.batch(entries.flatMap(({ id, digest }) => digestStatements(db, id, digest, version)));
}

const REPORT_COLUMNS = 'id,date,title,topic,source,source_file_id,raw,imported_at,revision';

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

export async function findReport(db: D1Database, id: string): Promise<Report | null> {
  const row = await db.prepare(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = ?`).bind(id).first<ReportRow>();
  if (!row) return null;
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
 * 原子地：先在库内把当前版本复制进历史（全文不经过 Worker），再写入新版本及其派生数据。
 * 记录不存在时复制语句不产生任何行。
 */
export async function saveReport(db: D1Database, next: ReportWrite, digest: ReportDigest, digestVersion: number, savedAt: string): Promise<void> {
  await db.batch([
    db.prepare(ARCHIVE_PREVIOUS).bind(crypto.randomUUID(), savedAt, next.id),
    db
      .prepare(UPSERT)
      .bind(next.id, next.date, next.title, next.topic, next.source, next.sourceFileId, next.raw, next.importedAt, next.revision, next.hash),
    ...digestStatements(db, next.id, digest, digestVersion),
  ]);
}

export async function readBack(db: D1Database, id: string): Promise<{ raw: string; hash: string } | null> {
  const row = await db.prepare('SELECT raw, hash FROM reports WHERE id = ?').bind(id).first<{ raw: string; hash: string }>();
  return row ? { raw: String(row.raw), hash: String(row.hash) } : null;
}
