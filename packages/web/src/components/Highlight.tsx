import { splitHighlight } from '../lib/selectors.ts';

/** 把搜索词命中的部分用 <mark> 标出来。 */
export default function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text))}
    </>
  );
}
