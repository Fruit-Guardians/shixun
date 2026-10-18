import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../../packages/api/src/router.ts';
import { createHarness } from './helpers/harness.ts';

test('router resolves params, 404 and 405', () => {
  const router = new Router().get('/a/:id', () => new Response('x')).post('/a/:id', () => new Response('y'));
  assert.equal(router.resolve('GET', '/a/%E4%B8%AD').params.id, '中');
  assert.throws(() => router.resolve('DELETE', '/a/1'), (e: { status: number; headers: Record<string, string> }) => e.status === 405 && e.headers.Allow === 'GET, POST');
  assert.throws(() => router.resolve('GET', '/nope'), (e: { status: number }) => e.status === 404);
  assert.throws(() => router.resolve('GET', '/a/%E0%A4%A'), (e: { status: number }) => e.status === 400);
});

test('unknown API paths return JSON 404 and wrong methods return 405 with Allow', async () => {
  const h = createHarness();
  const missing = await h.call('/api/nope');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: '接口不存在。' });
  const wrong = await h.call('/api/health', { method: 'POST' });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'GET');
});

test('health reports database binding without leaking configuration', async () => {
  const h = createHarness();
  assert.deepEqual(await (await h.call('/api/health')).json(), { ok: true, database: true });
  assert.deepEqual(await (await h.callWithoutDb('/api/health')).json(), { ok: true, database: false });
});
