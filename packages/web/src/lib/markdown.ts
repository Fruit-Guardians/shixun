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

/* ───────────────────────── 行内 ───────────────────────── */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; href: string; kind?: 'url' | 'mention' }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'del'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'br' };

/** 同一位置先匹配到的优先：代码 > 链接 > 裸网址 > 粗体 > 删除线 > 斜体 > @账号。 */
const INLINE_TOKENS = new RegExp(
  '(' +
    [
      '`[^`\\n]+`',
      '\\[[^\\]\\n]+\\]\\((?:[^()\\s]|\\([^()\\s]*\\))+\\)',
      'https?:\\/\\/[^\\s<>，；（）、。“”‘’【】「」《》！？]+',
      '\\*\\*(?:[^*\\n]|\\*(?!\\*))+?\\*\\*',
      '~~[^~\\n]+~~',
      '(?<![*\\w])\\*(?![\\s*])[^*\\n]*?[^\\s*]\\*(?![*\\w])',
      '(?<![\\w@./])@[A-Za-z0-9_]{1,15}(?![\\w@])',
    ].join('|') +
    ')',
  'g',
);

const count = (text: string, ch: string) => text.split(ch).length - 1;

/** 网址末尾的英文标点通常属于句子而不是网址；括号成对时保留。 */
function trimUrl(url: string): [url: string, rest: string] {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    const head = url.slice(0, end);
    if (ch === ')' && count(head, '(') >= count(head, ')')) break;
    if (!/[.,;:!?'")\]]/.test(ch)) break;
    end--;
  }
  return [url.slice(0, end), url.slice(end)];
}

/** 裸网址的显示文字：去掉协议与 www.，过长时保留首尾。完整地址放在 title 里。 */
export function shortUrl(href: string, max = 48): string {
  const text = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return text.length > max ? `${text.slice(0, max - 13)}…${text.slice(-12)}` : text;
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = nodes.at(-1);
    if (last?.type === 'text') last.text += value;
    else nodes.push({ type: 'text', text: value });
  };

  for (const token of text.split(INLINE_TOKENS)) {
    if (!token) continue;

    if (token.length > 2 && token.startsWith('`') && token.endsWith('`')) {
      nodes.push({ type: 'code', text: token.slice(1, -1) });
      continue;
    }
    const link = token.match(/^\[([^\]]+)\]\((.+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      if (href) nodes.push({ type: 'link', label: link[1], href });
      else pushText(link[1]);
      continue;
    }
    if (/^https?:\/\//.test(token)) {
      const [url, rest] = trimUrl(token);
      const href = safeHref(url);
      if (href) nodes.push({ type: 'link', label: shortUrl(url), href, kind: 'url' });
      else pushText(url);
      pushText(rest);
      continue;
    }
    if (token.length > 4 && token.startsWith('**') && token.endsWith('**')) {
      nodes.push({ type: 'strong', children: parseInline(token.slice(2, -2)) });
      continue;
    }
    if (token.length > 4 && token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push({ type: 'del', children: parseInline(token.slice(2, -2)) });
      continue;
    }
    if (token.length > 2 && token.startsWith('*') && token.endsWith('*')) {
      nodes.push({ type: 'em', children: parseInline(token.slice(1, -1)) });
      continue;
    }
    if (/^@\w+$/.test(token)) {
      nodes.push({ type: 'link', label: token, href: `https://x.com/${token.slice(1)}`, kind: 'mention' });
      continue;
    }
    pushText(token);
  }
  return nodes;
}

/* ───────────────────────── 块 ───────────────────────── */

export type Tone = 'source' | 'meta' | 'aside';

/** 一行正文；「作者：…」「**热度**：…」这样的行带 label，渲染成字段。 */
export interface Line {
  label?: string;
  tone?: Tone;
  nodes: InlineNode[];
}

export interface ListItem {
  nodes: InlineNode[];
  lines: Line[];
  children: ListBlock | null;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  items: ListItem[];
}

export type Align = 'left' | 'center' | 'right' | null;

export type MarkdownBlock =
  | { type: 'h1'; nodes: InlineNode[] }
  | { type: 'h2'; id: string; nodes: InlineNode[] }
  | { type: 'h3'; nodes: InlineNode[] }
  | { type: 'h4'; nodes: InlineNode[] }
  /** 「① 昨日重要动态」里的一条：id 为 story-N，与 storiesFor 的序号一致。 */
  | { type: 'story'; id: string; number: number | null; nodes: InlineNode[]; lines: Line[] }
  | { type: 'p'; tone?: Tone; nodes: InlineNode[] }
  | { type: 'fields'; lines: Line[] }
  | ListBlock
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; align: Align[]; head: InlineNode[][]; rows: InlineNode[][][] }
  | { type: 'hr' };

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const SOURCE_LINE = /^(原始|相关|GitHub|热度)/;
const ASIDE_LINE = /^[（(]/;
const SOURCE_LABEL = /原始|相关|链接|来源|原帖|帖子|代表|GitHub|X 帖/i;
const META_LABEL = /热度|互动/;

/**
 * 字段行：`**标签**：值`（半角或全角冒号）或 `标签：值`（只认全角冒号，避免把 https: 和时间当成标签）。
 * 标签不超过 12 个字符（加粗的标签放宽到 20），不含句读和括号。
 */
const BOLD_FIELD = /^\*\*([^*：:]{1,20}?)\*\*\s*[：:]\s*(.*)$/;
const PLAIN_FIELD = /^([^\s*：:（(【[`@][^：:（(【[`，。；,;]{0,11}?)\s*：\s*(.*)$/;
const HAS_LETTER = /\p{L}/u;

const FENCE = /^\s*(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const LIST_MARKER = /^(\s*)(?:(\d{1,3})[.)]|([-*+]))\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.replace(/\t/g, '    ').match(/^ */)![0].length;
const stripHardBreak = (text: string) => text.replace(/(?: {2,}|\\)$/, '').trimEnd();

/** 整行被 ** 包住时去掉外层粗体（标题本身已经加粗）。 */
function unwrapBold(text: string): string {
  const m = text.match(/^\*\*((?:[^*]|\*(?!\*))+)\*\*$/);
  return m ? m[1] : text;
}

function toneOf(text: string): Tone | undefined {
  const stripped = plain(text);
  return SOURCE_LINE.test(stripped) ? 'source' : ASIDE_LINE.test(stripped) ? 'aside' : undefined;
}

export function toLine(raw: string): Line {
  const text = stripHardBreak(raw.trim());
  const field = text.match(BOLD_FIELD) ?? text.match(PLAIN_FIELD);
  if (field && HAS_LETTER.test(field[1]) && field[2]) {
    const label = field[1].trim();
    const tone = META_LABEL.test(label) ? 'meta' : SOURCE_LABEL.test(label) ? 'source' : undefined;
    return { label, tone, nodes: parseInline(field[2]) };
  }
  return { tone: toneOf(text), nodes: parseInline(text) };
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

class Parser {
  private readonly blocks: MarkdownBlock[] = [];
  /** nextContent[i] = 第 i 行之后的第一个非空行（识别旧格式条目标题用）。 */
  private readonly nextContent: string[];
  private sectionCount = 0;
  private storyCount = 0;
  private inTopStories = false;
  private i = 0;
  private readonly lines: string[];
  private readonly topLevel: boolean;

  /**
   * topLevel：识别大标题、章节与条目。引用块内部按普通 Markdown 解析，
   * 以免序号与 sectionsFor/storiesFor 错位。
   */
  constructor(lines: string[], topLevel: boolean) {
    this.lines = lines;
    this.topLevel = topLevel;
    this.nextContent = new Array(lines.length).fill('');
    let upcoming = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      this.nextContent[i] = upcoming;
      if (lines[i].trim()) upcoming = lines[i].trim();
    }
  }

  private text(j: number): string {
    return this.lines[j]?.trim() ?? '';
  }

  private nextNonBlank(j: number): number {
    for (let k = j; k < this.lines.length; k++) if (this.text(k)) return k;
    return -1;
  }

  private isSection(j: number): boolean {
    return this.topLevel && isSectionHeading(plain(this.text(j)));
  }

  private isStoryStart(j: number): boolean {
    if (!this.topLevel || !this.inTopStories) return false;
    const text = this.text(j);
    return isNumberedTitle(text) || isLegacyTitle(text, this.nextContent[j]);
  }

  /** 章节标题与条目标题会切断任何正在收集的块，保证锚点与 sectionsFor/storiesFor 一一对应。 */
  private isHardStop(j: number): boolean {
    return this.isSection(j) || this.isStoryStart(j);
  }

  /** 第一行若是代码块、表格、引用、列表或分隔线，就不把它当标题。 */
  private opensBlock(j: number): boolean {
    const raw = this.lines[j];
    return FENCE.test(raw) || HR.test(raw) || this.text(j).startsWith('>') || LIST_MARKER.test(raw) || this.isTableStart(j);
  }

  private isTableStart(j: number): boolean {
    return this.text(j).includes('|') && TABLE_SEPARATOR.test(this.lines[j + 1] ?? '');
  }

  private startsBlock(j: number): boolean {
    const raw = this.lines[j];
    const text = this.text(j);
    return (
      this.isHardStop(j) ||
      HEADING.test(text) ||
      FENCE.test(raw) ||
      text.startsWith('>') ||
      HR.test(raw) ||
      LIST_MARKER.test(raw) ||
      this.isTableStart(j)
    );
  }

  parse(): MarkdownBlock[] {
    const firstContent = this.nextNonBlank(0);

    while (this.i < this.lines.length) {
      const i = this.i;
      const raw = this.lines[i];
      const text = this.text(i);
      if (!text) {
        this.i++;
        continue;
      }

      if (this.isSection(i)) {
        const stripped = plain(text);
        this.inTopStories = stripped.startsWith('①');
        this.blocks.push({ type: 'h2', id: `section-${this.sectionCount++}`, nodes: parseInline(stripped) });
        this.i++;
        continue;
      }
      if (this.topLevel && i === firstContent && !/^(作者|发生了什么)/.test(plain(text)) && !this.opensBlock(i)) {
        this.blocks.push({ type: 'h1', nodes: parseInline(unwrapBold(stripHardBreak(text.replace(/^#{1,6}\s+/, '')))) });
        this.i++;
        continue;
      }
      if (this.isStoryStart(i)) {
        this.story();
        continue;
      }

      const fence = raw.match(FENCE);
      if (fence) {
        this.code(fence[1], fence[2]);
        continue;
      }
      const heading = text.match(HEADING);
      if (heading) {
        const nodes = parseInline(unwrapBold(stripHardBreak(heading[2].replace(/\s+#+\s*$/, ''))));
        this.blocks.push(heading[1].length <= 2 ? { type: 'h3', nodes } : { type: 'h4', nodes });
        this.i++;
        continue;
      }
      if (HR.test(raw)) {
        this.blocks.push({ type: 'hr' });
        this.i++;
        continue;
      }
      if (text.startsWith('>')) {
        this.quote();
        continue;
      }
      if (this.isTableStart(i)) {
        this.table();
        continue;
      }
      if (LIST_MARKER.test(raw)) {
        this.blocks.push(this.list(indentOf(raw)));
        continue;
      }
      this.paragraph();
    }
    return this.blocks;
  }

  private story(): void {
    const start = this.i;
    const title = stripHardBreak(this.text(start));
    const number = title.match(/^(\d+)[.)]\s+/);
    const heading = unwrapBold(title.replace(/^\d+[.)]\s+/, ''))
      .replace(/^\*\*标题\*\*\s*[：:]\s*/, '')
      .replace(/^标题[：:]\s*/, '');

    const lines: Line[] = [];
    let j = start + 1;
    while (j < this.lines.length) {
      const text = this.text(j);
      if (!text) {
        // 空行之后，缩进行或字段行仍属于这一条。
        const k = this.nextNonBlank(j);
        if (k < 0 || this.isHardStop(k)) break;
        if (indentOf(this.lines[k]) === 0 && !toLine(this.text(k)).label) break;
        j = k;
        continue;
      }
      if (this.isHardStop(j) || HEADING.test(text) || FENCE.test(this.lines[j])) break;
      lines.push(toLine(text.replace(/^[-*+]\s+/, '')));
      j++;
    }
    this.blocks.push({
      type: 'story',
      id: `story-${this.storyCount++}`,
      number: number ? Number(number[1]) : null,
      nodes: parseInline(unwrapBold(heading)),
      lines,
    });
    this.i = j;
  }

  private code(marker: string, lang: string): void {
    const indent = indentOf(this.lines[this.i]);
    const close = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
    const body: string[] = [];
    let j = this.i + 1;
    while (j < this.lines.length && !close.test(this.lines[j])) {
      body.push(this.lines[j].replace(new RegExp(`^ {0,${indent}}`), ''));
      j++;
    }
    this.blocks.push({ type: 'code', lang, text: body.join('\n') });
    this.i = j + 1;
  }

  private quote(): void {
    const inner: string[] = [];
    let j = this.i;
    while (j < this.lines.length && this.text(j).startsWith('>') && !this.isHardStop(j)) {
      inner.push(this.lines[j].replace(/^\s*>\s?/, ''));
      j++;
    }
    this.blocks.push({ type: 'quote', blocks: new Parser(inner, false).parse() });
    this.i = j;
  }

  private table(): void {
    const head = splitRow(this.lines[this.i]);
    const align = splitRow(this.lines[this.i + 1]).map((cell): Align =>
      cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null,
    );
    const rows: InlineNode[][][] = [];
    let j = this.i + 2;
    while (j < this.lines.length && this.text(j).includes('|') && !this.isHardStop(j)) {
      const cells = splitRow(this.lines[j]);
      rows.push(head.map((_, c) => parseInline(cells[c] ?? '')));
      j++;
    }
    this.blocks.push({ type: 'table', align: head.map((_, c) => align[c] ?? null), head: head.map((cell) => parseInline(cell)), rows });
    this.i = j;
  }

  /** 从当前行开始收集同一缩进、同一类型（有序/无序）的列表项；更深缩进的列表项成为子列表。 */
  private list(indent: number): ListBlock {
    const first = this.lines[this.i].match(LIST_MARKER)!;
    const ordered = Boolean(first[2]);
    const block: ListBlock = { type: 'list', ordered, start: ordered ? Number(first[2]) : 1, items: [] };

    while (this.i < this.lines.length) {
      const marker = this.lines[this.i].match(LIST_MARKER);
      if (!marker || indentOf(this.lines[this.i]) !== indent || Boolean(marker[2]) !== ordered || this.isHardStop(this.i)) break;
      const item: ListItem = { nodes: parseInline(stripHardBreak(marker[4])), lines: [], children: null };
      block.items.push(item);
      this.i++;

      while (this.i < this.lines.length) {
        const raw = this.lines[this.i];
        if (!this.text(this.i)) {
          const k = this.nextNonBlank(this.i);
          if (k < 0 || this.isHardStop(k) || indentOf(this.lines[k]) <= indent) break;
          this.i = k;
          continue;
        }
        if (this.isHardStop(this.i) || indentOf(raw) <= indent) break;
        if (LIST_MARKER.test(raw)) {
          const sub = this.list(indentOf(raw));
          if (item.children) item.children.items.push(...sub.items);
          else item.children = sub;
          continue;
        }
        item.lines.push(toLine(this.text(this.i)));
        this.i++;
      }

      // 列表项之间允许空行。
      const k = this.nextNonBlank(this.i);
      if (k < 0) break;
      const next = this.lines[k].match(LIST_MARKER);
      if (!next || indentOf(this.lines[k]) !== indent || Boolean(next[2]) !== ordered || this.isHardStop(k)) break;
      this.i = k;
    }
    return block;
  }

  /** 连续的普通行：字段行连成字段组，其余按语气（来源/旁注/正文）合并成段落，行间换行保留；小标题行单独成块。 */
  private paragraph(): void {
    const runs: MarkdownBlock[] = [];
    let j = this.i;
    do {
      const text = this.text(j);
      const kicker = kickerOf(text, this.topLevel && j === this.i);
      const line = kicker ? null : toLine(text);
      const last = runs.at(-1);
      if (kicker) runs.push({ type: 'h4', nodes: parseInline(kicker) });
      else if (line!.label) {
        if (last?.type === 'fields') last.lines.push(line!);
        else runs.push({ type: 'fields', lines: [line!] });
      } else if (last?.type === 'p' && last.tone === line!.tone) {
        last.nodes.push({ type: 'br' }, ...line!.nodes);
      } else {
        runs.push({ type: 'p', tone: line!.tone, nodes: [...line!.nodes] });
      }
      j++;
    } while (j < this.lines.length && this.text(j) && !this.startsBlock(j));
    this.i = j;
    this.blocks.push(...runs);
  }
}

const SENTENCE_PUNCTUATION = /[。，；：！？、,.;:!?]/;

/**
 * 段落里的小标题行，返回去掉外层强调后的文字：
 * 整行加粗或斜体的短文字（「**AI 方向**」「*AI领域*」），
 * 或段落首行不带句读的短行（旧格式里的「AI 领域」「HybridAgent」）。
 */
function kickerOf(raw: string, firstLine: boolean): string | null {
  const text = stripHardBreak(raw);
  const wrapped = text.match(/^(\*\*?)([^*]{1,30})\1$/);
  if (wrapped) return SENTENCE_PUNCTUATION.test(wrapped[2].slice(-1)) ? null : wrapped[2];
  if (!firstLine) return null;
  const visible = plain(text);
  if (visible.length > 24 || !HAS_LETTER.test(visible) || SENTENCE_PUNCTUATION.test(visible)) return null;
  if (ASIDE_LINE.test(visible) || /https?:\/\//.test(text) || /^@/.test(visible)) return null;
  return text;
}

/**
 * 把日报原文解析成块。章节 id 为 `section-N`，「① 昨日重要动态」里的条目 id 为 `story-N`，
 * 与 `sectionsFor` / `storiesFor` 的序号一一对应，页面据此跳转与高亮目录。
 */
export function parseMarkdown(raw: string): MarkdownBlock[] {
  return new Parser(raw.replace(FRONT_MATTER, '').split(/\r?\n/), true).parse();
}
