import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LISTED_VERSIONS, apiPaths } from '#shared';
import type { IngestResult, ReportVersionsResponse, ReportsResponse } from '#shared';
import { ORIGIN, USER_HEADERS, createHarness, sampleRaw, seeds } from './helpers/harness.ts';

const body = { raw: sampleRaw, date: '2026-10-20', topic: '全球技术社区' as const };
/** 所有者操作必须来自本站页面。 */
const OWNER = { ...USER_HEADERS, origin: ORIGIN };

type Harness = ReturnType<typeof createHarness>;

async function importRaw(h: Harness, raw: string): Promise<IngestResult> {
  const res = await h.call(apiPaths.reports, { method: 'POST', json: { ...body, raw }, headers: USER_HEADERS });
  assert.equal(res.status, 200);
  return (await res.json()) as IngestResult;
}

async function versionsOf(h: Harness, id: string): Promise<ReportVersionsResponse> {
  const res = await h.call(apiPaths.reportVersions(id));
  assert.equal(res.status, 200);
  return (await res.json()) as ReportVersionsResponse;
}

test('versions list the current revision and replaced texts, newest first', async () => {
  let clock = Date.parse('2026-10-20T00:00:00Z');
  const h = createHarness({}, { withSeeds: false, now: () => new Date((clock += 60_000)) });
  const first = await importRaw(h, sampleRaw);
  await importRaw(h, `${sampleRaw}\n第二版。`);
  const third = await importRaw(h, `${sampleRaw}\n第三版。`);

  const data = await versionsOf(h, first.id);
  assert.equal(data.reportId, first.id);
  assert.equal(data.stored, true);
  assert.deepEqual({ revision: data.current.revision, hash: data.current.hash }, { revision: 3, hash: third.hash });
  assert.equal(data.current.chars, [...`${sampleRaw}\n第三版。`].length);
  assert.equal(data.truncated, false);
  assert.equal(data.versions.length, 2);
  assert.ok(data.versions[0].savedAt > data.versions[1].savedAt);
  assert.equal(data.versions[1].hash, first.hash);
  assert.equal(data.versions[1].chars, [...sampleRaw].length);

  const old = await h.call(apiPaths.reportVersion(first.id, data.versions[1].id));
  assert.equal(old.status, 200);
  assert.match(old.headers.get('content-disposition') ?? '', /attachment/);
  assert.equal(await old.text(), sampleRaw);
});

test('versions of a seed have no history; unknown ids and foreign versions are 404', async () => {
  const h = createHarness();
  const seed = await versionsOf(h, seeds[1].id);
  assert.deepEqual(seed.versions, []);
  assert.equal(seed.stored, false);
  assert.equal(seed.current.chars, [...seeds[1].raw].length);
  assert.equal((await h.call(apiPaths.reportVersions('nope'))).status, 404);

  const a = await importRaw(h, sampleRaw);
  await importRaw(h, `${sampleRaw}\n改。`);
  const [version] = (await versionsOf(h, a.id)).versions;
  assert.equal((await h.call(apiPaths.reportVersion(seeds[1].id, version.id))).status, 404);
});

test('version listing is capped and says so', async () => {
  const h = createHarness({}, { withSeeds: false });
  const { id } = await importRaw(h, sampleRaw);
  for (let i = 0; i < MAX_LISTED_VERSIONS + 1; i++) await importRaw(h, `${sampleRaw}\n${i}`);
  const data = await versionsOf(h, id);
  assert.equal(data.versions.length, MAX_LISTED_VERSIONS);
  assert.equal(data.truncated, true);
  assert.equal(data.current.revision, MAX_LISTED_VERSIONS + 2);
});

test('restore writes the old text as a new revision and keeps the replaced one', async () => {
  const h = createHarness({}, { withSeeds: false });
  const first = await importRaw(h, sampleRaw);
  const changed = `${sampleRaw}\n导错的一段。`;
  await importRaw(h, changed);
  const [old] = (await versionsOf(h, first.id)).versions;

  const res = await h.call(apiPaths.restoreVersion(first.id, old.id), { method: 'POST', headers: OWNER });
  assert.equal(res.status, 200);
  const restored = (await res.json()) as IngestResult;
  assert.deepEqual({ status: restored.status, revision: restored.revision, hash: restored.hash }, { status: 'updated', revision: 3, hash: first.hash });
  assert.equal(await (await h.call(apiPaths.report(first.id))).text(), sampleRaw);

  const after = await versionsOf(h, first.id);
  assert.equal(after.versions.length, 2);
  assert.equal(after.versions[0].chars, [...changed].length);

  // 恢复成和当前一样的内容：不写入。
  const again = (await (await h.call(apiPaths.restoreVersion(first.id, old.id), { method: 'POST', headers: OWNER })).json()) as IngestResult;
  assert.equal(again.status, 'unchanged');
  assert.equal((await versionsOf(h, first.id)).versions.length, 2);
});

test('restore and delete are owner-only, same-origin actions', async () => {
  const h = createHarness({ OWNER_EMAILS: 'owner@example.com' }, { withSeeds: false });
  const { id } = await importRaw(h, sampleRaw);
  await importRaw(h, `${sampleRaw}\n改。`);
  const [version] = (await versionsOf(h, id)).versions;
  const stranger = { 'oai-authenticated-user-id': 'u2', 'oai-authenticated-user-email': 'someone@example.com', origin: ORIGIN };

  for (const [path, method] of [
    [apiPaths.restoreVersion(id, version.id), 'POST'],
    [apiPaths.report(id), 'DELETE'],
  ] as const) {
    assert.equal((await h.call(path, { method, headers: { origin: ORIGIN } })).status, 401, `${method} anonymous`);
    assert.equal((await h.call(path, { method, headers: USER_HEADERS })).status, 403, `${method} without Origin`);
    assert.equal((await h.call(path, { method, headers: { ...USER_HEADERS, origin: 'https://evil.example' } })).status, 403, `${method} cross-origin`);
    const denied = await h.call(path, { method, headers: stranger });
    assert.equal(denied.status, 403);
    assert.equal(((await denied.json()) as { code: string }).code, 'not_owner');
  }
  assert.equal(await (await h.call(apiPaths.report(id))).text(), `${sampleRaw}\n改。`);
});

test('delete removes the report and its stories but keeps the text in history', async () => {
  const h = createHarness({}, { withSeeds: false });
  const { id, hash } = await importRaw(h, sampleRaw);

  const res = await h.call(apiPaths.report(id), { method: 'DELETE', headers: OWNER });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id, deleted: true });

  const list = (await (await h.call(apiPaths.reports)).json()) as ReportsResponse;
  assert.deepEqual(list.reports, []);
  assert.equal((await h.call(apiPaths.report(id))).status, 404);
  assert.equal((h.DB.raw.prepare('SELECT count(*) AS n FROM report_stories').get() as { n: number }).n, 0);
  const kept = h.DB.raw.prepare('SELECT raw, hash FROM report_versions WHERE report_id = ?').all(id) as { raw: string; hash: string }[];
  assert.deepEqual(kept.map((row) => ({ ...row })), [{ raw: sampleRaw, hash }]);

  assert.equal((await h.call(apiPaths.report(id), { method: 'DELETE', headers: OWNER })).status, 404);
  // 再次导入同一期是全新的第 1 版。
  const again = await importRaw(h, sampleRaw);
  assert.deepEqual({ status: again.status, revision: again.revision }, { status: 'created', revision: 1 });
});

test('seeds cannot be deleted, and deleting a stored report brings back the seed it replaced', async () => {
  const h = createHarness();
  const seed = seeds[1];
  const res = await h.call(apiPaths.report(seed.id), { method: 'DELETE', headers: OWNER });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, 'seed_report');

  const replaced = (await h.call(apiPaths.reports, { method: 'POST', json: { raw: sampleRaw, date: seeds[0].date, topic: seeds[0].topic }, headers: USER_HEADERS }));
  const { id } = (await replaced.json()) as IngestResult;
  const ids = async () => ((await (await h.call(apiPaths.reports)).json()) as ReportsResponse).reports.map((r) => r.id);
  assert.ok((await ids()).includes(id));
  assert.equal((await h.call(apiPaths.report(id), { method: 'DELETE', headers: OWNER })).status, 200);
  assert.deepEqual((await ids()).sort(), seeds.map((s) => s.id).sort());
});

test('concurrent imports of the same report get distinct revisions', async () => {
  const h = createHarness({}, { withSeeds: false });
  const { id } = await importRaw(h, sampleRaw);
  const results = await Promise.all([importRaw(h, `${sampleRaw}\nA`), importRaw(h, `${sampleRaw}\nB`)]);
  assert.deepEqual(results.map((r) => r.revision).sort(), [2, 3]);
  assert.equal((await versionsOf(h, id)).current.revision, 3);
});
