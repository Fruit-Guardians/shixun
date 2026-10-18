import { CATEGORIES } from './constants.ts';
import type { Report, ReportDigest, ReportSummary, Section, Story, StorySummary } from './types.ts';

/** 去掉 Markdown 标记，保留可读文字。 */
export function plain(text = ''): string {
  return text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

type TagRule = readonly [tag: (typeof CATEGORIES)[number], pattern: RegExp];

/** 确定性关键词规则，不代表对技术结论的独立核验。多标签，按规则顺序输出。 */
const TAG_RULES: readonly TagRule[] = [
  ['二进制安全', /内核|kernel|二进制(?!曲线)|逆向|reverse.engineer|Binder|UAF|反作弊|Vanguard|Frida|Android root|KVM|Firecracker|microVM/i],
  ['Web 安全', /web.?安全|XSS|SQL.?注入|SSRF|OAuth|Deep Link|会话劫持|账号接管|认证绕过|Connect Secure/i],
  ['网安', /安全|漏洞|CVE-|沙箱|CERT|KEV|投毒|安全扫描|密钥|exploit|bounty|MOTW/i],
  ['AI', /\bAI\b|Agent|LLM|模型|推理|Claude|Gemini|OpenAI|RL|METR|机器学习|Neural|神经元/i],
  ['开源社区', /开源|Apache|GitHub|许可证|权重|仓库/i],
  ['软件工程', /编码|coding|代码|工具|性能|设计|软件|开发者|terminal|编排|QuickJS|WASM|Terminal-Bench/i],
];
const FALLBACK_TAG = '互联网资讯';

export function tagsFor(text: string): string[] {
  const tags = TAG_RULES.filter(([, rule]) => rule.test(text)).map(([tag]) => tag);
  return tags.length ? tags : [FALLBACK_TAG];
}

const SECTION_HEADING = /^[①②③④⑤⑥]|^如果我今天只有|^只有\s*10\s*分钟/;
/** 旧格式的条目标题没有编号，靠「下一行以 作者： 或 多源讨论 开头」识别。 */
const NOT_A_TITLE = /^[-*#（]|^按技术|^作者|^原始|^相关|^热度/;
const NUMBERED_TITLE = /^\d+\.\s+\*\*/;
const LEGACY_TITLE_NEXT = /^(作者[：:]|多源讨论)/;

export function isSectionHeading(plainLine: string): boolean {
  return SECTION_HEADING.test(plainLine);
}
export function isNumberedTitle(line: string): boolean {
  return NUMBERED_TITLE.test(line);
}
export function isLegacyTitle(line: string, nextNonEmptyLine: string): boolean {
  return Boolean(line) && !NOT_A_TITLE.test(line) && LEGACY_TITLE_NEXT.test(nextNonEmptyLine);
}

export function sectionsFor(raw: string): Section[] {
  return raw
    .split(/\r?\n/)
    .map((line, index) => ({ line: plain(line), index }))
    .filter((entry) => SECTION_HEADING.test(entry.line))
    .map((entry, i) => ({ id: `section-${i}`, label: entry.line, index: entry.index }));
}

/** 取出「① 昨日重要动态」章节里的每一条动态。 */
export function storiesFor(report: Pick<Report, 'id' | 'raw' | 'date' | 'topic'>): Story[] {
  const lines = report.raw.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^①/.test(plain(l)));
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && /^②/.test(plain(l)));
  if (end < 0) end = lines.length;

  const body = lines.slice(start + 1, end);
  const starts: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const line = body[i].trim();
    if (isNumberedTitle(line)) {
      starts.push(i);
      continue;
    }
    const next = body.slice(i + 1).find((l) => l.trim())?.trim() ?? '';
    if (isLegacyTitle(line, next)) starts.push(i);
  }

  return starts.map((index, i) => {
    const block = body.slice(index, starts[i + 1] ?? body.length).join('\n').trim();
    const title = plain(body[index]).replace(/^\d+\.\s*/, '').replace(/^标题[：:]\s*/, '');
    const clean = plain(block);
    const summaryLine = block.split('\n').map(plain).find((l) => /^发生了什么[：:]/.test(l));
    const summary = summaryLine?.replace(/^发生了什么[：:]\s*/, '') ?? clean.slice(title.length).trim();
    return {
      id: `${report.id}--${i}`,
      index: i,
      title,
      summary,
      body: clean,
      tags: tagsFor(`${title}\n${summary}`),
      reportId: report.id,
      date: report.date,
      topic: report.topic,
    };
  });
}

export function countLinks(raw: string): number {
  return (raw.match(/https?:\/\/[^\s]+/g) ?? []).length;
}

/**
 * 解析规则版本。改动 storiesFor / tagsFor / countLinks 的输出时加一，
 * 服务端会据此重建已存储的动态与统计。
 */
export const DIGEST_VERSION = 1;

type DigestSource = Pick<Report, 'id' | 'raw' | 'date' | 'topic'>;

export function digestFor(report: DigestSource): ReportDigest {
  return { chars: report.raw.length, links: countLinks(report.raw), stories: storiesFor(report) };
}

export function storySummary(story: Story): StorySummary {
  const { body, ...summary } = story;
  return summary;
}

/** 完整日报 → 列表条目（去掉原文与动态正文）。 */
export function reportSummary(report: Report, digest: ReportDigest = digestFor(report)): ReportSummary {
  const { raw, ...meta } = report;
  return { ...meta, chars: digest.chars, links: digest.links, stories: digest.stories.map(storySummary) };
}

/** 搜索匹配规则（前后端一致）：不区分大小写的字面子串。 */
export function storyMatches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.trim().toLowerCase());
}
