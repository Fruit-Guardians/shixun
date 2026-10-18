import { useCallback, useSyncExternalStore } from 'react';
import { getPalette, getServerPalette, getServerTheme, getTheme, setPalette, setTheme, subscribeTheme } from '../lib/theme.ts';
import type { Palette, Theme } from '../lib/theme.ts';

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const toggle = useCallback(() => setTheme(getTheme() === 'dark' ? 'light' : 'dark'), []);
  return [theme, toggle];
}

export function usePalette(): [Palette, (next: Palette) => void] {
  return [useSyncExternalStore(subscribeTheme, getPalette, getServerPalette), setPalette];
}
