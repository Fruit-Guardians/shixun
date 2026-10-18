'use client';

import { useEffect, useState } from 'react';

const GLYPHS = '01<>/\\[]{}#$%&*+=?ABCDEFGHJKLMNPQRSTUVWXYZ';
/** 全角字符用全角乱码替换，解码过程中标题宽度不跳动。 */
const WIDE_GLYPHS = '码讯信号数据日报网安开源智能节点协议内核密钥漏洞堆栈线程';
const isWide = (ch: string) => ch.charCodeAt(0) > 0x2e80;
const pick = (pool: string) => pool[Math.floor(Math.random() * pool.length)];

/**
 * 解码式文字动效（参考 React Bits 的 DecryptedText）。
 * 服务端与首帧渲染最终文本，挂载后才逐字「解码」，因此不影响水合与无障碍读屏；
 * 用户开启「减少动态效果」时不播放。
 */
export default function ScrambleText({ text, duration = 700 }: { text: string; duration?: number }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const settled = Math.floor(progress * text.length);
      setShown(
        Array.from(text, (ch, i) => (i < settled || ch.trim() === '' || '，。、'.includes(ch) ? ch : pick(isWide(ch) ? WIDE_GLYPHS : GLYPHS))).join(''),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration]);

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
