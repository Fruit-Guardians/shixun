import {
  DEFAULT_TOPIC,
  MAX_REPORT_BYTES,
  MAX_SYNC_COUNT,
  MAX_SYNC_FAILURE_NAME_CHARS,
  MAX_SYNC_FAILURE_REASON_CHARS,
  MAX_SYNC_FAILURES,
  MIN_REPORT_CHARS,
  TOPICS,
} from './constants.ts';
import { ValidationError } from './errors.ts';
import type { ReportTopic, SyncFailure, ValidatedImport, ValidatedSyncRun } from './types.ts';

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,150}$/;
const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === date;
}

export function isTopic(value: unknown): value is ReportTopic {
  return (TOPICS as readonly unknown[]).includes(value);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

/** 省略 topic 时取默认主题；给了就必须是已知主题，不再静默改写。 */
function asTopic(value: unknown): ReportTopic {
  if (value === undefined || value === null) return DEFAULT_TOPIC;
  if (isTopic(value)) return value;
  throw new ValidationError(`主题应为${TOPICS.map((t) => `「${t}」`).join('或')}。`);
}

export interface ValidateImportOptions {
  /** 程序同步必须带上 Drive 文件 ID（用作稳定的记录标识）。 */
  requireSourceFileId?: boolean;
}

/** 校验导入请求；原文一字不改地保留。失败抛出 ValidationError（消息可直接展示给用户）。 */
export function validateImport(input: unknown, options: ValidateImportOptions = {}): ValidatedImport {
  if (!isRecord(input)) throw new ValidationError('请提交 Markdown 正文和内容日期。');
  const body = input;
  if (options.requireSourceFileId && !body.sourceFileId) throw new ValidationError('同步需要已核实的 Drive 文件 ID。');

  if (typeof body.raw !== 'string' || body.raw.trim().length < MIN_REPORT_CHARS) {
    throw new ValidationError(`正文过短，请导入完整日报（至少 ${MIN_REPORT_CHARS} 字符）。`);
  }
  if (byteLength(body.raw) > MAX_REPORT_BYTES) throw new ValidationError('文件超过 500 KB，请分篇导入。');
  if (!isValidDate(body.date)) throw new ValidationError('内容日期应为有效的 YYYY-MM-DD 日期。');

  const topic = asTopic(body.topic);
  const fileId = typeof body.sourceFileId === 'string' && DRIVE_FILE_ID.test(body.sourceFileId) ? body.sourceFileId : null;
  if (body.sourceFileId && !fileId) throw new ValidationError('Drive 文件 ID 格式无效。');

  return {
    raw: body.raw,
    date: body.date,
    topic,
    id: fileId ? `drive-${fileId}` : `${body.date}_${topic === '安全专题' ? 'security' : 'global'}`,
    title: `${body.date} ${topic}日报`,
    sourceFileId: fileId,
    source: fileId ? 'Google Drive 导入' : '手动导入',
  };
}

const COUNT_KEYS = ['created', 'updated', 'unchanged', 'failed'] as const;

/** 校验 Apps Script 上报的运行回执。无法解析的 checkedAt 视为未提供。 */
export function validateSyncRun(input: unknown): ValidatedSyncRun {
  if (!isRecord(input)) throw new ValidationError('同步状态格式无效。');
  if (typeof input.triggerInstalled !== 'boolean') throw new ValidationError('缺少 Google 触发器实际安装状态。');

  const counts = {} as Record<(typeof COUNT_KEYS)[number], number>;
  for (const key of COUNT_KEYS) {
    const n = input[key] ?? 0;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_SYNC_COUNT) throw new ValidationError('同步统计无效。');
    counts[key] = n;
  }
  const checkedAt = typeof input.checkedAt === 'string' && !Number.isNaN(Date.parse(input.checkedAt)) ? input.checkedAt : null;
  const failures = validateFailures(input.failures);
  if (failures.length > counts.failed) throw new ValidationError('失败明细多于失败计数。');
  return { triggerInstalled: input.triggerInstalled, checkedAt, ...counts, failures };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** 失败明细：省略即为空；文件 ID 必须是 Drive ID，文件名与原因过长时截断而不是拒绝。 */
function validateFailures(input: unknown): SyncFailure[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_SYNC_FAILURES) throw new ValidationError(`失败明细最多 ${MAX_SYNC_FAILURES} 条。`);
  return input.map((item) => {
    if (!isRecord(item) || typeof item.fileId !== 'string' || !DRIVE_FILE_ID.test(item.fileId)) throw new ValidationError('失败明细的文件 ID 无效。');
    if (typeof item.name !== 'string' || typeof item.reason !== 'string') throw new ValidationError('失败明细缺少文件名或原因。');
    return {
      fileId: item.fileId,
      name: clip(item.name.trim(), MAX_SYNC_FAILURE_NAME_CHARS),
      reason: clip(item.reason.trim() || '未知错误', MAX_SYNC_FAILURE_REASON_CHARS),
    };
  });
}
