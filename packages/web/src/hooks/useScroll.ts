import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const SHOW_TOP_AFTER_PX = 700;
const SECTION_OFFSET_PX = 140;

/** 滚过一屏多之后显示「回到顶部」。 */
export function useShowBackToTop(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const update = () => setShow(scrollY > SHOW_TOP_AFTER_PX);
    const frame = requestAnimationFrame(update);
    addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', update);
    };
  }, []);
  return show;
}

/**
 * 阅读进度条与目录高亮。进度条直接写 DOM（滚动时每帧都变，不值得触发 React 渲染），
 * 只有「当前章节」变化才更新状态。
 */
export function useReadingProgress(content: RefObject<HTMLElement | null>) {
  const bar = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const ratio = max > 0 ? Math.min(1, scrollY / max) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${ratio})`;

      let current = '';
      for (const heading of content.current?.querySelectorAll<HTMLElement>('h2[id]') ?? []) {
        if (heading.getBoundingClientRect().top < SECTION_OFFSET_PX) current = heading.id;
      }
      setActiveSection(current);
    };
    const frame = requestAnimationFrame(update);
    addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', update);
    };
  }, [content]);

  return { bar, activeSection };
}
