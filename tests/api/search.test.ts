import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SEARCH_CHARS, storiesFor } from '#shared';
import type { ReportsResponse, SearchResponse, Story } from '#shared';
import { USER_HEADERS, createHarness, sampleRaw, seeds } from './helpers/harness.ts';

const body = { raw: sampleRaw, date: '2026-10-16', topic: '全球技术社区' as const };

/** 只出现在正文里、标题和摘要里都没有的一段文字：证明搜索覆盖全文。 */
function bodyOnlyNeedle(stories: readonly Story[], raw: string): { story: Story; needle: string } {
  for (const story of stories) {
    const head = `${story.title}\n${story.summary}`.toLowerCase();
    for (let i = 0; i + 6 <= story.body.length; i += 3) {
      const needle = story.body.slice(i, i + 6);
      if (needle.trim().length === 6 && !head.includes(needle.toLowerCase()) && raw.split(needle).length === 2) return { story, needle };
    }
  }
  throw new Error('no body-only needle');
}

const search = async (h: ReturnType<typeof createHarness>, q: string) => {
  const res = await h.call(`/api/search?${new URLSearchParams({ q })}`);
  assert.equal(res.status, 200);
  return ((await res.json()) as SearchResponse).storyIds;
};

test('list carries metadata and story summaries only, no raw text or bodies', async () => {
  const h = createHarness();
  await h.call('/api/reports', { method: 'POST', json: { ...body, date: '2026-10-20' }, headers: USER_HEADERS });
  const data = (await (await h.call('/api/reports')).json()) as ReportsResponse;
  assert.equal(data.reports.length, seeds.length + 1);
  for (const report of data.reports) {
    assert.ok(!('raw' in report), report.id);
    assert.ok(report.chars > 0 && report.links >= 0);
    assert.equal(report.stories.length, 10, report.id);
    for (const story of report.stories) {
      assert.ok(!('body' in story));
      assert.equal(story.reportId, report.id);
      assert.equal(story.date, report.date);
      assert.ok(story.title && Array.isArray(story.tags));
    }
  }
  const stored = data.reports.find((r) => r.date === '2026-10-20');
  assert.equal(stored?.chars, sampleRaw.length);
  assert.deepEqual(stored?.stories.map((s) => s.title), storiesFor({ ...seeds[0], id: stored!.id }).map((s) => s.title));
});

test('search matches story bodies in seeds, case-insensitively', async () => {
  const h = createHarness();
  const { story, needle } = bodyOnlyNeedle(storiesFor(seeds[1]), seeds[1].raw);
  assert.ok((await search(h, needle)).includes(story.id));
  assert.ok((await search(h, ` ${needle.toUpperCase()} `)).includes(story.id));
  assert.deepEqual(await search(h, 'zz-绝不会出现的词-zz'), []);
  assert.deepEqual(await search(h, '   '), []);
});

test('search covers stored reports and skips superseded seeds', async () => {
  const h = createHarness();
  const stories = storiesFor(seeds[0]);
  const { story, needle } = bodyOnlyNeedle(stories, sampleRaw);
  const index = stories.indexOf(story);
  const raw = sampleRaw.replace(needle, `${needle}全文独有标记`);
  const created = (await (await h.call('/api/reports', { method: 'POST', json: { ...body, raw }, headers: USER_HEADERS })).json()) as { id: string };

  // 旧种子与新导入同 id、同日期主题，只剩数据库那份。
  assert.deepEqual(await search(h, '全文独有标记'), [`${created.id}--${index}`]);
  assert.deepEqual((await search(h, needle)).filter((id) => id.endsWith(`--${index}`) && id.startsWith(created.id)), [`${created.id}--${index}`]);
});

test('search treats LIKE wildcards literally', async () => {
  const h = createHarness({}, { withSeeds: false });
  await h.call('/api/reports', { method: 'POST', json: body, headers: USER_HEADERS });
  const { id } = (await (await h.call('/api/reports')).json() as ReportsResponse).reports[0];
  const expected = (needle: string) =>
    storiesFor({ ...seeds[0], id }).filter((st) => `${st.title}\n${st.body}`.includes(needle)).map((st) => st.id);
  for (const needle of ['%', '_', '%_%']) assert.deepEqual(await search(h, needle), expected(needle), needle);
});

test('search rejects overlong queries with 400', async () => {
  const h = createHarness();
  const res = await h.call(`/api/search?${new URLSearchParams({ q: 'x'.repeat(MAX_SEARCH_CHARS + 1) })}`);
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /100/);
  assert.equal((await h.callWithoutDb('/api/search?q=x')).status, 503);
});

test('ingest writes story rows and a re-import replaces them', async () => {
  const h = createHarness({}, { withSeeds: false });
  const post = (raw: string) => h.call('/api/reports', { method: 'POST', json: { ...body, raw }, headers: USER_HEADERS });
  const { id } = (await (await post(sampleRaw)).json()) as { id: string };
  const rows = () => h.DB.raw.prepare('SELECT idx, title, body FROM report_stories WHERE report_id = ? ORDER BY idx').all(id) as { idx: number; title: string; body: string }[];
  assert.equal(rows().length, 10);
  assert.deepEqual(rows().map((r) => r.title), storiesFor(seeds[0]).map((s) => s.title));

  await post(sampleRaw.replace(storiesFor(seeds[0])[0].title, '改过的标题'));
  assert.equal(rows().length, 10);
  assert.equal(rows()[0].title, '改过的标题');
  const meta = h.DB.raw.prepare('SELECT char_count, link_count, digest_version FROM reports WHERE id = ?').get(id) as Record<string, number>;
  assert.ok(meta.char_count > 0 && meta.digest_version > 0);
});

test('stale digests are rebuilt from raw on read', async () => {
  const h = createHarness({}, { withSeeds: false });
  const { id } = (await (await h.call('/api/reports', { method: 'POST', json: body, headers: USER_HEADERS })).json()) as { id: string };
  h.DB.raw.prepare('DELETE FROM report_stories WHERE report_id = ?').run(id);
  h.DB.raw.prepare('UPDATE reports SET digest_version = 0, char_count = 0 WHERE id = ?').run(id);

  // 过期的那期在搜索里也不会丢（内存兜底），读列表后回写。
  const { needle, story } = bodyOnlyNeedle(storiesFor({ ...seeds[0], id }), sampleRaw);
  assert.ok((await search(h, needle)).includes(story.id));
  const data = (await (await h.call('/api/reports')).json()) as ReportsResponse;
  assert.equal(data.reports[0].stories.length, 10);
  assert.equal(data.reports[0].chars, sampleRaw.length);
  assert.equal((h.DB.raw.prepare('SELECT count(*) AS n FROM report_stories WHERE report_id = ?').get(id) as { n: number }).n, 10);
  assert.ok(((h.DB.raw.prepare('SELECT digest_version AS v FROM reports WHERE id = ?').get(id)) as { v: number }).v > 0);
});
