import { createLocalStore } from './storage.ts';

export type Density = 'grid' | 'list';

/** 卡片 / 列表布局。键名沿用旧版，用户已有的偏好不会丢。 */
export const densityStore = createLocalStore<Density>({
  key: 'shixun-layout',
  fallback: 'grid',
  decode: (raw) => (raw === 'list' ? 'list' : 'grid'),
  encode: (value) => value,
});

/** 稍后阅读的动态 id，仅保存在当前浏览器。 */
export const savedStore = createLocalStore<readonly string[]>({
  key: 'shixun-saved',
  fallback: [],
  decode: (raw) => {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  },
  encode: (value) => JSON.stringify(value),
});
