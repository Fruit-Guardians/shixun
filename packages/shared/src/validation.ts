import { DEFAULT_TOPIC, MAX_REPORT_BYTES, MIN_REPORT_CHARS } from './constants.ts';
import { ValidationError } from './errors.ts';
import type { ReportTopic, ValidatedImport } from './types.ts';

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

function asTopic(value: unknown): ReportTopic {
  return value === '安全专题' ? '安全专题' : DEFAULT_TOPIC;
}

/** 校验导入请求；原文一字不改地保留。失败抛出 ValidationError（消息可直接展示给用户）。 */
export function validateImport(input: unknown): ValidatedImport {
  if (!input || typeof input !== 'object') throw new ValidationError('请提交 Markdown 正文和内容日期。');
  const body = input as Record<string, unknown>;

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
