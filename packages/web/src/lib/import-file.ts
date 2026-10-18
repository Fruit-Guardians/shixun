import { DEFAULT_TOPIC, MAX_REPORT_BYTES } from '#shared';
import type { ReportTopic } from '#shared';

const ACCEPTED_NAME = /\.(md|markdown|txt)$/i;
const DATE_PATTERN = /20\d{2}-\d{2}-\d{2}/;

/** 选择文件时的即时检查；通过则返回 null。 */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (file.size > MAX_REPORT_BYTES) return `文件超过 ${MAX_REPORT_BYTES / 1000} KB。`;
  if (!ACCEPTED_NAME.test(file.name)) return '请选择 .md、.markdown 或 .txt 文件。';
  return null;
}

/** 从文件名与开头 400 字符里猜出日期和主题，仅作为表单预填，提交前用户可修改。 */
export function guessMetadata(name: string, text: string): { date: string; topic: ReportTopic } {
  const date = `${name} ${text.slice(0, 400)}`.match(DATE_PATTERN)?.[0] ?? '';
  const topic: ReportTopic = /安全专题/.test(name) ? '安全专题' : DEFAULT_TOPIC;
  return { date, topic };
}
