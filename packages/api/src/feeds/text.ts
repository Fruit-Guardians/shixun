/** 抓取下来的标题、摘要一律当作不可信文本：去掉标签、解码实体、压缩空白、截断。 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
};

function codePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') return codePoint(entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** 去掉 CDATA 包装。 */
export function unwrapCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

/** 行内标签直接去掉（`<i>x</i>.` 不会变成 `x .`），其余标签换成空格。 */
const INLINE_TAG = /<\/?(a|abbr|b|code|em|i|kbd|mark|q|s|small|span|strong|sub|sup|u)\b[^>]*>/gi;

function stripTags(html: string): string {
  return html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(INLINE_TAG, '').replace(/<[^>]*>/g, ' ');
}

/** HTML（或实体编码过的 HTML）→ 单行纯文本。 */
export function plainText(html: string, max: number): string {
  const once = decodeEntities(unwrapCdata(html));
  const text = decodeEntities(stripTags(once));
  return clip(text.replace(/\s+/g, ' ').trim(), max);
}

/** 网页里的 HTML 片段 → 单行纯文本：先去标签再解码一次，正文里的 `&lt;x&gt;` 会保留为文字。 */
export function htmlText(html: string, max: number): string {
  const text = decodeEntities(stripTags(html));
  return clip(text.replace(/\s+/g, ' ').trim(), max);
}

/** Markdown（OSV 详情、V2EX 正文）→ 单行纯文本：去掉标题井号、强调符号、代码围栏，链接只留文字。 */
export function markdownText(markdown: string, max: number): string {
  const text = markdown
    .replace(/^```.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '');
  return plainText(text, max);
}

/** 只接受 http(s) 绝对地址（相对地址按 base 解析）；其他一律丢弃，避免 javascript: 之类进入链接。 */
export function safeUrl(value: string | null | undefined, base?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** 来源给出的时间 → ISO。没有时区的按 UTC；无效或晚于 now 的按 now。 */
export function normalizeTime(value: string | null | undefined, now: Date): string {
  if (!value) return now.toISOString();
  const text = value.trim();
  const zoned = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text) ? `${text}Z` : text;
  const time = Date.parse(zoned);
  if (Number.isNaN(time) || time > now.getTime()) return now.toISOString();
  return new Date(time).toISOString();
}

/** 读响应正文，最多 maxBytes 字节；超出部分直接丢弃（逐条解析的格式只会少掉末尾几条）。 */
export async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - bytes;
    const chunk = value.byteLength > room ? value.subarray(0, room) : value;
    text += decoder.decode(chunk, { stream: true });
    bytes += chunk.byteLength;
    if (bytes >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text + decoder.decode();
}
