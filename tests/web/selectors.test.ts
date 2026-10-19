import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reportSummary, type Report } from '#shared';
import { deriveBrowse, matchesQuery, splitHighlight } from '#web/lib/selectors.ts';
import { browseReducer, initialBrowse } from '#web/state/browse.ts';
import { archiveReducer, initialArchive } from '#web/state/archive.ts';
import { monthDay, readMinutes, timeAgo, tocLabel } from '#web/lib/format.ts';
import { fileProblem, guessMetadata } from '#web/lib/import-file.ts';
import { parseReportId, reportHash } from '#web/lib/route.ts';

const rawSeeds: Report[] = JSON.parse(fs.readFileSync(new URL('../../data/seed-reports.json', import.meta.url), 'utf8'));
const seeds = rawSeeds.map((r) => reportSummary(r));
const none = new Set<string>();

test('default view shows only the active edition and counts follow the scope', () => {
  const state = initialBrowse(seeds[0].id);
  const model = deriveBrowse(seeds, state, none);
  assert.equal(model.activeReport?.id, seeds[0].id);
  assert.ok(model.filtered.length > 0);
  assert.ok(model.filtered.every((s) => s.reportId === seeds[0].id));
  assert.equal(model.counts['全部'], model.scoped.length);
  assert.equal(model.storyCounts.get(seeds[0].id), model.scoped.length);
});

test('unknown edition falls back to the newest report', () => {
  assert.equal(deriveBrowse(seeds, initialBrowse('missing'), none).activeReport?.id, seeds[0].id);
  assert.equal(deriveBrowse([], initialBrowse(''), none).activeReport, undefined);
});

test('searching spans every edition and ignores the saved/edition scope', () => {
  const all = deriveBrowse(seeds, initialBrowse(seeds[0].id), none).stories;
  const word = all[0].title.slice(0, 4);
  const model = deriveBrowse(seeds, { ...initialBrowse(seeds[0].id), query: word }, none);
  assert.ok(model.filtered.length >= 1);
  assert.ok(model.filtered.every((s) => matchesQuery(s, word)));
  assert.equal(model.scoped.length, all.length);
});

test('full-text hits from the server replace local title/summary matching', () => {
  const all = deriveBrowse(seeds, initialBrowse(seeds[0].id), none).stories;
  const hit = all[2].id;
  const query = 'zz-no-local-match-zz';
  assert.equal(deriveBrowse(seeds, { ...initialBrowse(seeds[0].id), query }, none).filtered.length, 0);
  const model = deriveBrowse(seeds, { ...initialBrowse(seeds[0].id), query }, none, new Set([hit]));
  assert.deepEqual(model.filtered.map((s) => s.id), [hit]);
});

test('list summaries carry no raw text or story bodies', () => {
  for (const report of seeds) {
    assert.ok(!('raw' in report));
    assert.ok(report.chars > 0 && report.stories.length > 0);
    assert.ok(report.stories.every((s) => !('body' in s)));
  }
});

test('saved view lists only saved stories', () => {
  const stories = deriveBrowse(seeds, initialBrowse(seeds[0].id), none).stories;
  const pick = stories[1].id;
  const model = deriveBrowse(seeds, { ...initialBrowse(''), view: 'saved' }, new Set([pick]));
  assert.deepEqual(model.filtered.map((s) => s.id), [pick]);
});

test('category filter narrows results', () => {
  const base = deriveBrowse(seeds, initialBrowse(seeds[0].id), none);
  const ai = deriveBrowse(seeds, { ...initialBrowse(seeds[0].id), category: 'AI' }, none);
  assert.ok(ai.filtered.length <= base.filtered.length);
  assert.ok(ai.filtered.every((s) => s.tags.includes('AI')));
  assert.equal(ai.counts['AI'], ai.filtered.length);
});

test('highlight splits case-insensitively and treats the query literally', () => {
  assert.deepEqual(splitHighlight('Hello World', 'o w'), [
    { text: 'Hell', match: false },
    { text: 'o W', match: true },
    { text: 'orld', match: false },
  ]);
  assert.deepEqual(splitHighlight('a.b (c)', '.'), [
    { text: 'a', match: false },
    { text: '.', match: true },
    { text: 'b (c)', match: false },
  ]);
  assert.deepEqual(splitHighlight('abc', '  '), [{ text: 'abc', match: false }]);
  assert.deepEqual(splitHighlight('abc', '(('), [{ text: 'abc', match: false }]);
});

test('browse reducer resets filters on navigation and honors sidebar focus rules', () => {
  const start = { ...initialBrowse('a'), view: 'saved' as const, category: 'AI' as const, query: 'x' };
  assert.deepEqual(browseReducer(start, { type: 'navigate', view: 'archive' }), { view: 'archive', category: '全部', query: '', edition: 'a' });
  assert.equal(browseReducer({ ...start, view: 'archive' }, { type: 'focus-category', category: '网安', fromReader: false }).view, 'today');
  assert.equal(browseReducer({ ...start, view: 'saved' }, { type: 'focus-category', category: '网安', fromReader: false }).view, 'saved');
  assert.equal(browseReducer({ ...start, view: 'saved' }, { type: 'focus-category', category: '网安', fromReader: true }).view, 'today');
  assert.deepEqual(browseReducer(start, { type: 'show-edition', id: 'b' }), { view: 'today', category: '全部', query: '', edition: 'b' });
  assert.deepEqual(browseReducer(start, { type: 'clear-filters' }), { ...start, category: '全部', query: '' });
});

test('archive reducer tracks loading, refresh and failures', () => {
  const loading = initialArchive(undefined);
  assert.equal(loading.status, 'loading');
  const failed = archiveReducer(loading, { type: 'failed', message: '坏了' });
  assert.deepEqual([failed.status, failed.error], ['ready', '坏了']);
  const refreshing = archiveReducer(failed, { type: 'refresh-start' });
  assert.deepEqual([refreshing.refreshing, refreshing.error], [true, null]);
  const data = { reports: seeds, sync: null as never, drive: { status: 'imported' as const, folderId: 'f' } };
  const loaded = archiveReducer(refreshing, { type: 'loaded', data });
  assert.deepEqual([loaded.reports.length, loaded.refreshing, loaded.hasDriveImports], [seeds.length, false, true]);
  assert.equal(initialArchive({ data: null, error: '读取失败' }).error, '读取失败');
});

test('format helpers', () => {
  assert.deepEqual(monthDay('2026-10-16'), ['10', '16']);
  assert.deepEqual(monthDay(undefined), ['—', '—']);
  assert.equal(readMinutes(1), 1);
  assert.equal(readMinutes(4500), 10);
  assert.equal(tocLabel('① 昨日重要动态'), '昨日重要动态');
});

test('import file checks and metadata guessing', () => {
  assert.equal(fileProblem({ name: 'a.md', size: 10 }), null);
  assert.match(fileProblem({ name: 'a.pdf', size: 10 }) ?? '', /\.md/);
  assert.match(fileProblem({ name: 'a.md', size: 600_000 }) ?? '', /500 KB/);
  assert.deepEqual(guessMetadata('2026-10-16_安全专题.md', ''), { date: '2026-10-16', topic: '安全专题' });
  assert.deepEqual(guessMetadata('notes.md', '# 2026-09-01 全球技术社区日报'), { date: '2026-09-01', topic: '全球技术社区' });
  assert.deepEqual(guessMetadata('notes.md', '无日期'), { date: '', topic: '全球技术社区' });
});

test('report route hash round-trips ids with special characters', () => {
  const id = 'drive-1AA/9 Z+4C';
  assert.equal(parseReportId('#' + reportHash(id)), id);
  assert.equal(parseReportId(''), '');
  assert.equal(parseReportId('#other=1'), '');
});

test('timeAgo uses the caller clock and falls back to the date after 30 days', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.equal(timeAgo('2026-10-19T11:59:30Z', now), '刚刚');
  assert.equal(timeAgo('2026-10-19T11:48:00Z', now), '12 分钟前');
  assert.equal(timeAgo('2026-10-19T09:00:00Z', now), '3 小时前');
  assert.equal(timeAgo('2026-10-14T12:00:00Z', now), '5 天前');
  assert.equal(timeAgo('2026-08-01T00:00:00Z', now), '2026-08-01');
  assert.equal(timeAgo('nope', now), '');
});
