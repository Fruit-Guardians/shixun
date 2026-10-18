import { useEffect } from 'react';
import type { View } from '../state/browse.ts';

const VIEW_KEYS: Record<string, View> = { '1': 'today', '2': 'archive', '3': 'saved' };

interface Shortcuts {
  /** ⌘K / Ctrl+K：命令面板。 */
  onCommand: () => void;
  /** `/`：聚焦搜索框。 */
  onSearch: () => void;
  /** 1 / 2 / 3：切换主视图（与顶栏 kbd 提示一致）。 */
  onView: (view: View) => void;
  /** Esc：关闭移动端导航（对话框自己处理 Esc）。 */
  onEscape: () => void;
}

/** 正在输入或有对话框打开时，单键快捷键不生效。 */
function typingOrModal(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true;
  return document.querySelector('[role="dialog"]') !== null;
}

export function useShortcuts({ onCommand, onSearch, onView, onEscape }: Shortcuts) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onCommand();
        return;
      }
      if (event.key === 'Escape') {
        onEscape();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typingOrModal(event)) return;
      if (event.key === '/') {
        event.preventDefault();
        onSearch();
      } else if (VIEW_KEYS[event.key]) {
        onView(VIEW_KEYS[event.key]);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onCommand, onSearch, onView, onEscape]);
}
