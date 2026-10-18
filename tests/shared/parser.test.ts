import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { storiesFor, sectionsFor, isValidDate, validateImport, tagsFor, ValidationError, countLinks } from '#shared';
import type { Report } from '#shared';

const seeds: Report[] = JSON.parse(fs.readFileSync(new URL('../../data/seed-reports.json', import.meta.url), 'utf8'));

test('all history editions parse exactly ten top-level events', () => {
  for (const report of seeds) {
    assert.equal(storiesFor(report).length, 10, report.id);
    assert.equal(sectionsFor(report.raw).length, 6);
  }
});

test('security classification is evidence-based and multi-label', () => {
  assert.ok(tagsFor('Binder UAF Android内核漏洞').includes('二进制安全'));
  assert.ok(tagsFor('OAuth Deep Link会话劫持').includes('Web 安全'));
  assert.deepEqual(tagsFor('今天天气不错'), ['互联网资讯']);
});

test('invalid dates rejected', () => {
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-10-16'), true);
  assert.equal(isValidDate(20261016), false);
});

test('import validation preserves every raw character', () => {
  const raw = seeds[0].raw;
  assert.equal(validateImport({ raw, date: '2026-10-16' }).raw, raw);
});

test('bad dates, incomplete bodies and oversized documents are rejected with ValidationError', () => {
  assert.throws(() => validateImport({ raw: 'test', date: '2026-10-16' }), ValidationError);
  assert.throws(() => validateImport({ raw: 'A'.repeat(120), date: '2026-02-30' }), ValidationError);
  assert.throws(() => validateImport({ raw: '测'.repeat(170000), date: '2026-10-16' }), ValidationError);
  assert.throws(() => validateImport(null), ValidationError);
});

test('Drive record identity is stable and bad ids are rejected', () => {
  const raw = seeds[0].raw;
  const data = validateImport({ raw, date: '2026-10-16', sourceFileId: '1AA9Z4C-qdLryYO4Vwsr5cvaqfkt1nrsX' });
  assert.equal(data.id, 'drive-1AA9Z4C-qdLryYO4Vwsr5cvaqfkt1nrsX');
  assert.equal(data.source, 'Google Drive 导入');
  assert.throws(() => validateImport({ raw, date: '2026-10-16', sourceFileId: 'bad id!' }), ValidationError);
});

test('manual import ids derive from date and topic', () => {
  const raw = seeds[0].raw;
  assert.equal(validateImport({ raw, date: '2026-10-16' }).id, '2026-10-16_global');
  assert.equal(validateImport({ raw, date: '2026-10-16', topic: '安全专题' }).id, '2026-10-16_security');
});

test('countLinks counts raw URLs', () => {
  assert.equal(countLinks('a https://x.com/1 b http://y.org'), 2);
});
