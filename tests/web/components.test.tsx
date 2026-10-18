import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { digestFor, reportSummary, sectionsFor, storiesFor } from '#shared';
import type { Report, StorySummary } from '#shared';
import Markdown from '#web/components/Markdown.tsx';
import ReaderView from '#web/components/ReaderView.tsx';
import StoryCard from '#web/components/StoryCard.tsx';
import Topbar from '#web/components/Topbar.tsx';
import type { ReportText } from '#web/hooks/useReportText.ts';

/** 组件渲染测试：服务端渲染成 HTML 再检查结构，不需要 DOM。交互由各自的纯函数与 reducer 测试覆盖。 */

const seeds: Report[] = JSON.parse(fs.readFileSync(new URL('../../data/seed-reports.json', import.meta.url), 'utf8'));

const ids = (html: string, prefix: string) => [...html.matchAll(new RegExp(`id="(${prefix}-\\d+)"`, 'g'))].map((m) => m[1]);
const noop = () => {};

test('rendered anchors match the ids the TOC and story links scroll to, for every report', () => {
  for (const report of seeds) {
    const html = renderToStaticMarkup(<Markdown raw={report.raw} />);
    assert.deepEqual(ids(html, 'section'), sectionsFor(report.raw).map((s) => s.id), `${report.id} sections`);
    assert.deepEqual(ids(html, 'story'), storiesFor(report).map((s) => `story-${s.index}`), `${report.id} stories`);
  }
});

test('links are http(s) only, open in a new tab without opener, and raw HTML stays text', () => {
  const html = renderToStaticMarkup(
    <Markdown raw={'看 [坏链接](javascript:alert(1)) 和 [好链接](https://a.test/x) 以及 https://b.test/very/long/path\n\n<script>alert(1)</script> @someone'} />,
  );
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  const anchors = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
  assert.equal(anchors.length, 3);
  for (const a of anchors) {
    assert.match(a, /href="https:\/\//);
    assert.match(a, /target="_blank"/);
    assert.match(a, /rel="noopener noreferrer"/);
  }
  assert.match(html, /class="md-mention"[^>]*>@someone</);
  assert.match(html, /title="https:\/\/b.test\/very\/long\/path"/);
});

test('tables are keyboard-scrollable regions and code blocks keep their language', () => {
  const html = renderToStaticMarkup(<Markdown raw={'| 名称 | 数 |\n|:--|--:|\n| a \\| b | 1 |\n\n```ts\nconst x = 1 < 2;\n```'} />);
  assert.match(html, /<div class="md-table" role="region" aria-label="表格" tabindex="0"><table>/);
  assert.match(html, /<td style="text-align:left">a \| b<\/td>/);
  assert.match(html, /text-align:right/);
  assert.match(html, /<pre class="md-code" data-lang="ts"><code>const x = 1 &lt; 2;<\/code><\/pre>/);
});

function reader(text: ReportText, report: Report = seeds[0]) {
  return renderToStaticMarkup(
    <ReaderView report={reportSummary(report)} text={text} downloadUrl="/dl" onBack={noop} onCopyLink={noop} onOpenVersions={noop} />,
  );
}

test('reader shows loading, error with retry, and the full text with one TOC entry per section', () => {
  const loading = reader({ status: 'loading' });
  assert.match(loading, /role="status"/);
  assert.ok(!loading.includes('class="markdown"'));

  const error = reader({ status: 'error', message: '原文暂时读取失败', retry: noop });
  assert.match(error, /role="alert"[^>]*><span>原文暂时读取失败<\/span><button>重试<\/button>/);

  const report = seeds[0];
  const ready = reader({ status: 'ready', raw: report.raw });
  assert.match(ready, /class="markdown"/);
  assert.match(ready, /全文完/);
  const toc = ready.slice(ready.indexOf('class="toc window"'));
  assert.equal((toc.match(/<a /g) ?? []).length, sectionsFor(report.raw).length);
  assert.match(ready, /<a href="\/dl"/);
  assert.match(ready, />版本<\/span>/);
  assert.match(ready, new RegExp(`${digestFor(report).chars.toLocaleString('en-US')} chars`));
});

test('story cards highlight the query and label their buttons for screen readers', () => {
  const story: StorySummary = reportSummary(seeds[0]).stories[0];
  const query = story.title.slice(1, 3);
  const html = renderToStaticMarkup(
    <StoryCard story={story} position={0} lead query={query} saved onToggleSave={noop} onOpen={noop} />,
  );
  assert.match(html, new RegExp(`<mark>${query}</mark>`));
  assert.match(html, /HEADLINE/);
  assert.match(html, /aria-pressed="true"/);
  assert.ok(html.includes(`aria-label="阅读：${story.title}"`));
  assert.match(html, /#01/);
});

test('visitors get no import button; the owner does', () => {
  const topbar = (onImport?: () => void) =>
    renderToStaticMarkup(
      <Topbar view="today" reading={false} savedCount={0} theme="light" onNavigate={noop} onToggleTheme={noop} onToggleMobileNav={noop} onImport={onImport} />,
    );
  assert.ok(!topbar().includes('导入 Markdown'));
  assert.ok(topbar(noop).includes('导入 Markdown'));
});
