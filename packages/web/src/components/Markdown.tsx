import { Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import { parseMarkdown } from '../lib/markdown.ts';
import type { InlineNode, Line, ListBlock, MarkdownBlock } from '../lib/markdown.ts';

function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={node.kind ? `md-${node.kind}` : undefined}
            title={node.kind === 'url' ? node.href : undefined}
          >
            {node.label}
          </a>
        );
      case 'strong':
        return (
          <strong key={i}>
            <Inline nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inline nodes={node.children} />
          </em>
        );
      case 'del':
        return (
          <del key={i}>
            <Inline nodes={node.children} />
          </del>
        );
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'br':
        return <br key={i} />;
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
    }
  });
}

const toneClass = (tone: Line['tone']) => (tone ? `tone-${tone}` : undefined);

/** 字段行（标签 + 内容）与普通行混排；无标签的行占满整行。 */
function Lines({ lines }: { lines: Line[] }) {
  return (
    <div className="md-fields">
      {lines.map((line, i) =>
        line.label ? (
          <div key={i} className={`md-field ${toneClass(line.tone) ?? ''}`}>
            <span className="md-label">{line.label}</span>
            <span className="md-value">
              <Inline nodes={line.nodes} />
            </span>
          </div>
        ) : (
          <p key={i} className={`md-line ${toneClass(line.tone) ?? ''}`}>
            <Inline nodes={line.nodes} />
          </p>
        ),
      )}
    </div>
  );
}

function List({ block }: { block: ListBlock }) {
  const items = block.items.map((item, i) => (
    <li key={i}>
      <span className="md-item-lead">
        <Inline nodes={item.nodes} />
      </span>
      {item.lines.length > 0 && <Lines lines={item.lines} />}
      {item.children && <List block={item.children} />}
    </li>
  ));
  return block.ordered ? (
    <ol className="md-list" start={block.start === 1 ? undefined : block.start}>
      {items}
    </ol>
  ) : (
    <ul className="md-list">{items}</ul>
  );
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.type) {
    case 'h1':
      return (
        <h1>
          <Inline nodes={block.nodes} />
        </h1>
      );
    case 'h2':
      return (
        <h2 id={block.id}>
          <Inline nodes={block.nodes} />
        </h2>
      );
    case 'h3':
      return (
        <h3>
          <Inline nodes={block.nodes} />
        </h3>
      );
    case 'h4':
      return (
        <h4>
          <Inline nodes={block.nodes} />
        </h4>
      );
    case 'story':
      return (
        <article className="md-story" aria-labelledby={block.id}>
          <h3 id={block.id}>
            {block.number !== null && <span className="md-story-no">{String(block.number).padStart(2, '0')}</span>}
            <span>
              <Inline nodes={block.nodes} />
            </span>
          </h3>
          {block.lines.length > 0 && <Lines lines={block.lines} />}
        </article>
      );
    case 'p':
      return (
        <p className={toneClass(block.tone)}>
          <Inline nodes={block.nodes} />
        </p>
      );
    case 'fields':
      return <Lines lines={block.lines} />;
    case 'list':
      return <List block={block} />;
    case 'quote':
      return (
        <blockquote>
          {block.blocks.map((inner, i) => (
            <Block key={i} block={inner} />
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <pre className="md-code" data-lang={block.lang || undefined}>
          <code>{block.text}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="md-table" role="region" aria-label="表格" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, c) => (
                  <th key={c} style={block.align[c] ? { textAlign: block.align[c] } : undefined}>
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={block.align[c] ? { textAlign: block.align[c] } : undefined}>
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr />;
  }
}

/** 日报正文渲染。解析在 lib/markdown.ts，这里只负责把块映射成元素。 */
export default function Markdown({ raw }: { raw: string }) {
  const blocks = useMemo(() => parseMarkdown(raw), [raw]);
  return (
    <div className="markdown">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
