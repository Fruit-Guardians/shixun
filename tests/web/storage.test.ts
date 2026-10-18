import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '#web/lib/storage.ts';

class FakeStorage {
  data = new Map<string, string>();
  broken = false;
  getItem(key: string) {
    if (this.broken) throw new Error('blocked');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.broken) throw new Error('blocked');
    this.data.set(key, value);
  }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
});

const make = () =>
  createLocalStore<readonly string[]>({
    key: 'k',
    fallback: [],
    decode: (raw) => JSON.parse(raw) as string[],
    encode: JSON.stringify,
  });

test('returns the fallback, then persisted values with a stable reference', () => {
  const store = make();
  assert.deepEqual(store.getSnapshot(), []);
  assert.equal(store.set(['a']), true);
  const first = store.getSnapshot();
  assert.deepEqual(first, ['a']);
  assert.equal(store.getSnapshot(), first, 'unchanged storage keeps the same snapshot object');
});

test('notifies subscribers on set', () => {
  const store = make();
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.set(['x']);
  off();
  store.set(['y']);
  assert.equal(calls, 1);
});

test('corrupt stored data falls back instead of throwing', () => {
  storage.setItem('k', '{not json');
  assert.deepEqual(make().getSnapshot(), []);
});

test('blocked storage degrades to in-memory state and reports it', () => {
  storage.broken = true;
  const store = make();
  assert.deepEqual(store.getSnapshot(), []);
  assert.equal(store.set(['m']), false);
  assert.deepEqual(store.getSnapshot(), ['m']);
});

test('server snapshot is always the fallback', () => {
  const store = make();
  store.set(['a']);
  assert.deepEqual(store.getServerSnapshot(), []);
});
