import { DIGEST_VERSION, DRIVE_FOLDER_ID, MAX_LISTED_VERSIONS, TOPICS, digestFor, reportSummary, storyMatches, validateImport } from '#shared';
import type {
  IngestResult,
  Report,
  ReportDigest,
  ReportSummary,
  ReportVersionsResponse,
  ReportsResponse,
  SearchResponse,
  ValidateImportOptions,
  ValidatedImport,
} from '#shared';
import {
  deleteReportRows,
  existsForDateTopic,
  findReport,
  findReportState,
  findVersion,
  readBack,
  saveReport,
  searchStoryRows,
  selectRaw,
  selectReportMeta,
  selectStorySummaries,
  selectVersions,
  writeDigests,
} from '../repositories/reports.ts';
import type { ReportMeta } from '../repositories/reports.ts';
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
type Slot = Pick<Report, 'id' | 'date' | 'topic'>;
const slotKey = (report: Pick<Report, 'date' | 'topic'>) => `${report.date}|${report.topic}`;

/** 日期倒序；同一天按 TOPICS 顺序（综合日报在前）。 */
export function compareReports(a: Pick<Report, 'date' | 'topic'>, b: Pick<Report, 'date' | 'topic'>): number {
  return b.date.localeCompare(a.date) || TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic);
}

/** 仍然可见的种子：同 id 以数据库为准；同日期同主题的旧文案被数据库记录取代。 */
function visibleSeeds(seeds: readonly Report[], stored: readonly Slot[]): Report[] {
  const ids = new Set(stored.map((r) => r.id));
  const occupied = new Set(stored.map(slotKey));
  return seeds.filter((seed) => !ids.has(seed.id) && !(seed.source === LEGACY_SEED_SOURCE && occupied.has(slotKey(seed))));
}

/** 种子随代码发布、不会变化，派生数据每个种子数组只算一次。 */
const seedDigests = new WeakMap<readonly Report[], Map<string, ReportDigest>>();
function digestsOfSeeds(seeds: readonly Report[]): Map<string, ReportDigest> {
  let digests = seedDigests.get(seeds);
  if (!digests) {
    digests = new Map(seeds.map((seed) => [seed.id, digestFor(seed)]));
    seedDigests.set(seeds, digests);
  }
  return digests;
}

/** 每次请求最多回写多少期的派生数据，避免一次升级把单个请求拖得太重；其余的本次在内存里计算。 */
export const DIGEST_HEAL_LIMIT = 20;

/**
 * 读取库内日报元数据；派生数据缺失或版本落后的那几期，读原文重新解析。
 * 返回 `pending`：本次在内存中算出、尚未（全部）写回库的派生数据，调用方应以它为准。
 */
async function loadStoredMeta(db: D1Database): Promise<{ meta: ReportMeta[]; pending: Map<string, ReportDigest> }> {
  const meta = await selectReportMeta(db);
  const stale = meta.filter((r) => r.digestVersion !== DIGEST_VERSION);
  const pending = new Map<string, ReportDigest>();
  if (stale.length === 0) return { meta, pending };

  const raw = await selectRaw(db, stale.map((r) => r.id));
  for (const report of stale) {
    const text = raw.get(report.id);
    if (text !== undefined) pending.set(report.id, digestFor({ ...report, raw: text }));
  }
  const healed = [...pending].slice(0, DIGEST_HEAL_LIMIT).map(([id, digest]) => ({ id, digest }));
  await writeDigests(db, healed, DIGEST_VERSION);
  for (const { id } of healed) pending.delete(id);
  // 回写的那几期以库内数据为准；元数据里的统计也同步刷新。
  const refreshed = new Map(healed.map(({ id, digest }) => [id, digest]));
  return {
    meta: meta.map((r) => {
      const digest = refreshed.get(r.id) ?? pending.get(r.id);
      return digest ? { ...r, chars: digest.chars, links: digest.links, digestVersion: DIGEST_VERSION } : r;
    }),
    pending,
  };
}

/** 列表：元数据 + 动态摘要，不含原文与动态正文。 */
export async function listReports(db: D1Database, seeds: readonly Report[]): Promise<ReportSummary[]> {
  const { meta, pending } = await loadStoredMeta(db);
  const storedStories = await selectStorySummaries(db);
  const seedDigest = digestsOfSeeds(seeds);

  const stored: ReportSummary[] = meta.map(({ digestVersion, ...report }) => {
    const inMemory = pending.get(report.id);
    if (inMemory) return reportSummary({ ...report, raw: '' }, inMemory);
    const stories = (storedStories.get(report.id) ?? []).map((s) => ({ ...s, date: report.date, topic: report.topic }));
    return { ...report, stories };
  });
  const seeded = visibleSeeds(seeds, meta).map((seed) => reportSummary(seed, seedDigest.get(seed.id)));
  return [...seeded, ...stored].sort(compareReports);
}

/** 全文搜索：动态标题与正文的字面子串，不区分大小写。只返回列表里可见的动态。 */
export async function searchReports(db: D1Database, seeds: readonly Report[], query: string): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) return { query: '', storyIds: [] };
  const needle = q.toLowerCase();

  const { meta, pending } = await loadStoredMeta(db);
  const fromDb = (await searchStoryRows(db, needle)).filter((hit) => !pending.has(hit.reportId)).map((hit) => `${hit.reportId}--${hit.index}`);

  const inMemory = (digest: ReportDigest | undefined) =>
    (digest?.stories ?? []).filter((s) => storyMatches(`${s.title}\n${s.body}`, needle)).map((s) => s.id);
  const seedDigest = digestsOfSeeds(seeds);
  const fromPending = [...pending.values()].flatMap(inMemory);
  const fromSeeds = visibleSeeds(seeds, meta).flatMap((seed) => inMemory(seedDigest.get(seed.id)));

  return { query: q, storyIds: [...fromSeeds, ...fromDb, ...fromPending] };
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
 * 校验 → 内容去重 → 保留旧版本 → 写入（含派生数据）→ 全文回读。
 * 相同内容不会重复写入；任何一步失败都不会留下半份数据。
 */
export async function ingestReport(db: D1Database, input: unknown, now: Date, options: ValidateImportOptions = {}): Promise<IngestResult> {
  const data = validateImport(input, options);
  const hash = await sha256Hex(data.raw);
  const existing = await findReportState(db, data.id);
  if (existing?.hash === hash) return { id: data.id, status: 'unchanged', hash, revision: existing.revision };
  return writeVerified(db, data, hash, existing !== null, now);
}

/** 写入一个新版本并回读校验；版本号以库内递增后的值为准。 */
async function writeVerified(db: D1Database, data: ValidatedImport, hash: string, existed: boolean, now: Date): Promise<IngestResult> {
  const savedAt = now.toISOString();
  await saveReport(db, { ...data, hash, importedAt: savedAt }, digestFor(data), DIGEST_VERSION, savedAt);

  const stored = await readBack(db, data.id);
  if (stored?.raw !== data.raw || stored?.hash !== hash) throw new ReadbackMismatchError();
  return { id: data.id, status: existed ? 'updated' : 'created', hash, revision: stored.revision };
}

/** 一期的当前版本与历史版本。种子没有历史；不存在（或已被取代的旧种子）返回 null。 */
export async function listVersions(db: D1Database, seeds: readonly Report[], id: string): Promise<ReportVersionsResponse | null> {
  const stored = await findReport(db, id);
  const report = stored ?? (await readReport(db, seeds, id));
  if (!report) return null;
  const current = { revision: report.revision ?? 1, hash: await sha256Hex(report.raw), importedAt: report.importedAt, chars: [...report.raw].length };
  const { versions, truncated } = await selectVersions(db, id, MAX_LISTED_VERSIONS);
  return { reportId: id, stored: stored !== null, current, versions, truncated };
}

/** 某个历史版本的原文；版本必须属于这一期。 */
export async function readVersion(db: D1Database, id: string, versionId: string): Promise<{ raw: string; savedAt: string } | null> {
  return findVersion(db, id, versionId);
}

export type RestoreOutcome = { result: IngestResult } | { missing: 'report' | 'version' };

/** 把某个历史版本恢复为当前版本：作为新版本写入，当前内容照常进入历史，不丢任何一版。 */
export async function restoreVersion(db: D1Database, id: string, versionId: string, now: Date): Promise<RestoreOutcome> {
  const current = await findReport(db, id);
  if (!current) return { missing: 'report' };
  const version = await findVersion(db, id, versionId);
  if (!version) return { missing: 'version' };

  const hash = await sha256Hex(version.raw);
  const currentHash = await sha256Hex(current.raw);
  if (hash === currentHash) return { result: { id, status: 'unchanged', hash, revision: current.revision ?? 1 } };
  const { importedAt, revision, ...meta } = current;
  return { result: await writeVerified(db, { ...meta, raw: version.raw }, hash, true, now) };
}

export type DeleteOutcome = 'deleted' | 'seed' | 'missing';

/** 删除库内的一期（当前版本留在历史里）。随代码发布的种子不能删除。 */
export async function deleteReport(db: D1Database, seeds: readonly Report[], id: string, now: Date): Promise<DeleteOutcome> {
  if (await findReportState(db, id)) {
    await deleteReportRows(db, id, now.toISOString());
    return 'deleted';
  }
  return (await readReport(db, seeds, id)) ? 'seed' : 'missing';
}
