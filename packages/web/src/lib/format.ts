/** 固定使用 en-US 分组，保证服务端渲染与浏览器输出一致，避免水合差异。 */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** 约 450 字符 / 分钟，至少 1 分钟。 */
export function readMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 450));
}

/** `2026-10-16` → `['10', '16']`；无日期时返回占位符。 */
export function monthDay(date: string | undefined): [string, string] {
  if (!date) return ['—', '—'];
  const [month = '—', day = '—'] = date.slice(5).split('-');
  return [month, day];
}

/** 目录里不需要重复的 ①②③ 序号。 */
export function tocLabel(label: string): string {
  return label.replace(/^[①②③④⑤⑥]\s*/, '');
}

/** 相对时间：「刚刚」「12 分钟前」「3 小时前」「5 天前」；超过 30 天显示日期。now 由调用方传入，便于测试与水合一致。 */
export function timeAgo(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days <= 30 ? `${days} 天前` : iso.slice(0, 10);
}
