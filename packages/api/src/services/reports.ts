import type { IngestResult, Report } from '#shared';
import { validateImport } from '#shared';
import { findReport, readBack, saveReport, selectReports } from '../repositories/reports.ts';

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

/** 合并随代码发布的历史日报与数据库记录，按日期倒序（同日综合日报在前）。 */
export async function listReports(db: D1Database, seeds: readonly Report[]): Promise<Report[]> {
  const merged = new Map<string, Report>(seeds.map((seed) => [seed.id, seed]));
  for (const report of await selectReports(db)) {
    for (const [id, seed] of merged) {
      if (seed.source === LEGACY_SEED_SOURCE && seed.date === report.date && seed.topic === report.topic) merged.delete(id);
    }
    merged.set(report.id, report);
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || (a.topic === '全球技术社区' ? -1 : 1));
}

export async function readReport(db: D1Database, seeds: readonly Report[], id: string): Promise<Report | undefined> {
  return (await listReports(db, seeds)).find((report) => report.id === id);
}

/**
 * 校验 → 内容去重 → 保留旧版本 → 写入 → 全文回读。
 * 相同内容不会重复写入；任何一步失败都不会留下半份数据。
 */
export async function ingestReport(db: D1Database, input: unknown): Promise<IngestResult> {
  const data = validateImport(input);
  const hash = await sha256Hex(data.raw);
  const existing = await findReport(db, data.id);
  if (existing?.hash === hash) return { id: data.id, status: 'unchanged', hash, revision: existing.revision ?? 1 };

  const now = new Date().toISOString();
  const revision = (existing?.revision ?? 0) + 1;
  await saveReport(db, { ...data, hash, importedAt: now, revision }, existing, now);

  const stored = await readBack(db, data.id);
  if (stored?.raw !== data.raw || stored?.hash !== hash) throw new ReadbackMismatchError();
  return { id: data.id, status: existing ? 'updated' : 'created', hash, revision };
}
