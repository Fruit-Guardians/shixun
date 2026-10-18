/** 阅读页地址：`#report=<id>`。可分享、可前进后退，刷新后仍停留在同一期。 */
export function parseReportId(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, '')).get('report') ?? '';
}

export function reportHash(id: string): string {
  return new URLSearchParams({ report: id }).toString();
}
