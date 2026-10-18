import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '#web/api/client.ts';

const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('listReports returns the contract payload and sends no-store same-origin requests', async () => {
  let seen: { url: string; init?: RequestInit } | undefined;
  const api = createApiClient({
    fetcher: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ reports: [], sync: null, drive: { status: 'not_connected', folderId: 'f' } }));
    },
  });
  const data = await api.listReports();
  assert.deepEqual(data.reports, []);
  assert.equal(seen?.url, '/api/reports');
  assert.equal(seen?.init?.cache, 'no-store');
  assert.equal(seen?.init?.credentials, 'same-origin');
});

test('error responses surface the server message, status and code', async () => {
  const api = createApiClient({ fetcher: reply({ error: '请先登录，再导入日报。', code: 'x' }, 401) });
  await assert.rejects(api.importReport({ raw: 'r', date: '2026-10-16' }), (e: ApiError) => e.status === 401 && e.message === '请先登录，再导入日报。' && e.code === 'x');
});

test('non-JSON failures and network errors still produce readable ApiErrors', async () => {
  const html = createApiClient({ fetcher: async () => new Response('<html>', { status: 502 }) });
  await assert.rejects(html.listReports(), (e: ApiError) => e.status === 502 && /502/.test(e.message));
  const offline = createApiClient({ fetcher: async () => { throw new TypeError('fail'); } });
  await assert.rejects(offline.listReports(), (e: ApiError) => e.status === 0 && e.code === 'network');
});

test('malformed reports payloads are rejected', async () => {
  const api = createApiClient({ fetcher: reply({ nope: true }) });
  await assert.rejects(api.listReports(), (e: ApiError) => e.code === 'bad_response');
});

test('importReport posts JSON and setupCredential unwraps the token', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createApiClient({
    baseUrl: 'https://api.example',
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.endsWith('setup-credential') ? { token: 't' } : { id: 'i', status: 'created', hash: 'h', revision: 1 }));
    },
  });
  assert.equal((await api.importReport({ raw: 'r', date: '2026-10-16' })).status, 'created');
  assert.equal(calls[0].url, 'https://api.example/api/reports');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { raw: 'r', date: '2026-10-16' });
  assert.equal(await api.setupCredential(), 't');
  assert.equal(api.reportUrl('a b'), 'https://api.example/api/reports/a%20b');
});
