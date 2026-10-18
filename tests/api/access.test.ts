import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessGate, createAccessVerifier } from '#api';
import type { ApiEnv } from '#api';
import { apiPaths } from '#shared';
import type { IngestResult } from '#shared';
import { ORIGIN, PROGRAM_HEADERS, USER_HEADERS, createHarness, sampleRaw } from './helpers/harness.ts';

/** Cloudflare Access 模式：只认签名 JWT，明文身份头与协议头都不能单独放行。 */

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-tag';
const ENV: Partial<ApiEnv> = { AUTH_PROVIDER: 'cloudflare-access', CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD, OWNER_EMAILS: 'owner@example.com' };
const body = { raw: sampleRaw, date: '2026-10-20', topic: '全球技术社区' as const };

const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const generate = () => crypto.subtle.generateKey({ ...algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
const signing = await generate();
const other = await generate();
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', signing.publicKey)), kid: 'k1' };

const b64 = (data: Uint8Array | string) => Buffer.from(data).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function jwt(claims: Record<string, unknown>, { kid = 'k1', alg = 'RS256', key = signing.privateKey } = {}) {
  const head = `${b64(JSON.stringify({ alg, kid, typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(head)));
  return `${head}.${b64(signature)}`;
}

const base = () => ({ iss: `https://${TEAM}`, aud: [AUD], exp: nowSeconds() + 600, iat: nowSeconds(), type: 'app' });
const userToken = (email = 'owner@example.com', extra: Record<string, unknown> = {}) => jwt({ ...base(), sub: `sub-${email}`, email, ...extra });
const serviceToken = () => jwt({ ...base(), sub: '', common_name: 'client.access' });

/** 和 Workers 一样：redirect 只接受 follow / manual，传 error 会直接抛错。 */
function workersRedirect(init?: RequestInit) {
  if (init?.redirect && init.redirect !== 'follow' && init.redirect !== 'manual') {
    throw new TypeError(`Invalid redirect value, must be one of "follow" or "manual"`);
  }
}

function harness(env: Partial<ApiEnv> = ENV, certs: () => Response = () => Response.json({ keys: [publicJwk] })) {
  const fetched: string[] = [];
  const verifier = createAccessVerifier({
    fetch: async (input, init) => {
      workersRedirect(init);
      fetched.push(String(input));
      return certs();
    },
  });
  return { ...createHarness(env, { withSeeds: false, accessVerifier: verifier }), fetched, verifier };
}

const asUser = async (email?: string) => ({ 'cf-access-jwt-assertion': await userToken(email) });

test('forged identity headers are ignored once Access is the auth provider', async () => {
  const h = harness();
  const res = await h.call(apiPaths.reports, { method: 'POST', json: body, headers: USER_HEADERS });
  assert.equal(res.status, 401);
  const del = await h.call(apiPaths.report('x'), { method: 'DELETE', headers: { ...USER_HEADERS, origin: ORIGIN } });
  assert.equal(del.status, 401);
  // 协议头本身不是凭证。
  assert.equal((await h.call(apiPaths.sync, { method: 'POST', json: body, headers: PROGRAM_HEADERS })).status, 403);
  assert.equal((await h.call(apiPaths.syncStatus, { method: 'POST', json: {}, headers: PROGRAM_HEADERS })).status, 403);
});

test('a signed user JWT imports; owner actions need the email in OWNER_EMAILS', async () => {
  const h = harness();
  const res = await h.call(apiPaths.reports, { method: 'POST', json: body, headers: await asUser('reader@example.com') });
  assert.equal(res.status, 200);
  const { id } = (await res.json()) as IngestResult;

  const denied = await h.call(apiPaths.report(id), { method: 'DELETE', headers: { ...(await asUser('reader@example.com')), origin: ORIGIN } });
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { code: string }).code, 'not_owner');
  // 同源要求不变。
  assert.equal((await h.call(apiPaths.report(id), { method: 'DELETE', headers: await asUser() })).status, 403);
  assert.equal((await h.call(apiPaths.report(id), { method: 'DELETE', headers: { ...(await asUser('OWNER@example.com')), origin: ORIGIN } })).status, 200);
});

test('without OWNER_EMAILS nobody is owner in Access mode', async () => {
  const h = harness({ ...ENV, OWNER_EMAILS: '' });
  const res = await h.call(apiPaths.report('x'), { method: 'DELETE', headers: { ...(await asUser()), origin: ORIGIN } });
  assert.equal(res.status, 403);
});

test('only a service token JWT with the protocol header may sync', async () => {
  const h = harness();
  const service = { 'cf-access-jwt-assertion': await serviceToken() };
  const res = await h.call(apiPaths.sync, { method: 'POST', json: { ...body, sourceFileId: '1AA9Z4C-qdLryYO4Vwsr5cvaqfkt1nrsX' }, headers: { ...PROGRAM_HEADERS, ...service } });
  assert.equal(res.status, 200);
  assert.equal((await h.call(apiPaths.syncStatus, { method: 'POST', json: { triggerInstalled: true, created: 1 }, headers: { ...PROGRAM_HEADERS, ...service } })).status, 200);

  // 用户 JWT、缺协议头、来自浏览器，都不行。
  assert.equal((await h.call(apiPaths.sync, { method: 'POST', json: body, headers: { ...PROGRAM_HEADERS, ...(await asUser()) } })).status, 403);
  assert.equal((await h.call(apiPaths.sync, { method: 'POST', json: body, headers: service })).status, 403);
  assert.equal((await h.call(apiPaths.sync, { method: 'POST', json: body, headers: { ...PROGRAM_HEADERS, ...service, origin: ORIGIN } })).status, 403);
  // 服务令牌不是用户：不能做所有者操作，也不能当登录用户导入。
  assert.equal((await h.call(apiPaths.report('x'), { method: 'DELETE', headers: { ...service, origin: ORIGIN } })).status, 401);
  assert.equal((await h.call(apiPaths.reports, { method: 'POST', json: body, headers: service })).status, 401);
});

test('tampered, foreign, expired and unsigned tokens are rejected', async () => {
  const h = harness();
  const valid = await userToken();
  const [head, payload] = valid.split('.');
  const elevated = `${head}.${b64(JSON.stringify({ ...base(), sub: 's', email: 'owner@example.com', aud: [AUD, 'x'] }))}.${valid.split('.')[2]}`;
  const tokens = {
    tampered: elevated,
    'other key': await jwt({ ...base(), sub: 's', email: 'owner@example.com' }, { key: other.privateKey }),
    'wrong aud': await userToken('owner@example.com', { aud: ['someone-else'] }),
    'wrong issuer': await userToken('owner@example.com', { iss: 'https://evil.cloudflareaccess.com' }),
    expired: await userToken('owner@example.com', { exp: nowSeconds() - 3600 }),
    'not yet valid': await userToken('owner@example.com', { nbf: nowSeconds() + 3600 }),
    'alg none': `${b64(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${payload}.`,
    'unknown kid': await jwt({ ...base(), sub: 's', email: 'owner@example.com' }, { kid: 'nope' }),
    garbage: 'a.b.c',
  };
  for (const [name, token] of Object.entries(tokens)) {
    const res = await h.call(apiPaths.reports, { method: 'POST', json: body, headers: { 'cf-access-jwt-assertion': token } });
    assert.equal(res.status, 401, name);
  }
});

test('missing Access configuration fails closed', async () => {
  const h = harness({ AUTH_PROVIDER: 'cloudflare-access' });
  assert.equal((await h.call(apiPaths.reports, { method: 'POST', json: body, headers: { ...USER_HEADERS, ...(await asUser()) } })).status, 401);
  assert.equal(h.fetched.length, 0);
});

test('public keys are fetched once from the team and reused', async () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    assert.equal((await h.call(apiPaths.reports, { method: 'POST', json: body, headers: await asUser() })).status, 200);
  }
  assert.deepEqual(h.fetched, [`https://${TEAM}/cdn-cgi/access/certs`]);
});

test('a redirected certs response fails closed instead of being followed', async () => {
  const h = harness(ENV, () => new Response(null, { status: 302, headers: { location: 'https://evil.test/certs' } }));
  assert.equal((await h.call(apiPaths.reports, { method: 'POST', json: body, headers: await asUser() })).status, 401);
  assert.deepEqual(h.fetched, [`https://${TEAM}/cdn-cgi/access/certs`]);
});

test('the worker gate blocks every request without a valid Access JWT, and is off otherwise', async () => {
  const { verifier } = harness();
  const env = ENV as ApiEnv;
  const page = (headers: Record<string, string> = {}) => new Request(`${ORIGIN}/`, { headers });
  const blocked = await accessGate(page(USER_HEADERS), env, verifier);
  assert.equal(blocked?.status, 403);
  assert.equal(await accessGate(page(await asUser('reader@example.com')), env, verifier), null);
  assert.equal(await accessGate(page({ 'cf-access-jwt-assertion': await serviceToken() }), env, verifier), null);
  assert.equal(await accessGate(page(), {} as ApiEnv, verifier), null);
});

test('the setup credential points owners at Access service tokens', async () => {
  const h = harness({ ...ENV, SITES_SERVICE_ACCESS: 'secret' });
  const res = await h.call(apiPaths.setupCredential, { method: 'POST', headers: { ...(await asUser()), origin: ORIGIN } });
  assert.equal(res.status, 409);
  const data = (await res.json()) as { code: string; error: string };
  assert.equal(data.code, 'access_service_token');
  assert.match(data.error, /CF_ACCESS_CLIENT_ID/);
  assert.ok(!JSON.stringify(data).includes('secret"'));
});
