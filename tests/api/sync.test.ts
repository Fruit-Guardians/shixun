import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, PROGRAM_HEADERS, USER_HEADERS, createHarness, sampleRaw } from './helpers/harness.ts';
import type { SyncState } from '#shared';

const FILE_ID = '1AA9Z4C-qdLryYO4Vwsr5cvaqfkt1nrsX';
const payload = { raw: sampleRaw, date: '2026-10-16', topic: '全球技术社区', sourceFileId: FILE_ID };

test('sync ingest rejects browsers, missing protocol and the retired AI protocol', async () => {
  const h = createHarness();
  assert.equal((await h.call('/api/sync', { method: 'POST', json: payload })).status, 403);
  assert.equal((await h.call('/api/sync', { method: 'POST', json: payload, headers: { ...PROGRAM_HEADERS, origin: 'https://other.example' } })).status, 403);
  const retired = await h.call('/api/sync', { method: 'POST', json: payload, headers: { 'x-sites-report-sync': 'google-drive' } });
  assert.equal(retired.status, 410);
  assert.equal(((await retired.json()) as { code: string }).code, 'legacy_ai_sync_retired');
});

test('sync ingest needs a Drive file id and is idempotent with exact readback', async () => {
  const h = createHarness({}, { withSeeds: false });
  const noId = await h.call('/api/sync', { method: 'POST', json: { raw: sampleRaw, date: '2026-10-16' }, headers: PROGRAM_HEADERS });
  assert.equal(noId.status, 400);
  assert.match(((await noId.json()) as { error: string }).error, /Drive 文件 ID/);

  const first = (await (await h.call('/api/sync', { method: 'POST', json: payload, headers: PROGRAM_HEADERS })).json()) as { id: string; status: string };
  assert.equal(first.status, 'created');
  assert.equal(first.id, `drive-${FILE_ID}`);
  const second = (await (await h.call('/api/sync', { method: 'POST', json: payload, headers: PROGRAM_HEADERS })).json()) as { status: string };
  assert.equal(second.status, 'unchanged');
  assert.equal(await (await h.call(`/api/reports/${first.id}`)).text(), sampleRaw);

  const bad = await h.call('/api/sync', { method: 'POST', json: { ...payload, date: '2026-02-30' }, headers: PROGRAM_HEADERS });
  assert.equal(bad.status, 400);
});

test('sync status starts as awaiting_setup and reflects only real receipts', async () => {
  const h = createHarness();
  const initial = (await (await h.call('/api/sync/status')).json()) as SyncState;
  assert.equal(initial.state, 'awaiting_setup');

  const ok = await h.call('/api/sync/status', { method: 'POST', json: { triggerInstalled: true, created: 1 }, headers: PROGRAM_HEADERS });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as SyncState).state, 'active');

  await h.call('/api/sync/status', { method: 'POST', json: { triggerInstalled: true, failed: 2 }, headers: PROGRAM_HEADERS });
  assert.equal(((await (await h.call('/api/sync/status')).json()) as SyncState).state, 'attention');

  await h.call('/api/sync/status', { method: 'POST', json: { triggerInstalled: false }, headers: PROGRAM_HEADERS });
  assert.equal(((await (await h.call('/api/sync/status')).json()) as SyncState).state, 'disabled');
});

test('sync status rejects malformed receipts and non-program callers', async () => {
  const h = createHarness();
  const post = (json: unknown, headers: Record<string, string> = PROGRAM_HEADERS) => h.call('/api/sync/status', { method: 'POST', json, headers });
  assert.equal((await post({ triggerInstalled: 'yes' })).status, 400);
  assert.equal((await post({ triggerInstalled: false, failed: -1 })).status, 400);
  assert.equal((await post({ triggerInstalled: false, created: 1.5 })).status, 400);
  assert.equal((await post({}, {})).status, 403);
  const big = await h.call('/api/sync/status', { method: 'POST', body: JSON.stringify({ triggerInstalled: true, pad: 'x'.repeat(5000) }), headers: PROGRAM_HEADERS });
  assert.equal(big.status, 413);
});

test('stale receipts older than an hour are reported as stale', async () => {
  let now = new Date('2026-10-17T00:00:00Z');
  const h = createHarness({}, { now: () => now });
  const recorded = (await (await h.call('/api/sync/status', { method: 'POST', json: { triggerInstalled: true }, headers: PROGRAM_HEADERS })).json()) as SyncState;
  assert.equal(recorded.lastCheckedAt, '2026-10-17T00:00:00.000Z');
  now = new Date('2026-10-17T00:59:00Z');
  assert.equal(((await (await h.call('/api/sync/status')).json()) as SyncState).state, 'active');
  now = new Date('2026-10-17T01:01:00Z');
  assert.equal(((await (await h.call('/api/sync/status')).json()) as SyncState).state, 'stale');
});

test('sync status degrades to 503 JSON without a database', async () => {
  const h = createHarness();
  const original = console.error;
  console.error = () => {};
  try {
    const res = await h.callWithoutDb('/api/sync/status');
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  } finally {
    console.error = original;
  }
});

test('setup credential is same-origin, login-only and never exposed otherwise', async () => {
  const h = createHarness({ SITES_SERVICE_ACCESS: 'service-secret' });
  const post = (headers: Record<string, string>) => h.call('/api/integration/setup-credential', { method: 'POST', json: {}, headers });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ origin: ORIGIN })).status, 401);
  const ok = await post({ origin: ORIGIN, ...USER_HEADERS });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { token: 'service-secret' });

  const unconfigured = createHarness();
  const res = await unconfigured.call('/api/integration/setup-credential', { method: 'POST', json: {}, headers: { origin: ORIGIN, ...USER_HEADERS } });
  assert.equal(res.status, 503);
});

test('setup credential is limited to OWNER_EMAILS when configured', async () => {
  const h = createHarness({ SITES_SERVICE_ACCESS: 'service-secret', OWNER_EMAILS: 'someone@example.com, Owner@Example.com' });
  const post = (email: string) =>
    h.call('/api/integration/setup-credential', { method: 'POST', json: {}, headers: { origin: ORIGIN, ...USER_HEADERS, 'oai-authenticated-user-email': email } });
  const stranger = await post('visitor@example.com');
  assert.equal(stranger.status, 403);
  assert.deepEqual(await stranger.json(), { error: '只有站点所有者可以取回同步凭证。', code: 'not_owner' });
  const owner = await post('owner@example.com');
  assert.equal(owner.status, 200);
  assert.deepEqual(await owner.json(), { token: 'service-secret' });
});
