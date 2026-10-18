import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_STORAGE_KEY, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, getPalette, setPalette, syncThemeColor } from '#web/lib/theme.ts';

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

interface FakeRoot {
  dataset: Record<string, string | undefined>;
}

let storage: FakeStorage;
let root: FakeRoot;
let metas: { content: string }[];
let bg: string;

beforeEach(() => {
  storage = new FakeStorage();
  root = { dataset: {} };
  metas = [{ content: '#f2efe4' }, { content: '#07090a' }];
  bg = '';
  const doc = { documentElement: root, querySelectorAll: () => metas };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  Object.defineProperty(globalThis, 'getComputedStyle', {
    value: () => ({ getPropertyValue: (name: string) => (name === '--bg' ? bg : '') }),
    configurable: true,
  });
});

const runInit = () => new Function(THEME_INIT_SCRIPT)();

test('getPalette falls back to the default for missing or unknown values', () => {
  assert.equal(getPalette(), 'phosphor');
  root.dataset.palette = 'neon';
  assert.equal(getPalette(), 'phosphor');
  root.dataset.palette = 'amber';
  assert.equal(getPalette(), 'amber');
});

test('setPalette writes the attribute and storage; the default removes the attribute', () => {
  setPalette('synth');
  assert.equal(root.dataset.palette, 'synth');
  assert.equal(storage.data.get(PALETTE_STORAGE_KEY), 'synth');
  setPalette('phosphor');
  assert.equal(root.dataset.palette, undefined);
  assert.equal(storage.data.get(PALETTE_STORAGE_KEY), 'phosphor');
});

test('setPalette still applies the palette when storage is blocked', () => {
  storage.broken = true;
  setPalette('ice');
  assert.equal(root.dataset.palette, 'ice');
});

test('init script applies stored theme and palette before first paint', () => {
  storage.data.set(THEME_STORAGE_KEY, 'dark');
  storage.data.set(PALETTE_STORAGE_KEY, 'mono');
  runInit();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.palette, 'mono');
});

test('init script ignores invalid values and the default palette', () => {
  storage.data.set(THEME_STORAGE_KEY, 'sepia');
  storage.data.set(PALETTE_STORAGE_KEY, 'neon');
  runInit();
  assert.deepEqual(root.dataset, {});
  storage.data.set(PALETTE_STORAGE_KEY, 'phosphor');
  runInit();
  assert.equal(root.dataset.palette, undefined, 'default palette needs no attribute');
});

test('init script never throws when storage is unavailable', () => {
  storage.broken = true;
  assert.doesNotThrow(runInit);
});

test('every palette id is accepted by the init script', () => {
  for (const { id } of PALETTES.slice(1)) {
    root.dataset = {};
    storage.data.set(PALETTE_STORAGE_KEY, id);
    runInit();
    assert.equal(root.dataset.palette, id);
  }
});

test('syncThemeColor rewrites every theme-color meta to the live background', () => {
  bg = ' #0b0906 ';
  syncThemeColor();
  assert.deepEqual(
    metas.map((m) => m.content),
    ['#0b0906', '#0b0906'],
  );
});

test('syncThemeColor leaves metas alone when the background is unknown', () => {
  syncThemeColor();
  assert.deepEqual(
    metas.map((m) => m.content),
    ['#f2efe4', '#07090a'],
  );
});
