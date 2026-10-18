import { useCallback, useSyncExternalStore } from 'react';
import { parseReportId, reportHash } from '../lib/route.ts';

const ROUTE_EVENT = 'shixun:route';

function subscribe(listener: () => void): () => void {
  addEventListener('hashchange', listener);
  addEventListener(ROUTE_EVENT, listener);
  return () => {
    removeEventListener('hashchange', listener);
    removeEventListener(ROUTE_EVENT, listener);
  };
}

const getSnapshot = () => parseReportId(location.hash);

/** 阅读页的原文是异步读取的：等条目渲染出来再滚动，最多等 STORY_SCROLL_TIMEOUT_MS。 */
const STORY_SCROLL_TIMEOUT_MS = 5_000;
function scrollToStoryWhenReady(storyIndex: number): void {
  const deadline = performance.now() + STORY_SCROLL_TIMEOUT_MS;
  const tick = () => {
    const target = document.getElementById(`story-${storyIndex}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (performance.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const getServerSnapshot = () => '';

/** 当前正在阅读的日报 id（空串表示列表页），以及打开 / 关闭 / 生成分享链接。 */
export function useReportRoute() {
  const reportId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const open = useCallback((id: string, storyIndex?: number) => {
    location.hash = reportHash(id);
    if (storyIndex === undefined) requestAnimationFrame(() => scrollTo({ top: 0, behavior: 'smooth' }));
    else scrollToStoryWhenReady(storyIndex);
  }, []);

  const close = useCallback(() => {
    if (!location.hash) return;
    // replaceState 不会触发 hashchange，需要手动通知订阅者。
    history.replaceState(null, '', location.pathname + location.search);
    dispatchEvent(new Event(ROUTE_EVENT));
  }, []);

  const linkTo = useCallback((id: string) => `${location.origin}${location.pathname}#${reportHash(id)}`, []);

  return { reportId, open, close, linkTo };
}
