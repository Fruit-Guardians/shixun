import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTerm } from '#web/lib/command.ts';

test('searchTerm strips a leading grep / grep -i', () => {
  assert.equal(searchTerm('grep 漏洞'), '漏洞');
  assert.equal(searchTerm('  GREP -i  Claude agent '), 'Claude agent');
  assert.equal(searchTerm('漏洞'), '漏洞');
});

test('searchTerm yields nothing for a bare grep or blank input', () => {
  assert.equal(searchTerm('grep'), '');
  assert.equal(searchTerm('grep -i '), '');
  assert.equal(searchTerm('   '), '');
});

test('searchTerm keeps words that merely start with grep', () => {
  assert.equal(searchTerm('grepper'), 'grepper');
});
