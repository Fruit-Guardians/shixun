export interface LocalStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  /** 服务端渲染与水合阶段使用，永远是默认值。 */
  getServerSnapshot(): T;
  /** 写入并通知订阅者。返回值表示是否真正写进了浏览器存储。 */
  set(next: T): boolean;
}

interface StoreOptions<T> {
  key: string;
  fallback: T;
  decode(raw: string): T;
  encode(value: T): string;
}

/**
 * 与 `useSyncExternalStore` 配合的 localStorage 存储：
 * 读写都容错（隐私模式、被禁用、配额），失败时退回内存，页面照常工作；
 * 快照在原始字符串不变时保持引用稳定，其他标签页的改动通过 `storage` 事件同步。
 */
export function createLocalStore<T>({ key, fallback, decode, encode }: StoreOptions<T>): LocalStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;
  let memoryOnly = false;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function getSnapshot(): T {
    if (memoryOnly) return cachedValue;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      memoryOnly = true;
      return cachedValue;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cachedValue = raw === null ? fallback : decode(raw);
      } catch {
        cachedValue = fallback;
      }
    }
    return cachedValue;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot,
    getServerSnapshot: () => fallback,
    set(next) {
      cachedValue = next;
      let persisted = false;
      try {
        const raw = encode(next);
        localStorage.setItem(key, raw);
        cachedRaw = raw;
        persisted = true;
      } catch {
        memoryOnly = true;
      }
      notify();
      return persisted;
    },
  };
}
