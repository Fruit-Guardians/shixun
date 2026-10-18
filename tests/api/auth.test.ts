import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformUser, hasBearerToken, isOwner, isProgramSync, isSameOrigin, safeEqual } from '../../packages/api/src/auth.ts';

test('platform user is read from ingress headers and full names are decoded', () => {
  assert.equal(getPlatformUser(new Headers()), null);
  const user = getPlatformUser(new Headers({
    'oai-authenticated-user-id': 'u1',
    'oai-authenticated-user-email': 'a@b.c',
    'oai-authenticated-user-full-name': encodeURIComponent('张三'),
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
  }));
  assert.equal(user?.displayName, '张三');
  assert.equal(getPlatformUser(new Headers({ 'oai-authenticated-user-id': 'u1', 'oai-authenticated-user-email': 'a@b.c' }))?.displayName, 'a@b.c');
});

test('safeEqual and bearer comparison', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
  const req = (auth?: string) => new Request('https://x.test/', { headers: auth ? { authorization: auth } : {} });
  assert.ok(hasBearerToken(req('Bearer t'), 't'));
  assert.ok(!hasBearerToken(req('Bearer t'), undefined));
  assert.ok(!hasBearerToken(req(), 't'));
});

test('program sync protocol refuses anything that looks like a browser', () => {
  const make = (h: Record<string, string>) => new Request('https://x.test/', { method: 'POST', headers: h });
  assert.ok(isProgramSync(make({ 'x-sites-report-sync': 'google-apps-script' })));
  assert.ok(!isProgramSync(make({ 'x-sites-report-sync': 'google-apps-script', origin: 'https://x.test' })));
  assert.ok(!isProgramSync(make({ 'x-sites-report-sync': 'google-apps-script', 'sec-fetch-site': 'same-origin' })));
  assert.ok(!isProgramSync(make({})));
});

test('same-origin policy distinguishes missing from mismatched origins', () => {
  const req = (origin?: string) => new Request('https://x.test/a', { headers: origin ? { origin } : {} });
  assert.ok(isSameOrigin(req(), { allowMissing: true }));
  assert.ok(!isSameOrigin(req(), { allowMissing: false }));
  assert.ok(isSameOrigin(req('https://x.test'), { allowMissing: false }));
  assert.ok(!isSameOrigin(req('https://evil.test'), { allowMissing: true }));
});

test('owner allowlist is optional, trimmed and case-insensitive', () => {
  const user = { userId: 'u1', email: 'Owner@Example.com', displayName: 'o', fullName: null };
  assert.ok(isOwner(user, undefined));
  assert.ok(isOwner(user, ' , '));
  assert.ok(isOwner(user, 'a@b.c, owner@example.com'));
  assert.ok(!isOwner(user, 'a@b.c'));
});
