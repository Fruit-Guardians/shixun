export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'shixun-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * 内联在 <head> 里的脚本：在首次绘制前套用用户已保存的主题，避免深色模式闪白。
 * 键名与下面的 setTheme 共用同一个常量。
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
  };
}

/** 显式选择（data-theme）优先，否则跟随系统。 */
export function getTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export const getServerTheme = (): Theme => 'light';

export function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // 无法持久化时，本次访问内仍然生效。
  }
  for (const listener of listeners) listener();
}
