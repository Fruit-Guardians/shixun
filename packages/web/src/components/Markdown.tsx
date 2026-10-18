import { Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import { parseMarkdown } from '../lib/markdown.ts';
import type { InlineNode } from '../lib/markdown.ts';

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'link':
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
            {node.label}
          </a>
        );
      case 'strong':
        return (
          <strong key={i}>
            <Inline nodes={node.children} />
          </strong>
        );
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
    }
  });
}

/** 日报正文渲染。解析在 lib/markdown.ts，这里只负责把块映射成元素。 */
export default function Markdown({ raw }: { raw: string }) {
  const blocks = useMemo(() => parseMarkdown(raw), [raw]);
  return (
    <div className="markdown">
      {blocks.map((block, i) => {
        const content = <Inline nodes={block.nodes} />;
        switch (block.type) {
          case 'h1':
            return <h1 key={i}>{content}</h1>;
          case 'h2':
            return (
              <h2 key={i} id={block.id}>
                {content}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} id={block.id}>
                {content}
              </h3>
            );
          case 'p':
            return (
              <p key={i} className={block.tone === 'source' ? 'source-line' : block.tone === 'aside' ? 'aside-line' : undefined}>
                {content}
              </p>
            );
        }
      })}
    </div>
  );
}
