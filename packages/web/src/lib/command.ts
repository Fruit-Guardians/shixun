/** 「grep 漏洞」「grep -i 漏洞」与直接输入「漏洞」都按搜索词处理。 */
export function searchTerm(input: string): string {
  return input.replace(/^\s*grep(\s+-i)?(\s+|$)/i, '').trim();
}
