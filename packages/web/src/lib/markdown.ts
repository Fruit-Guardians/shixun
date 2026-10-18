import { isLegacyTitle, isNumberedTitle, isSectionHeading, plain } from '#shared';

/** 只放行 http(s) 链接，其余协议（javascript:、data: 等）一律当作纯文字。 */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'code'; text: string };

const INLINE_TOKENS = /(\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>，；（）]+|\*\*[^*]+\*\*|`[^`]+`)/g;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  for (const token of text.split(INLINE_TOKENS)) {
    if (!token) continue;

    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      nodes.push(href ? { type: 'link', label: link[1], href } : { type: 'text', text: link[1] });
      continue;
    }
    if (/^https?:\/\//.test(token)) {
      const href = safeHref(token);
      nodes.push(href ? { type: 'link', label: token, href } : { type: 'text', text: token });
      continue;
    }
    if (token.length > 4 && token.startsWith('**') && token.endsWith('**')) {
      nodes.push({ type: 'strong', children: parseInline(token.slice(2, -2)) });
      continue;
    }
    if (token.length > 2 && token.startsWith('`') && token.endsWith('`')) {
      nodes.push({ type: 'code', text: token.slice(1, -1) });
      continue;
    }
    nodes.push({ type: 'text', text: token });
  }
  return nodes;
}

export type MarkdownBlock =
  | { type: 'h1'; nodes: InlineNode[] }
  | { type: 'h2'; id: string; nodes: InlineNode[] }
  | { type: 'h3'; id?: string; nodes: InlineNode[] }
  | { type: 'p'; tone?: 'source' | 'aside'; nodes: InlineNode[] };

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const SOURCE_LINE = /^(原始|相关|GitHub|热度)/;
const ASIDE_LINE = /^（/;

/**
 * 把日报原文解析成块。章节 id 为 `section-N`，「① 昨日重要动态」里的条目 id 为 `story-N`，
 * 与 `sectionsFor` / `storiesFor` 的序号一一对应，页面据此跳转与高亮目录。
 */
export function parseMarkdown(raw: string): MarkdownBlock[] {
  const lines = raw.replace(FRONT_MATTER, '').split(/\r?\n/);
  const firstContent = lines.findIndex((line) => line.trim());

  // nextContent[i] = 第 i 行之后的第一个非空行，避免对每一行重复扫描。
  const nextContent: string[] = new Array(lines.length).fill('');
  let upcoming = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    nextContent[i] = upcoming;
    if (lines[i].trim()) upcoming = lines[i].trim();
  }

  const blocks: MarkdownBlock[] = [];
  let sectionCount = 0;
  let storyCount = 0;
  let inTopStories = false;

  lines.forEach((line, i) => {
    const text = line.trim();
    if (!text) return;
    const stripped = plain(text);

    if (isSectionHeading(stripped)) {
      inTopStories = stripped.startsWith('①');
      blocks.push({ type: 'h2', id: `section-${sectionCount++}`, nodes: parseInline(stripped) });
      return;
    }
    if (i === firstContent && !/^(作者|发生了什么)/.test(stripped)) {
      blocks.push({ type: 'h1', nodes: parseInline(stripped) });
      return;
    }
    if (isNumberedTitle(text) || (inTopStories && isLegacyTitle(text, nextContent[i]))) {
      blocks.push({ type: 'h3', id: inTopStories ? `story-${storyCount++}` : undefined, nodes: parseInline(text) });
      return;
    }
    if (/^#{1,6}\s/.test(text)) {
      blocks.push({ type: 'h3', nodes: parseInline(text.replace(/^#{1,6}\s+/, '')) });
      return;
    }
    blocks.push({
      type: 'p',
      tone: SOURCE_LINE.test(stripped) ? 'source' : ASIDE_LINE.test(stripped) ? 'aside' : undefined,
      nodes: parseInline(text.replace(/^[-*]\s+/, '')),
    });
  });

  return blocks;
}
