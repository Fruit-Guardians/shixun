import { useCallback, useSyncExternalStore } from 'react';
import { getServerTheme, getTheme, setTheme, subscribeTheme } from '../lib/theme.ts';
import type { Theme } from '../lib/theme.ts';

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const toggle = useCallback(() => setTheme(getTheme() === 'dark' ? 'light' : 'dark'), []);
  return [theme, toggle];
}
