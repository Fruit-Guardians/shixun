import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, USER_HEADERS, createHarness, sampleRaw, seeds } from './helpers/harness.ts';
import type { ReportsResponse } from '#shared';

const body = { raw: sampleRaw, date: '2026-10-16', topic: '全球技术社区' as const };

test('GET /api/reports returns seeds plus real sync state, never cached', async () => {
  const h = createHarness();
  const res = await h.call('/api/reports');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const data = (await res.json()) as ReportsResponse;
  assert.equal(data.reports.length, seeds.length);
  assert.equal(data.sync.state, 'awaiting_setup');
  assert.equal(data.drive.status, 'not_connected');
  assert.ok(data.reports.every((r) => !('hash' in r)));
});

test('GET /api/reports degrades to 503 JSON when the database is missing', async () => {
  const h = createHarness();
  const res = await h.callWithoutDb('/api/reports');
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as { error: string }).error, /归档暂时读取失败/);
});

test('import requires a signed-in user or service token', async () => {
  const h = createHarness({ INGEST_TOKEN: 'secret-token' });
  assert.equal((await h.call('/api/reports', { method: 'POST', json: body })).status, 401);
  assert.equal((await h.call('/api/reports', { method: 'POST', json: body, headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await h.call('/api/reports', { method: 'POST', json: body, headers: { authorization: 'Bearer secret-token' } })).status, 200);
  assert.equal((await h.call('/api/reports', { method: 'POST', json: body, headers: USER_HEADERS })).status, 200);
});

test('import rejects cross-origin browsers (CSRF)', async () => {
  const h = createHarness();
  const res = await h.call('/api/reports', { method: 'POST', json: body, headers: { ...USER_HEADERS, origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  const ok = await h.call('/api/reports', { method: 'POST', json: body, headers: { ...USER_HEADERS, origin: ORIGIN } });
  assert.equal(ok.status, 200);
});

test('import is idempotent, versions updates and reads back exact text', async () => {
  const h = createHarness({}, false);
  const post = (raw: string) => h.call('/api/reports', { method: 'POST', json: { ...body, raw }, headers: USER_HEADERS });

  const created = (await (await post(sampleRaw)).json()) as { id: string; status: string; revision: number };
  assert.equal(created.status, 'created');
  assert.equal(created.revision, 1);

  const same = (await (await post(sampleRaw)).json()) as { status: string };
  assert.equal(same.status, 'unchanged');

  const changed = sampleRaw + '\n补充一行。';
  const updated = (await (await post(changed)).json()) as { status: string; revision: number };
  assert.equal(updated.status, 'updated');
  assert.equal(updated.revision, 2);

  const versions = h.DB.raw.prepare('SELECT raw FROM report_versions WHERE report_id = ?').all(created.id) as { raw: string }[];
  assert.equal(versions.length, 1);
  assert.equal(versions[0].raw, sampleRaw);

  const download = await h.call(`/api/reports/${encodeURIComponent(created.id)}`);
  assert.equal(await download.text(), changed);
});

test('validation errors are 400 with a user-facing message', async () => {
  const h = createHarness();
  const res = await h.call('/api/reports', { method: 'POST', json: { raw: 'x', date: '2026-10-16' }, headers: USER_HEADERS });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /正文过短/);
  const badJson = await h.call('/api/reports', { method: 'POST', body: '{nope', headers: USER_HEADERS });
  assert.equal(badJson.status, 400);
  const tooBig = await h.call('/api/reports', { method: 'POST', body: JSON.stringify({ raw: 'a'.repeat(700_000) }), headers: USER_HEADERS });
  assert.equal(tooBig.status, 413);
});

test('download serves seeds verbatim as an attachment and 404s unknown ids', async () => {
  const h = createHarness();
  const res = await h.call(`/api/reports/${encodeURIComponent(seeds[0].id)}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename\*=UTF-8''/);
  assert.equal(await res.text(), seeds[0].raw);
  assert.equal((await h.call('/api/reports/does-not-exist')).status, 404);
});

test('a stored report supersedes a legacy seed for the same date and topic', async () => {
  const legacy = seeds.find((s) => s.source === '用户提供的历史文案');
  if (!legacy) return;
  const h = createHarness();
  await h.call('/api/reports', { method: 'POST', json: { raw: legacy.raw + '\n新版', date: legacy.date, topic: legacy.topic }, headers: USER_HEADERS });
  const data = (await (await h.call('/api/reports')).json()) as ReportsResponse;
  assert.equal(data.reports.filter((r) => r.date === legacy.date && r.topic === legacy.topic).length, 1);
});
