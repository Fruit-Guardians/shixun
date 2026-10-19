import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledFeed } from '#api';
import { FEED_GROUPS, FEED_RETENTION_MS, FEED_SOURCES, apiPaths } from '#shared';
import type { FeedChannelsResponse, FeedRefreshResponse, FeedResponse } from '#shared';
import { FEED_CHANNELS, FEED_CHANNELS_PER_RUN, FEED_CRON_INTERVAL_MS, channelCost, findChannel, pickDueChannels } from '../../packages/api/src/feeds/channels.ts';
import {
  parseFeedXml,
  parseGhsa,
  parseGithubTrending,
  parseHackerNews,
  parseHfModels,
  parseHfPapers,
  parseKev,
  parseLobsters,
  parseNvd,
  parseOsv,
  parseOsvIndex,
  parseRuanyfWeekly,
  parseV2ex,
} from '../../packages/api/src/feeds/parsers.ts';
import { FEED_REFRESH_BUDGET, runFeedChannel } from '../../packages/api/src/services/feed.ts';
import type { FeedFetch } from '../../packages/api/src/services/feed.ts';
import { markdownText, normalizeTime, plainText, readCapped, safeUrl } from '../../packages/api/src/feeds/text.ts';
import { ORIGIN, USER_HEADERS, createHarness } from './helpers/harness.ts';
import { createTestD1 } from './helpers/d1.ts';

const NOW = new Date('2026-10-19T12:00:00.000Z');

// —— 来源样例：按真实响应的结构裁剪，只保留解析会用到的部分 ——

const hnBody = {
  hits: [
    { objectID: '101', title: 'Show HN: A &amp; B', url: 'https://example.com/a', points: 321, author: 'alice', created_at: '2026-10-19T10:00:00Z', num_comments: 42 },
    { objectID: '102', title: 'Ask HN: no link', url: null, points: 12, author: 'bob', created_at: '2026-10-19T09:00:00Z', num_comments: 3 },
    { objectID: '103', title: 'Bad link', url: 'javascript:alert(1)', points: 1, author: 'eve', created_at: '2026-10-19T08:00:00Z' },
    { objectID: 'x', title: 'not a numeric id' },
  ],
};

const trendingRow = (path: string) => `
  <article class="Box-row">
    <div class="float-right d-flex"><a href="/login?return_to=%2F${path}">Star</a></div>
    <h2 class="h3 lh-condensed">
      <a data-hydro-click="{}" href="/${path}" class="Link"><svg class="octicon octicon-repo"><path d="M2"></path></svg>
        <span class="text-normal">${path.split('/')[0]} /</span> ${path.split('/')[1]}</a>
    </h2>
    <p class="col-9 color-fg-muted my-1 tmp-pr-4">
      A tool for &lt;agents&gt; &amp; humans.
    </p>
    <div class="f6 color-fg-muted mt-2">
      <span itemprop="programmingLanguage">TypeScript</span>
      <a href="/${path}/stargazers" class="Link"><svg aria-label="star" class="octicon octicon-star"><path d="M8"></path></svg>
        12,345</a>
      <span class="d-inline-block float-sm-right"><svg class="octicon octicon-star"><path d="M8"></path></svg>
        1,234 stars today
      </span>
    </div>
  </article>`;
const trendingHtml = `<html><body>${trendingRow('acme/rocket')}${trendingRow('acme/rocket')}${trendingRow('octo/cat.js')}</body></html>`;

const rssXml = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Blog</title>
  <item><title><![CDATA[Hello <b>World</b>]]></title><link>https://blog.test/hello</link><guid>g-1</guid>
    <author>news@blog.test (Jane Doe)</author>
    <description>&lt;p&gt;First &amp;amp; foremost&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</description>
    <pubDate>Sun, 18 Oct 2026 08:30:00 +0000</pubDate></item>
  <item><title>Relative</title><link>/posts/2</link><dc:creator>Bob</dc:creator><pubDate>not a date</pubDate></item>
  <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

const atomXml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Weblog</title>
  <link href="https://weblog.test/" rel="alternate"/>
  <entry><title>Atom post</title><link href="https://weblog.test/feed/" rel="self"/><link href="https://weblog.test/2026/post/" rel="alternate"/>
    <published>2026-10-18T23:43:09+00:00</published><id>tag:weblog.test,2026:1</id>
    <summary type="html">&lt;p&gt;Atom &lt;strong&gt;summary&lt;/strong&gt;&lt;/p&gt;</summary><author><name>Simon</name></author></entry>
</feed>`;

const nvdCve = (id: string, extra: Record<string, unknown> = {}) => ({
  cve: {
    id,
    published: '2026-10-19T08:16:33.500',
    vulnStatus: 'Received',
    descriptions: [{ lang: 'en', value: `${id} lets attackers bypass auth. More details follow.` }],
    metrics: { cvssMetricV31: [{ source: 'cna@example.com', type: 'Secondary', cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL' } }] },
    ...extra,
  },
});
const nvdBody = (ids: string[]) => ({
  totalResults: ids.length,
  vulnerabilities: [
    ...ids.map((id) => nvdCve(id)),
    nvdCve('CVE-2026-0003', { vulnStatus: 'Rejected' }),
    nvdCve('CVE-2026-0004', { metrics: {} }),
  ],
});

const ghsaBody = [
  {
    ghsa_id: 'GHSA-29mw-wpgm-hmr9',
    cve_id: 'CVE-2026-1234',
    summary: 'Prototype pollution in lodash',
    description: 'A **long** description.',
    severity: 'high',
    html_url: 'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
    published_at: '2026-10-19T06:00:00Z',
    vulnerabilities: [{ package: { ecosystem: 'npm', name: 'lodash' } }, { package: { ecosystem: 'npm', name: 'lodash' } }],
  },
  { ghsa_id: 'GHSA-bad', summary: 'invalid id' },
];

const kevBody = {
  vulnerabilities: [
    nvdCve('CVE-2015-3306', { published: '2015-05-18T15:59:10.743', cisaExploitAdd: '2026-10-08', cisaActionDue: '2026-10-29', cisaVulnerabilityName: 'ProFTPD Improper Access Control Vulnerability' }),
    nvdCve('CVE-2026-5000', { cisaExploitAdd: '2026-10-16', cisaVulnerabilityName: 'Acme <b>Gateway</b> RCE', metrics: {} }),
    nvdCve('CVE-2026-5001'),
  ],
};

const lobstersBody = [
  {
    short_id: 'h0eate',
    title: 'Updates to site guidelines',
    url: '',
    score: 216,
    comment_count: 151,
    description_plain: 'Text post &amp; body',
    submitter_user: 'pushcx',
    tags: ['announce', 'meta'],
    comments_url: 'https://lobste.rs/s/h0eate/updates',
    created_at: '2026-10-18T20:28:53.196-05:00',
  },
  { short_id: 'abc123', title: 'Linked', url: 'https://example.com/post', score: 10, comment_count: 0, submitter_user: { username: 'old-shape' }, tags: [], comments_url: 'https://lobste.rs/s/abc123', created_at: '2026-10-19T01:00:00.000Z' },
  { short_id: 'bad id!', title: 'x', comments_url: 'https://lobste.rs/s/x' },
];

const v2exBody = [
  { id: 1250023, title: '分享一下经历', url: 'https://www.v2ex.com/t/1250023', replies: 163, created: 1792393441, content: '## 时间线\n\n1. **第一步**', node: { title: '生活' }, member: { username: 'joe' } },
  { id: 'x', title: 'bad id' },
];

const hfBody = [
  {
    paper: { id: '2610.16763', title: 'Relational Learning as World Modeling', summary: 'We study <i>relations</i>.', upvotes: 42, authors: [{ name: 'Ada' }, { name: 'Bob' }], submittedOnDailyAt: '2026-10-12T00:00:00.000Z', githubRepo: 'https://github.com/acme/rl' },
    publishedAt: '2026-10-11T20:00:00.000Z',
    numComments: 1,
  },
  { paper: { id: 'not-arxiv', title: 'bad' } },
];

const hfModelsBody = [
  { id: 'deepseek-ai/DeepSeek-V4.1-Flash', likes: 1586, downloads: 17924, pipeline_tag: 'image-text-to-text', library_name: 'transformers', createdAt: '2026-10-17T02:40:38.000Z' },
  { id: 'openbmb/MiniCPM-V-4.7', likes: 1039, createdAt: '2026-10-10T00:00:00.000Z' },
  // 非法 id、旧模型（超出保留期，不入库）。
  { id: '../etc/passwd', likes: 1 },
  { id: 'google/bert-base', likes: 9000, createdAt: '2019-01-01T00:00:00.000Z' },
];

const weeklyAtom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>c1</id><link href="https://github.com/ruanyf/weekly/commit/1"/><title>docs(issue-415): fixed link</title><updated>2026-10-16T01:00:52Z</updated></entry>
  <entry><id>c2</id><link href="https://github.com/ruanyf/weekly/commit/2"/><title>
    docs: release issue 414
  </title><updated>2026-10-08T15:14:04Z</updated></entry>
</feed>`;

const osvCsv = ['2026-10-19T12:15:03Z,PYSEC-2026-2946', '2026-10-19T02:30:03Z,MAL-2026-17926', '2026-10-18T10:00:00Z,GHSA-29mw-wpgm-hmr9', '2026-10-18T09:00:00Z,PYSEC-2019-1', '2026-10-18T08:00:00Z,../etc'].join('\n');
const osvEntries: Record<string, unknown> = {
  'PYSEC-2026-2946': {
    id: 'PYSEC-2026-2946',
    published: '2026-10-13T14:36:52.273166Z',
    aliases: ['GHSA-ffp3-3562-8cv3', 'CVE-2026-56074'],
    summary: 'PraisonAI: approval cache bypass',
    details: '## Summary\n\nThe approval system caches decisions.',
    affected: [{ package: { ecosystem: 'PyPI', name: 'praisonai' } }],
    database_specific: { severity: 'MODERATE' },
  },
  // 修改时间新、发布时间早于保留期：不收录。
  'PYSEC-2019-1': { id: 'PYSEC-2019-1', published: '2019-01-01T00:00:00Z', summary: 'old' },
};

/** 按地址返回样例；记录每次请求。 */
function fakeFetch(overrides: Record<string, () => Response> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: FeedFetch = async (input, init) => {
    calls.push({ url: input, init });
    for (const [prefix, respond] of Object.entries(overrides)) if (input.startsWith(prefix)) return respond();
    if (input.startsWith('https://hn.algolia.com/')) return Response.json(hnBody);
    if (input.startsWith('https://lobste.rs/')) return Response.json(lobstersBody);
    if (input.startsWith('https://www.v2ex.com/')) return Response.json(v2exBody);
    if (input.startsWith('https://huggingface.co/api/models')) return Response.json(hfModelsBody);
    if (input.startsWith('https://huggingface.co/api/')) return Response.json(hfBody);
    if (input.includes('ruanyf/weekly')) return new Response(weeklyAtom);
    if (input.startsWith('https://services.nvd.nist.gov/') && input.includes('hasKev')) return Response.json(kevBody);
    if (input.startsWith('https://osv-vulnerabilities.storage.googleapis.com/')) {
      if (input.endsWith('/modified_id.csv')) return new Response(osvCsv);
      const entry = osvEntries[decodeURIComponent(input.split('/').pop()!.replace(/\.json$/, ''))];
      return entry ? Response.json(entry) : new Response('', { status: 404 });
    }
    if (input.startsWith('https://github.com/trending')) return new Response(trendingHtml);
    if (input.startsWith('https://services.nvd.nist.gov/')) {
      const severity = new URL(input).searchParams.get('cvssV3Severity');
      return Response.json(nvdBody(severity === 'CRITICAL' ? ['CVE-2026-0001'] : ['CVE-2026-0002']));
    }
    if (input.startsWith('https://api.github.com/advisories')) return Response.json(ghsaBody);
    if (input.includes('simonwillison')) return new Response(atomXml);
    return new Response(rssXml);
  };
  return { fetcher, calls };
}

/** 直接抓一个频道（不经过调度）。 */
function runOne(DB: D1Database, id: string, fetcher: FeedFetch, env: { GITHUB_TOKEN?: string; NVD_API_KEY?: string } = {}, now = NOW) {
  return runFeedChannel(DB, findChannel(id)!, { fetch: fetcher, now, env });
}

test('Hacker News: links fall back to the discussion, unsafe links are dropped, entities decoded', () => {
  const items = parseHackerNews(hnBody, NOW);
  assert.deepEqual(
    items.map((i) => [i.key, i.title, i.url, i.score]),
    [
      ['101', 'Show HN: A & B', 'https://example.com/a', 321],
      ['102', 'Ask HN: no link', 'https://news.ycombinator.com/item?id=102', 12],
      ['103', 'Bad link', 'https://news.ycombinator.com/item?id=103', 1],
    ],
  );
  assert.equal(items[0].discussionUrl, 'https://news.ycombinator.com/item?id=101');
  assert.deepEqual(items[0].tags, ['42 条评论']);
  assert.equal(items[0].publishedAt, '2026-10-19T10:00:00.000Z');
  assert.deepEqual(parseHackerNews({ nope: 1 }, NOW), []);
});

test('GitHub Trending: repo, description, language, stars today; duplicates collapse', () => {
  const items = parseGithubTrending(trendingHtml, NOW);
  assert.deepEqual(
    items.map((i) => [i.key, i.title, i.url, i.score, i.tags]),
    [
      ['acme/rocket', 'acme/rocket', 'https://github.com/acme/rocket', 1234, ['TypeScript', '★ 12,345']],
      ['octo/cat.js', 'octo/cat.js', 'https://github.com/octo/cat.js', 1234, ['TypeScript', '★ 12,345']],
    ],
  );
  assert.equal(items[0].summary, 'A tool for <agents> & humans.');
  assert.equal(items[0].author, 'acme');
  assert.equal(items[0].publishedAt, NOW.toISOString());
  assert.deepEqual(parseGithubTrending('<html>redesigned</html>', NOW), []);
});

test('RSS: CDATA, double-encoded HTML, relative links, author emails, bad dates, unsafe links', () => {
  const items = parseFeedXml(rssXml, 'https://blog.test/feed.xml', NOW);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].key, items[0].title, items[0].url, items[0].summary, items[0].author], ['g-1', 'Hello World', 'https://blog.test/hello', 'First & foremost', 'Jane Doe']);
  assert.equal(items[0].publishedAt, '2026-10-18T08:30:00.000Z');
  assert.deepEqual([items[1].url, items[1].author, items[1].publishedAt], ['https://blog.test/posts/2', 'Bob', NOW.toISOString()]);
});

test('Atom: picks the alternate link and the published date', () => {
  const [item] = parseFeedXml(atomXml, 'https://weblog.test/atom', NOW);
  assert.deepEqual([item.title, item.url, item.summary, item.author, item.publishedAt], ['Atom post', 'https://weblog.test/2026/post/', 'Atom summary', 'Simon', '2026-10-18T23:43:09.000Z']);
  // Blogger 的属性用单引号。
  const blogger = `<feed xmlns='http://www.w3.org/2005/Atom'><entry><id>tag:blogger.com,1999:post-1</id><published>2024-06-01T10:00:00.000-07:00</published>
    <title type='text'>Bypassing UAC</title><link rel='replies' type='text/html' href='https://b.test/1#comments'/><link rel='alternate' type='text/html' href='https://b.test/2024/06/uac.html'/></entry></feed>`;
  assert.deepEqual(parseFeedXml(blogger, 'https://b.test/', NOW).map((d) => [d.url, d.publishedAt]), [['https://b.test/2024/06/uac.html', '2024-06-01T17:00:00.000Z']]);
});

test('RSS without <link>: an absolute guid is the link, a non-URL guid is skipped', () => {
  const xml = `<rss><channel><item><guid>https://news.test/post/1</guid><title>有 guid</title></item>
    <item><guid isPermaLink="false">post-2</guid><title>没有链接</title></item></channel></rss>`;
  assert.deepEqual(parseFeedXml(xml, 'https://news.test/rss', NOW).map((d) => [d.key, d.url]), [['https://news.test/post/1', 'https://news.test/post/1']]);
});

test('NVD: keeps scored, non-rejected CVEs; timestamps without a zone are UTC', () => {
  const items = parseNvd(nvdBody(['CVE-2026-0001']), NOW);
  assert.deepEqual(items.map((i) => i.key), ['CVE-2026-0001']);
  assert.equal(items[0].severity, 'critical');
  assert.deepEqual(items[0].tags, ['CVSS 9.8']);
  assert.equal(items[0].title, 'CVE-2026-0001 · CVE-2026-0001 lets attackers bypass auth.');
  assert.equal(items[0].url, 'https://nvd.nist.gov/vuln/detail/CVE-2026-0001');
  assert.equal(items[0].publishedAt, '2026-10-19T08:16:33.500Z');
});

test('GitHub Advisory: severity, CVE and package tags; invalid ids skipped', () => {
  const items = parseGhsa(ghsaBody, NOW);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].title, items[0].severity, items[0].tags, items[0].summary], ['Prototype pollution in lodash', 'high', ['CVE-2026-1234', 'npm:lodash'], 'A **long** description.']);
  assert.deepEqual(parseGhsa({ message: 'rate limited' }, NOW), []);
});

test('CISA KEV: dated by when it was added, named by CISA, due date tagged', () => {
  const items = parseKev(kevBody, NOW);
  assert.deepEqual(items.map((i) => [i.key, i.publishedAt, i.severity]), [
    ['CVE-2026-5000', '2026-10-16T00:00:00.000Z', null],
    ['CVE-2015-3306', '2026-10-08T00:00:00.000Z', 'critical'],
  ]);
  assert.equal(items[0].title, 'CVE-2026-5000 · Acme Gateway RCE');
  assert.deepEqual(items[1].tags, ['CVSS 9.8', '处置期限 2026-10-29']);
});

test('Lobsters and V2EX: text posts link to the discussion, tags and reply counts kept', () => {
  const lob = parseLobsters(lobstersBody, NOW);
  assert.deepEqual(lob.map((i) => [i.key, i.url, i.author]), [
    ['h0eate', 'https://lobste.rs/s/h0eate/updates', 'pushcx'],
    ['abc123', 'https://example.com/post', 'old-shape'],
  ]);
  assert.deepEqual([lob[0].tags, lob[0].summary, lob[0].score, lob[0].publishedAt], [['announce', 'meta', '151 条评论'], 'Text post & body', 216, '2026-10-19T01:28:53.196Z']);

  const [topic, ...rest] = parseV2ex(v2exBody, NOW);
  assert.equal(rest.length, 0);
  assert.deepEqual([topic.url, topic.author, topic.tags, topic.publishedAt], ['https://www.v2ex.com/t/1250023', 'joe', ['生活', '163 条回复'], new Date(1792393441 * 1000).toISOString()]);
});

test('Hugging Face trending models: id, task, framework and likes; invalid ids skipped', async () => {
  const items = parseHfModels(hfModelsBody, NOW);
  assert.deepEqual(items.map((i) => i.key), ['deepseek-ai/DeepSeek-V4.1-Flash', 'openbmb/MiniCPM-V-4.7', 'google/bert-base']);
  assert.deepEqual([items[0].url, items[0].author, items[0].score, items[0].tags], ['https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash', 'deepseek-ai', 1586, ['image-text-to-text', 'transformers']]);
  assert.match(items[0].summary, /近 30 天下载 17,924 次/);
  assert.equal(items[1].summary, '');
  const DB = createTestD1();
  const status = await runOne(DB, 'hf-models', fakeFetch().fetcher);
  assert.deepEqual([status.ok, status.fetched, status.latestAt], [true, 3, '2026-10-17T02:40:38.000Z']);
  assert.equal(countItems({ DB }), 2);
});

test('Hugging Face papers and the weekly: arXiv ids, upvotes, released issues only', () => {
  const [paper, ...rest] = parseHfPapers(hfBody, NOW);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    [paper.url, paper.discussionUrl, paper.score, paper.author, paper.summary, paper.tags, paper.publishedAt],
    ['https://huggingface.co/papers/2610.16763', 'https://arxiv.org/abs/2610.16763', 42, 'Ada 等', 'We study relations.', ['arXiv 2610.16763', '有代码', '1 条评论'], '2026-10-12T00:00:00.000Z'],
  );

  const issues = parseRuanyfWeekly(weeklyAtom, NOW);
  assert.deepEqual(issues.map((i) => [i.title, i.url, i.publishedAt]), [['科技爱好者周刊（第 414 期）', 'https://github.com/ruanyf/weekly/blob/master/docs/issue-414.md', '2026-10-08T15:14:04.000Z']]);
});

test('OSV: newest ids without malware reports, then each record with severity, CVE and package', () => {
  assert.deepEqual(parseOsvIndex(osvCsv, 10), ['PYSEC-2026-2946', 'GHSA-29mw-wpgm-hmr9', 'PYSEC-2019-1']);
  assert.deepEqual(parseOsvIndex(osvCsv, 1), ['PYSEC-2026-2946']);
  const item = parseOsv(osvEntries['PYSEC-2026-2946'], NOW);
  assert.deepEqual(
    [item?.title, item?.url, item?.severity, item?.tags, item?.summary],
    ['PYSEC-2026-2946 · PraisonAI: approval cache bypass', 'https://osv.dev/vulnerability/PYSEC-2026-2946', 'medium', ['CVE-2026-56074', 'praisonai'], 'Summary The approval system caches decisions.'],
  );
  assert.equal(parseOsv({ id: 'X-1', withdrawn: '2026-01-01T00:00:00Z' }, NOW), null);
});

test('feeds: release titles get the project name, arXiv boilerplate is dropped, huge feeds stop early', () => {
  const release = `<feed><entry><id>r1</id><title>v19.2.0</title><link rel="alternate" href="https://github.com/facebook/react/releases/tag/v19.2.0"/><updated>2026-10-01T00:00:00Z</updated></entry>
    <entry><id>r2</id><title>React 19.1.0</title><link rel="alternate" href="https://github.com/facebook/react/releases/tag/v19.1.0"/></entry></feed>`;
  assert.deepEqual(parseFeedXml(release, 'https://github.com/', NOW, { titlePrefix: 'React' }).map((i) => i.title), ['React v19.2.0', 'React 19.1.0']);

  const arxiv = `<rss><channel><item><title>Paper</title><link>https://arxiv.org/abs/2610.1</link>
    <description>arXiv:2610.1v1 Announce Type: new
Abstract: We propose things.</description></item></channel></rss>`;
  assert.equal(parseFeedXml(arxiv, 'https://arxiv.org/', NOW)[0].summary, 'We propose things.');

  const many = `<rss><channel>${Array.from({ length: 500 }, (_, i) => `<item><title>t${i}</title><link>https://x.test/${i}</link></item>`).join('')}</channel></rss>`;
  assert.equal(parseFeedXml(many, 'https://x.test/', NOW).length, 30);
});

test('OSV channels fetch the index, then details; old and missing records are skipped', async () => {
  const DB = createTestD1();
  const { fetcher, calls } = fakeFetch();
  const status = await runOne(DB, 'osv-pypi', fetcher);
  assert.deepEqual([status.ok, status.fetched], [true, 1]);
  assert.deepEqual(calls.map((c) => c.url.replace('https://osv-vulnerabilities.storage.googleapis.com/PyPI/', '')), ['modified_id.csv', 'PYSEC-2026-2946.json', 'GHSA-29mw-wpgm-hmr9.json', 'PYSEC-2019-1.json']);

  const kev = fakeFetch();
  const kevStatus = await runOne(DB, 'kev', kev.fetcher);
  assert.deepEqual([kevStatus.ok, kevStatus.fetched], [true, 2]);
  const url = kev.calls[0].url;
  assert.ok(url.includes('?hasKev&') && new URL(url).searchParams.get('kevEndDate') === NOW.toISOString(), url);

  // 单条详情失败就跳过；全部失败才算频道失败。
  const partial = await runOne(DB, 'osv-npm', fakeFetch({ 'https://osv-vulnerabilities.storage.googleapis.com/npm/PYSEC-2026': () => new Response('', { status: 500 }) }).fetcher);
  assert.deepEqual([partial.ok, partial.error, partial.fetched], [true, null, 0]);
  const down = await runOne(DB, 'osv-go', fakeFetch({ 'https://osv-vulnerabilities.storage.googleapis.com/Go/P': () => new Response('', { status: 500 }) }).fetcher);
  assert.deepEqual([down.ok, down.error], [false, 'HTTP 500']);
});

test('text helpers: safe urls, plain text, time normalisation, capped reads', async () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl('/a?b=1&amp;c=2', 'https://x.test/feed'), 'https://x.test/a?b=1&c=2');
  assert.equal(plainText('<p>a</p>\n<style>p{}</style><b>b</b> &#x4e2d;&#25991;', 100), 'a b 中文');
  assert.equal(plainText('x'.repeat(50), 10), `${'x'.repeat(9)}…`);
  assert.equal(plainText('We <i>study</i> <a href="#">relations</a>.<br>Next', 100), 'We study relations. Next');
  assert.equal(markdownText('## Summary\n\n**Bold** `code` and [a link](https://x.test).\n```js\nx()\n```', 100), 'Summary Bold code and a link. x()');
  assert.equal(normalizeTime('2026-10-19T08:00:00', NOW), '2026-10-19T08:00:00.000Z');
  assert.equal(normalizeTime('2027-01-01T00:00:00Z', NOW), NOW.toISOString());
  assert.equal(normalizeTime(null, NOW), NOW.toISOString());
  const big = new Response('a'.repeat(5000) + '中');
  assert.equal((await readCapped(big, 100)).length, 100);
});

test('every channel has a group, a description and an http(s) homepage; ids are unique', () => {
  assert.equal(new Set(FEED_CHANNELS.map((c) => c.id)).size, FEED_CHANNELS.length);
  for (const channel of FEED_CHANNELS) {
    assert.ok((FEED_GROUPS as readonly string[]).includes(channel.group), channel.id);
    assert.ok((FEED_SOURCES as readonly string[]).includes(channel.source), channel.id);
    assert.ok(channel.description.length >= 8, channel.id);
    assert.match(channel.homepage, /^https:\/\/[^/]+/, channel.id);
    assert.match(channel.url, /^https:\/\//, channel.id);
  }
  // 每个分组都有频道；安全研究博客都在 sec-* 分组里。
  for (const group of FEED_GROUPS) assert.ok(FEED_CHANNELS.some((c) => c.group === group), group);
  assert.ok(FEED_CHANNELS.filter((c) => c.source === 'security').every((c) => c.group.startsWith('sec-') && c.id.startsWith('sec-')));
});

test('the scheduler picks the most overdue due channels and keeps up with every interval', () => {
  const t0 = NOW.getTime();
  // 从没抓过的按列表顺序先来。
  assert.deepEqual(pickDueChannels(new Map(), t0).map((c) => c.id), FEED_CHANNELS.slice(0, FEED_CHANNELS_PER_RUN).map((c) => c.id));

  // 模拟三天的定时触发（最慢的频道每天一次）：每个频道都会被抓到，相邻两次间隔不短于它的 everyMinutes（允许半个触发间隔的抖动），也不会拖得太久。
  const lastRuns = new Map<string, string>();
  const runs = new Map<string, number[]>();
  for (let t = t0; t < t0 + 72 * 3600_000; t += FEED_CRON_INTERVAL_MS) {
    const picked = pickDueChannels(lastRuns, t);
    assert.ok(picked.length <= FEED_CHANNELS_PER_RUN);
    for (const channel of picked) {
      lastRuns.set(channel.id, new Date(t).toISOString());
      runs.set(channel.id, [...(runs.get(channel.id) ?? []), t]);
    }
  }
  for (const channel of FEED_CHANNELS) {
    const times = runs.get(channel.id) ?? [];
    assert.ok(times.length >= 3, `${channel.id} ran ${times.length} times`);
    // 头一两个小时在抓从没抓过的频道，之后才是稳定状态。
    const steady = times.filter((t) => t >= t0 + 2 * 3600_000);
    const gaps = steady.slice(1).map((t, i) => (t - steady[i]) / 60_000);
    assert.ok(Math.min(...gaps) >= channel.everyMinutes - 2.5, `${channel.id} too often: ${gaps.join(',')}`);
    assert.ok(Math.max(...gaps) <= channel.everyMinutes * 1.5, `${channel.id} starved: ${gaps.join(',')}`);
  }

  // 刚抓过的不会再被选中。
  const fresh = new Map(FEED_CHANNELS.map((c) => [c.id, NOW.toISOString()]));
  assert.deepEqual(pickDueChannels(fresh, t0 + 60_000), []);
  assert.deepEqual(pickDueChannels(fresh, t0 + 30 * 60_000).map((c) => c.id), ['hackernews', 'lobsters']);
});

test('scheduled runs fetch the due channels and record each one', async () => {
  const DB = createTestD1();
  const { fetcher, calls } = fakeFetch();
  const first = await runScheduledFeed({ DB }, NOW.getTime(), fetcher);
  assert.deepEqual(first?.map((c) => [c.id, c.ok, c.fetched]), [
    ['hackernews', true, 3],
    ['hackernews-show', true, 3],
    ['lobsters', true, 2],
    ['v2ex', true, 1],
  ]);
  assert.match(String(new Headers(calls[0].init?.headers).get('user-agent')), /^shixun-feed\//);
  // 下一次触发轮到还没抓过的。
  const next = await runScheduledFeed({ DB }, NOW.getTime() + FEED_CRON_INTERVAL_MS, fetcher);
  assert.deepEqual(next?.map((c) => c.id), ['github-trending', 'release-react', 'release-next-js', 'release-bun']);
  assert.equal(await runScheduledFeed({}, NOW.getTime(), fetcher), null);
});

test('re-fetches keep first-seen times, skip unchanged rows and record failures without dropping data', async () => {
  const DB = createTestD1();
  const first = await runOne(DB, 'github-trending', fakeFetch().fetcher);
  assert.deepEqual([first.id, first.ok, first.fetched], ['github-trending', true, 2]);

  const row = () => DB.raw.prepare("SELECT published_at, fetched_at, score FROM feed_items WHERE id = 'github-trending:acme/rocket'").get() as Record<string, unknown>;
  const before = row();
  // 内容没变：不写（fetched_at 不动）。
  await runOne(DB, 'github-trending', fakeFetch().fetcher, {}, new Date(NOW.getTime() + 3600_000));
  assert.deepEqual(row(), before);

  // 得分变了：更新，首次上榜时间不变。
  await runOne(DB, 'github-trending', fakeFetch({ 'https://github.com/trending': () => new Response(trendingHtml.replace(/1,234 stars/g, '2,000 stars')) }).fetcher, {}, new Date(NOW.getTime() + 7200_000));
  const after = row();
  assert.equal(after.published_at, before.published_at);
  assert.notEqual(after.fetched_at, before.fetched_at);
  assert.equal(after.score, 2000);

  // 失败：记录原因，已有条目保留。
  const failed = await runOne(DB, 'github-trending', fakeFetch({ 'https://github.com/trending': () => new Response('', { status: 503 }) }).fetcher);
  assert.deepEqual([failed.ok, failed.error], [false, 'HTTP 503']);
  assert.equal((DB.raw.prepare('SELECT COUNT(*) AS n FROM feed_items').get() as { n: number }).n, 2);

  // 页面改版、解析出 0 条也算失败；可能为空的频道（漏洞时间窗、arXiv 周末）不算。
  const empty = await runOne(DB, 'github-trending', fakeFetch({ 'https://github.com/trending': () => new Response('<html></html>') }).fetcher);
  assert.equal(empty.error, '没有解析出条目');
  const quiet = await runOne(DB, 'arxiv-ai', fakeFetch({ 'https://rss.arxiv.org/': () => new Response('<rss><channel></channel></rss>') }).fetcher);
  assert.deepEqual([quiet.ok, quiet.error], [true, null]);
});

test('GitHub API rate limits explain how to fix them; NVD asks for both severities; tokens are sent', async () => {
  const DB = createTestD1();
  const limited = await runOne(DB, 'ghsa', fakeFetch({ 'https://api.github.com/': () => new Response('{}', { status: 403 }) }).fetcher);
  assert.match(String(limited.error), /GITHUB_TOKEN/);

  const { fetcher, calls } = fakeFetch();
  await runOne(DB, 'ghsa', fetcher, { GITHUB_TOKEN: 'gh-test' });
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), 'Bearer gh-test');

  const nvd = fakeFetch();
  const status = await runOne(DB, 'nvd', nvd.fetcher, { NVD_API_KEY: 'nvd-test' });
  assert.deepEqual([status.ok, status.fetched], [true, 2]);
  assert.deepEqual(nvd.calls.map((c) => new URL(c.url).searchParams.get('cvssV3Severity')), ['CRITICAL', 'HIGH']);
  assert.ok(nvd.calls.every((c) => c.url.endsWith('&noRejected') && new Headers(c.init?.headers).get('apikey') === 'nvd-test'));
});

test('items older than the retention window are pruned on the next run', async () => {
  const DB = createTestD1();
  DB.raw.exec(
    `INSERT INTO feed_items (id,source,channel,title,url,published_at,fetched_at) VALUES ('rss-lwn:old','rss','rss-lwn','old','https://lwn.net/old','${new Date(NOW.getTime() - FEED_RETENTION_MS - 2 * 86_400_000).toISOString()}','x')`,
  );
  await runOne(DB, 'rss-lwn', fakeFetch().fetcher);
  assert.equal(DB.raw.prepare("SELECT id FROM feed_items WHERE id = 'rss-lwn:old'").get(), undefined);
});

test('only items inside the retention window are stored, but the newest date is remembered', async () => {
  const DB = createTestD1();
  const oldAtom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Old</title>
    <entry><title>Glitching a chip</title><link href="https://old.test/a" rel="alternate"/><published>2021-06-01T00:00:00Z</published><id>a</id></entry>
    <entry><title>Older</title><link href="https://old.test/b" rel="alternate"/><published>2020-01-01T00:00:00Z</published><id>b</id></entry></feed>`;
  const status = await runOne(DB, 'sec-limitedresults', fakeFetch({ 'https://limitedresults.com/': () => new Response(oldAtom) }).fetcher);
  assert.deepEqual([status.ok, status.fetched, status.latestAt], [true, 2, '2021-06-01T00:00:00.000Z']);
  assert.equal(countItems({ DB }), 0);

  // 抓取失败时保留上次记下的最新发布时间。
  await runOne(DB, 'sec-limitedresults', fakeFetch({ 'https://limitedresults.com/': () => new Response('', { status: 500 }) }).fetcher);
  const row = DB.raw.prepare("SELECT ok, latest_at FROM feed_channels WHERE id = 'sec-limitedresults'").get() as { ok: number; latest_at: string };
  assert.deepEqual([row.ok, row.latest_at], [0, '2021-06-01T00:00:00.000Z']);
});

test('GET /api/feed/channels describes every channel with its last run', async () => {
  const { fetcher } = fakeFetch();
  const h = createHarness({ INGEST_TOKEN: 'ingest-test' }, { withSeeds: false, feedFetch: fetcher, now: () => NOW });
  await h.call(apiPaths.feedRefresh, { method: 'POST', json: { channel: 'rss-lwn' }, headers: { authorization: 'Bearer ingest-test' } });
  const response = await h.call(apiPaths.feedChannels);
  assert.equal(response.status, 200);
  const { channels } = (await response.json()) as FeedChannelsResponse;
  assert.deepEqual(channels.map((c) => c.id), FEED_CHANNELS.map((c) => c.id));
  const lwn = channels.find((c) => c.id === 'rss-lwn')!;
  assert.deepEqual(
    [lwn.group, lwn.homepage, lwn.everyMinutes, lwn.ok, lwn.fetched, lwn.lastRunAt, lwn.latestAt],
    // 样例里有一条没有有效日期，按抓取时间算，所以最新一篇就是现在。
    ['blogs', 'https://lwn.net/', 180, true, 2, NOW.toISOString(), NOW.toISOString()],
  );
  const portswigger = channels.find((c) => c.id === 'sec-portswigger')!;
  assert.deepEqual([portswigger.source, portswigger.group, portswigger.lastRunAt, portswigger.latestAt], ['security', 'sec-web', null, null]);
  assert.ok(portswigger.description);
});

test('GET /api/feed pages newest first, filters by source and lists every channel', async () => {
  const { fetcher } = fakeFetch();
  const h = createHarness({ INGEST_TOKEN: 'ingest-test' }, { withSeeds: false, feedFetch: fetcher, now: () => NOW });
  const empty = (await (await h.call(apiPaths.feed)).json()) as FeedResponse;
  assert.deepEqual(empty.items, []);
  assert.equal(empty.channels.length, FEED_CHANNELS.length);
  assert.ok(empty.channels.every((c) => c.lastRunAt === null && !c.ok));

  // 一次刷新受子请求预算限制，抓不完就再刷新一次；每次先抓最久没更新的。
  const fetched = new Set<string>();
  for (let round = 0; round < 7 && fetched.size < FEED_CHANNELS.length; round++) {
    const refreshed = await h.call(apiPaths.feedRefresh, { method: 'POST', headers: { authorization: 'Bearer ingest-test' } });
    assert.equal(refreshed.status, 200);
    const { channels } = (await refreshed.json()) as FeedRefreshResponse;
    assert.ok(channels.every((c) => c.ok), JSON.stringify(channels.filter((c) => !c.ok)));
    assert.ok(channels.reduce((sum, c) => sum + channelCost(findChannel(c.id)!), 0) <= FEED_REFRESH_BUDGET);
    if (round === 0) assert.ok(channels.length < FEED_CHANNELS.length);
    for (const c of channels) fetched.add(c.id);
  }
  assert.equal(fetched.size, FEED_CHANNELS.length);

  const all = (await (await h.call(`${apiPaths.feed}?limit=5`)).json()) as FeedResponse;
  assert.equal(all.items.length, 5);
  assert.ok(all.nextCursor);
  const times = all.items.map((i) => i.publishedAt);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.ok(all.items.every((i) => i.channelName && i.url.startsWith('http')));

  const ids = new Set(all.items.map((i) => i.id));
  let cursor: string | null = all.nextCursor;
  while (cursor) {
    const page = (await (await h.call(`${apiPaths.feed}?${new URLSearchParams({ limit: '5', cursor })}`)).json()) as FeedResponse;
    for (const item of page.items) {
      assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
      ids.add(item.id);
    }
    cursor = page.nextCursor;
  }
  assert.equal(ids.size, countItems(h));

  const hn = (await (await h.call(`${apiPaths.feed}?source=hackernews`)).json()) as FeedResponse;
  // 首页与 Show HN 同属 hackernews 来源。
  assert.deepEqual(hn.items.map((i) => i.id), ['hackernews:101', 'hackernews-show:101', 'hackernews:102', 'hackernews-show:102', 'hackernews:103', 'hackernews-show:103']);
  assert.equal(hn.items[0].channelName, 'Hacker News');
  assert.equal(hn.nextCursor, null);

  for (const bad of ['source=x', 'limit=0', 'limit=101', 'limit=abc', 'cursor=nope', 'cursor=2026-10-19|']) {
    assert.equal((await h.call(`${apiPaths.feed}?${bad}`)).status, 400, bad);
  }
});

function countItems(h: { DB: ReturnType<typeof createTestD1> }): number {
  return (h.DB.raw.prepare('SELECT COUNT(*) AS n FROM feed_items').get() as { n: number }).n;
}

test('refreshing needs the ingest token or a signed-in user; one channel can be picked', async () => {
  const { fetcher, calls } = fakeFetch();
  const h = createHarness({ INGEST_TOKEN: 'ingest-test' }, { withSeeds: false, feedFetch: fetcher, now: () => NOW });
  assert.equal((await h.call(apiPaths.feedRefresh, { method: 'POST' })).status, 401);
  assert.equal((await h.call(apiPaths.feedRefresh, { method: 'POST', headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await h.call(apiPaths.feedRefresh, { method: 'POST', headers: { ...USER_HEADERS, origin: 'https://evil.test' } })).status, 403);
  assert.equal(calls.length, 0);

  const bad = await h.call(apiPaths.feedRefresh, { method: 'POST', json: { channel: 'nope' }, headers: { ...USER_HEADERS, origin: ORIGIN } });
  assert.equal(bad.status, 400);
  const one = await h.call(apiPaths.feedRefresh, { method: 'POST', json: { channel: 'hackernews' }, headers: { ...USER_HEADERS, origin: ORIGIN } });
  assert.equal(one.status, 200);
  assert.deepEqual(((await one.json()) as FeedRefreshResponse).channels.map((c) => c.id), ['hackernews']);
  assert.equal(calls.length, 1);
});
