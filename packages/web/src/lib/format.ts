/** 固定使用 en-US 分组，保证服务端渲染与浏览器输出一致，避免水合差异。 */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** 约 450 字符 / 分钟，至少 1 分钟。 */
export function readMinutes(raw: string): number {
  return Math.max(1, Math.round(raw.length / 450));
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
