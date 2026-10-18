import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sectionsFor, storiesFor } from '#shared';
import type { Report } from '#shared';
import { parseInline, parseMarkdown, safeHref } from '#web/lib/markdown.ts';

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
    { type: 'link', label: 'https://a.test/y', href: 'https://a.test/y' },
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

    const storyIds = blocks.flatMap((b) => (b.type === 'h3' && b.id ? [b.id] : []));
    assert.deepEqual(storyIds, storiesFor(report).map((s) => `story-${s.index}`), `${report.id}: story ids`);
  }
});

test('source and aside lines are tagged', () => {
  const blocks = parseMarkdown('# 标题\n\n原始链接：https://a.test\n（补充说明）\n普通段落');
  const tones = blocks.filter((b) => b.type === 'p').map((b) => (b.type === 'p' ? b.tone : undefined));
  assert.deepEqual(tones, ['source', 'aside', undefined]);
});
