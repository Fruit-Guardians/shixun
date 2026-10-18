export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'shixun-theme';
export const PALETTE_STORAGE_KEY = 'shixun-palette';

/** 配色方案，与 ui.css 里的 [data-palette] 一一对应；第一个是默认值。 */
export const PALETTES = [
  { id: 'phosphor', label: '荧光绿', hint: 'phosphor' },
  { id: 'amber', label: '琥珀 CRT', hint: 'amber' },
  { id: 'ice', label: '冰川蓝', hint: 'ice' },
  { id: 'synth', label: '合成波', hint: 'synthwave' },
  { id: 'mono', label: '黑白', hint: 'mono' },
] as const;

export type Palette = (typeof PALETTES)[number]['id'];
const PALETTE_IDS: readonly string[] = PALETTES.map((p) => p.id);
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * 内联在 <head> 里的脚本：在首次绘制前套用用户已保存的主题，避免深色模式闪白。
 * 键名与下面的 setTheme 共用同一个常量。
 */
export const THEME_INIT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_STORAGE_KEY}'),p=localStorage.getItem('${PALETTE_STORAGE_KEY}');if(t==='dark'||t==='light')d.dataset.theme=t;if(${JSON.stringify(PALETTE_IDS)}.indexOf(p)>0)d.dataset.palette=p}catch(e){}`;

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

export function getPalette(): Palette {
  const chosen = document.documentElement.dataset.palette;
  return PALETTE_IDS.includes(chosen ?? '') ? (chosen as Palette) : 'phosphor';
}

export const getServerPalette = (): Palette => 'phosphor';

export function setPalette(next: Palette): void {
  if (next === 'phosphor') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = next;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, next);
  } catch {
    // 无法持久化时，本次访问内仍然生效。
  }
  for (const listener of listeners) listener();
}

/**
 * 浏览器地址栏 / 状态栏颜色跟随实际生效的背景色（--bg 由配色与明暗共同决定）。
 * 宿主按系统明暗输出了两条 theme-color，这里统一改写为当前值。
 */
export function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = bg;
}
