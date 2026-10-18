import { useEffect } from 'react';

/** ⌘K / Ctrl+K 聚焦搜索；Esc 关闭移动端导航（对话框自己处理 Esc）。 */
export function useShortcuts({ onSearch, onEscape }: { onSearch: () => void; onEscape: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        onSearch();
      } else if (event.key === 'Escape') {
        onEscape();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onSearch, onEscape]);
}
