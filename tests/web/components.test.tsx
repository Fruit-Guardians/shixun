import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { digestFor, reportSummary, sectionsFor, storiesFor } from '#shared';
import type { FeedChannelStatus, Report, StorySummary } from '#shared';
import FeedView from '#web/components/FeedView.tsx';
import Markdown from '#web/components/Markdown.tsx';
import ReaderView from '#web/components/ReaderView.tsx';
import SourcesView, { cadenceLabel } from '#web/components/SourcesView.tsx';
import StoryCard from '#web/components/StoryCard.tsx';
import Topbar from '#web/components/Topbar.tsx';
import type { FeedState } from '#web/hooks/useFeed.ts';
import type { FeedChannelsState } from '#web/hooks/useFeedChannels.ts';
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

const feedState = (over: Partial<FeedState> = {}): FeedState => ({
  status: 'ready',
  items: [],
  channels: [],
  nextCursor: null,
  error: null,
  loadingMore: false,
  loadedAt: Date.parse('2026-10-19T12:00:00Z'),
  ...over,
});

const channel = (over: Partial<FeedChannelStatus> & Pick<FeedChannelStatus, 'id' | 'source' | 'name'>): FeedChannelStatus => ({
  group: 'blogs',
  description: '一句话介绍。',
  homepage: 'https://example.test/',
  everyMinutes: 60,
  lastRunAt: null,
  ok: false,
  fetched: 0,
  error: null,
  latestAt: null,
  ...over,
});

test('the feed links out safely, shows severity and score, and hides the refresh button from visitors', () => {
  const state = feedState({
    items: [
      { id: 'nvd:CVE-2026-1', source: 'nvd', channel: 'nvd', channelName: 'NVD 高危漏洞', title: 'CVE-2026-1 · bug', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1', discussionUrl: null, summary: 's', author: null, score: null, severity: 'critical', tags: ['CVSS 9.8'], publishedAt: '2026-10-19T11:00:00Z' },
      { id: 'hackernews:1', source: 'hackernews', channel: 'hackernews', channelName: 'Hacker News', title: 'Show HN', url: 'https://a.test/', discussionUrl: 'https://news.ycombinator.com/item?id=1', summary: '', author: 'pg', score: 1234, severity: null, tags: [], publishedAt: '2026-10-19T09:00:00Z' },
    ],
    channels: [
      channel({ id: 'nvd', source: 'nvd', name: 'NVD 高危漏洞', lastRunAt: '2026-10-19T11:30:00Z', ok: true, fetched: 1 }),
      channel({ id: 'ghsa', source: 'ghsa', name: 'GitHub Advisory', lastRunAt: '2026-10-19T11:00:00Z', ok: false, error: 'HTTP 403' }),
    ],
    nextCursor: 'c',
  });
  const visitor = renderToStaticMarkup(<FeedView feed={state} source={null} onSource={noop} onLoadMore={noop} onReload={noop} />);
  assert.equal([...visitor.matchAll(/target="_blank" rel="noopener noreferrer"/g)].length, 3);
  assert.match(visitor, /data-severity="critical">严重</);
  assert.match(visitor, /▲ 1,234/);
  assert.match(visitor, /1 小时前/);
  assert.match(visitor, /1\/2 个频道正常/);
  assert.match(visitor, /HTTP 403/);
  assert.match(visitor, /加载更早的条目/);
  assert.doesNotMatch(visitor, /立即抓取/);
  const owner = renderToStaticMarkup(<FeedView feed={state} source="nvd" onSource={noop} onLoadMore={noop} onReload={noop} onRefreshAll={noop} />);
  assert.match(owner, /立即抓取/);
  assert.match(owner, /aria-pressed="true"[^>]*><span class="tag-dot"[^>]*><\/span>NVD 漏洞/);
});

test('an empty feed explains when items will appear', () => {
  const html = renderToStaticMarkup(<FeedView feed={feedState()} source={null} onSource={noop} onLoadMore={noop} onReload={noop} />);
  assert.match(html, /信源还没有抓取过/);
});

test('the sources page groups channels, links homepages safely and shows cadence and status', () => {
  const sources: FeedChannelsState = {
    status: 'ready',
    error: null,
    loadedAt: Date.parse('2026-10-19T12:00:00Z'),
    channels: [
      channel({ id: 'hackernews', source: 'hackernews', group: 'community', name: 'Hacker News', homepage: 'https://news.ycombinator.com/', everyMinutes: 30, lastRunAt: '2026-10-19T11:50:00Z', ok: true, fetched: 30, latestAt: '2026-10-19T11:00:00Z' }),
      channel({ id: 'sec-portswigger', source: 'security', group: 'sec-web', name: 'PortSwigger Research', homepage: 'https://portswigger.net/research', everyMinutes: 360, lastRunAt: '2026-10-19T10:00:00Z', ok: false, error: 'HTTP 503' }),
      channel({ id: 'sec-limitedresults', source: 'security', group: 'sec-archive', name: 'LimitedResults', homepage: 'https://limitedresults.com/', everyMinutes: 1440, latestAt: '2021-06-01T00:00:00.000Z' }),
    ],
  };
  const html = renderToStaticMarkup(<SourcesView sources={sources} onReload={noop} onOpenSource={noop} />);
  assert.equal([...html.matchAll(/target="_blank" rel="noopener noreferrer"/g)].length, 3);
  // 分组按 FEED_GROUPS 的顺序。
  const headings = [...html.matchAll(/<h2 id="sources-([\w-]+)-title"/g)].map((m) => m[1]);
  assert.deepEqual(headings, ['community', 'sec-web', 'sec-archive']);
  assert.match(html, /<strong>3<\/strong> 个频道/);
  assert.match(html, /安全研究博客 <strong>2<\/strong> 个/);
  assert.match(html, /每 30 分钟/);
  assert.match(html, /每 6 小时/);
  assert.match(html, /每天/);
  assert.match(html, /HTTP 503/);
  assert.match(html, /尚未抓取/);
  assert.match(html, /最新一篇 <time[^>]*>2021-06-01</);
  assert.match(html, /10 分钟前<\/time>抓取 · 30 条/);
});

test('cadence labels', () => {
  assert.deepEqual([30, 60, 90, 180, 1440, 2880].map(cadenceLabel), ['每 30 分钟', '每 1 小时', '每 90 分钟', '每 3 小时', '每天', '每 2 天']);
});
