import { useSyncExternalStore } from 'react';
import type { LocalStore } from '../lib/storage.ts';

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
