import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sectionsFor, storiesFor } from '#shared';
import type { Report } from '#shared';
import { parseInline, parseMarkdown, safeHref, shortUrl, toLine } from '#web/lib/markdown.ts';
import type { MarkdownBlock } from '#web/lib/markdown.ts';

const seeds: Report[] = JSON.parse(fs.readFileSync(new URL('../../data/seed-reports.json', import.meta.url), 'utf8'));

test('safeHref only allows http(s)', () => {
  assert.equal(safeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('data:text/html,<script>'), null);
  assert.equal(safeHref('not a url'), null);
});

test('inline parser handles links, bare urls, bold and code', () => {
  assert.deepEqual(parseInline('看 [文档](https://a.test/x) 与 **重点** 以及 `code`'), [
    { type: 'text', text: '看 ' },
    { type: 'link', label: '文档', href: 'https://a.test/x' },
    { type: 'text', text: ' 与 ' },
    { type: 'strong', children: [{ type: 'text', text: '重点' }] },
    { type: 'text', text: ' 以及 ' },
    { type: 'code', text: 'code' },
  ]);
  assert.deepEqual(parseInline('见 https://a.test/y，完'), [
    { type: 'text', text: '见 ' },
    { type: 'link', label: 'a.test/y', href: 'https://a.test/y', kind: 'url' },
    { type: 'text', text: '，完' },
  ]);
});

test('dangerous markdown links degrade to plain text and never become anchors', () => {
  const nodes = parseInline('[点我](javascript:alert(1))');
  assert.ok(nodes.every((n) => n.type !== 'link'));
  assert.equal(nodes[0].type === 'text' && nodes[0].text, '点我');
});

test('front matter is dropped and the first line becomes the title', () => {
  const blocks = parseMarkdown('---\ntitle: x\n---\n# 2026-10-16 日报\n\n① 昨日重要动态\n');
  assert.equal(blocks[0].type, 'h1');
  assert.equal(blocks[1].type, 'h2');
});

test('rendered anchors line up with the parser for every seed report', () => {
  for (const report of seeds) {
    const blocks = parseMarkdown(report.raw);
    const sectionIds = blocks.flatMap((b) => (b.type === 'h2' ? [b.id] : []));
    assert.deepEqual(sectionIds, sectionsFor(report.raw).map((s) => s.id), `${report.id}: section ids`);

    const storyIds = blocks.flatMap((b) => (b.type === 'story' ? [b.id] : []));
    assert.deepEqual(storyIds, storiesFor(report).map((s) => `story-${s.index}`), `${report.id}: story ids`);
  }
});

test('field, source and aside lines are tagged and grouped', () => {
  const blocks = parseMarkdown('# 标题\n\n原始链接：https://a.test\n**热度**：约 100 likes\n（补充说明）\n普通段落\n第二行');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['h1', 'fields', 'p', 'p'],
  );
  const fields = blocks[1].type === 'fields' ? blocks[1].lines : [];
  assert.deepEqual(fields.map((l) => [l.label, l.tone]), [['原始链接', 'source'], ['热度', 'meta']]);
  assert.equal(blocks[2].type === 'p' && blocks[2].tone, 'aside');
  assert.deepEqual(blocks[3].type === 'p' && blocks[3].nodes, [{ type: 'text', text: '普通段落' }, { type: 'br' }, { type: 'text', text: '第二行' }]);
});

const STORY_REPORT = `# 2026-10-16 全球技术社区日报

**时间窗口**：UTC-8 全天。
**实际检索时间**：约 03:47 UTC。

## ① 昨日重要动态

1. **标题：第一条**  
   作者与账号：@alice（个人）  
   发生了什么：发布了 \`tool\`。  
   原始 X：https://x.com/alice/status/1 。  
   互动量：likes ~10

2. **第二条**  
   **作者**：Bob  

   **发生了什么**：空行之后的字段仍属于这一条。

（其他信号：不属于任何一条。）

## ② 核心博主追踪

**AI 方向**  
- @AnthropicAI（机构）：观点。代表性：https://x.com/AnthropicAI/status/2  
- 第二位
  - 嵌套一项

## ③ 热门技术讨论

1. **讨论一**  
   说明文字

2. **讨论二**
`;

test('stories become cards with number, unwrapped title and labelled fields', () => {
  const blocks = parseMarkdown(STORY_REPORT);
  const stories = blocks.filter((b): b is Extract<MarkdownBlock, { type: 'story' }> => b.type === 'story');
  assert.deepEqual(stories.map((s) => [s.id, s.number]), [['story-0', 1], ['story-1', 2]]);
  assert.deepEqual(stories[0].nodes, [{ type: 'text', text: '第一条' }]);
  assert.deepEqual(stories[0].lines.map((l) => [l.label, l.tone]), [
    ['作者与账号', undefined],
    ['发生了什么', undefined],
    ['原始 X', 'source'],
    ['互动量', 'meta'],
  ]);
  assert.deepEqual(stories[1].lines.map((l) => l.label), ['作者', '发生了什么']);
  const aside = blocks.find((b) => b.type === 'p' && b.tone === 'aside');
  assert.ok(aside, 'aside after the stories stays a paragraph');
  assert.equal(blocks[1].type, 'fields');
});

test('bold-only lines become subheadings and bullets nest', () => {
  const blocks = parseMarkdown(STORY_REPORT);
  const start = blocks.findIndex((b) => b.type === 'h2' && b.id === 'section-1');
  assert.equal(blocks[start + 1].type, 'h4');
  const list = blocks[start + 2];
  assert.ok(list.type === 'list' && !list.ordered);
  assert.equal(list.items.length, 2);
  assert.equal(list.items[1].children?.items.length, 1);
  assert.deepEqual(list.items[0].nodes[0], { type: 'link', label: '@AnthropicAI', href: 'https://x.com/AnthropicAI', kind: 'mention' });
});

test('numbered items outside ① are an ordered list, not headings', () => {
  const blocks = parseMarkdown(STORY_REPORT);
  const list = blocks.at(-1);
  assert.ok(list?.type === 'list' && list.ordered);
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0].lines.map((l) => l.nodes), [[{ type: 'text', text: '说明文字' }]]);
  assert.equal(blocks.filter((b) => b.type === 'h3').length, 0);
});

test('tables, fenced code, quotes and rules', () => {
  const blocks = parseMarkdown('标题\n\n| 名称 | 数量 |\n|:--|--:|\n| a \\| b | **3** |\n\n```ts\nconst x = 1;\n  # 不是标题\n```\n\n> 引用 **粗体**\n> 第二行\n\n---\n');
  assert.deepEqual(blocks.map((b) => b.type), ['h1', 'table', 'code', 'quote', 'hr']);
  const table = blocks[1];
  assert.ok(table.type === 'table');
  assert.deepEqual(table.align, ['left', 'right']);
  assert.deepEqual(table.rows[0][0], [{ type: 'text', text: 'a | b' }]);
  const code = blocks[2];
  assert.deepEqual(code.type === 'code' && [code.lang, code.text], ['ts', 'const x = 1;\n  # 不是标题']);
  const quote = blocks[3];
  assert.ok(quote.type === 'quote' && quote.blocks[0].type === 'p');
});

test('inline: italics, strikethrough, mentions and url punctuation', () => {
  assert.deepEqual(parseInline('*斜体* 与 ~~删除~~'), [
    { type: 'em', children: [{ type: 'text', text: '斜体' }] },
    { type: 'text', text: ' 与 ' },
    { type: 'del', children: [{ type: 'text', text: '删除' }] },
  ]);
  assert.deepEqual(parseInline('见 https://a.test/x. 和 (https://a.test/wiki/A_(b))'), [
    { type: 'text', text: '见 ' },
    { type: 'link', label: 'a.test/x', href: 'https://a.test/x', kind: 'url' },
    { type: 'text', text: '. 和 (' },
    { type: 'link', label: 'a.test/wiki/A_(b)', href: 'https://a.test/wiki/A_(b)', kind: 'url' },
    { type: 'text', text: ')' },
  ]);
  // 邮箱与网址里的 @ 不是账号；乘号不是斜体。
  assert.ok(parseInline('mail a@b.com 2 * 3 * 4').every((n) => n.type === 'text'));
  assert.equal(shortUrl('https://www.example.com/'), 'example.com');
  assert.equal(shortUrl('https://x.com/' + 'a'.repeat(80)).length, 48);
});

test('field detection ignores urls, times and long sentences', () => {
  assert.equal(toLine('https://a.test/x').label, undefined);
  assert.equal(toLine('时间 03:47 UTC').label, undefined);
  assert.equal(toLine('这是一个很长的句子，里面有冒号：但不是字段').label, undefined);
  assert.equal(toLine('**Why it matters**: impact').label, 'Why it matters');
  assert.equal(toLine('Why: plain ascii colon').label, undefined);
});

test('a document that opens with a block is not given a title', () => {
  const types = (raw: string) => parseMarkdown(raw).map((b) => b.type);
  assert.deepEqual(types('| a | b |\n|--|--|\n| 1 | 2 |'), ['table']);
  assert.deepEqual(types('```\ncode\n```'), ['code']);
  assert.deepEqual(types('> 引用'), ['quote']);
  assert.deepEqual(types('- 一\n- 二'), ['list']);
  assert.deepEqual(types('日报标题\n\n这是一段正文，带有标点。'), ['h1', 'p']);
});
