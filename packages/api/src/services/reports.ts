import { DRIVE_FOLDER_ID, TOPICS, validateImport } from '#shared';
import type { IngestResult, Report, ReportsResponse, ValidateImportOptions } from '#shared';
import { existsForDateTopic, findReport, findReportState, readBack, saveReport, selectReports } from '../repositories/reports.ts';
import { getSyncState } from './sync-state.ts';

/** 写入后回读校验失败：数据可能不完整，调用方应重试。 */
export class ReadbackMismatchError extends Error {
  override readonly name = 'ReadbackMismatchError';
  constructor() {
    super('写入后回读校验失败，请重试。');
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

const LEGACY_SEED_SOURCE = '用户提供的历史文案';
const slotKey = (report: Pick<Report, 'date' | 'topic'>) => `${report.date}|${report.topic}`;

/** 日期倒序；同一天按 TOPICS 顺序（综合日报在前）。 */
export function compareReports(a: Report, b: Report): number {
  return b.date.localeCompare(a.date) || TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic);
}

/** 合并随代码发布的历史日报与数据库记录：同 id 以数据库为准，同日期同主题的旧文案被数据库记录取代。 */
export async function listReports(db: D1Database, seeds: readonly Report[]): Promise<Report[]> {
  const stored = await selectReports(db);
  const occupied = new Set(stored.map(slotKey));
  const merged = new Map<string, Report>();
  for (const seed of seeds) {
    if (seed.source === LEGACY_SEED_SOURCE && occupied.has(slotKey(seed))) continue;
    merged.set(seed.id, seed);
  }
  for (const report of stored) merged.set(report.id, report);
  return [...merged.values()].sort(compareReports);
}

/** 按 id 读取一篇：先查库，再查种子；只按需读取这一篇，不加载整个归档。 */
export async function readReport(db: D1Database, seeds: readonly Report[], id: string): Promise<Report | null> {
  const stored = await findReport(db, id);
  if (stored) return stored;
  const seed = seeds.find((report) => report.id === id);
  if (!seed) return null;
  if (seed.source === LEGACY_SEED_SOURCE && (await existsForDateTopic(db, seed.date, seed.topic))) return null;
  return seed;
}

/** GET /api/reports 的完整响应：归档、同步回执与 Drive 导入状态。 */
export async function getArchive(db: D1Database, seeds: readonly Report[], now: Date): Promise<ReportsResponse> {
  const [reports, sync] = await Promise.all([listReports(db, seeds), getSyncState(db, now)]);
  return {
    reports,
    sync,
    drive: { status: reports.some((r) => r.sourceFileId) ? 'imported' : 'not_connected', folderId: DRIVE_FOLDER_ID },
  };
}

/**
 * 校验 → 内容去重 → 保留旧版本 → 写入 → 全文回读。
 * 相同内容不会重复写入；任何一步失败都不会留下半份数据。
 */
export async function ingestReport(db: D1Database, input: unknown, now: Date, options: ValidateImportOptions = {}): Promise<IngestResult> {
  const data = validateImport(input, options);
  const hash = await sha256Hex(data.raw);
  const existing = await findReportState(db, data.id);
  if (existing?.hash === hash) return { id: data.id, status: 'unchanged', hash, revision: existing.revision };

  const savedAt = now.toISOString();
  const revision = (existing?.revision ?? 0) + 1;
  await saveReport(db, { ...data, hash, importedAt: savedAt, revision }, savedAt);

  const stored = await readBack(db, data.id);
  if (stored?.raw !== data.raw || stored?.hash !== hash) throw new ReadbackMismatchError();
  return { id: data.id, status: existing ? 'updated' : 'created', hash, revision };
}
