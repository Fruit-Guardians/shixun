import { ArrowUpRight, MessageSquare, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { FEED_SOURCES } from '#shared';
import type { FeedChannelStatus, FeedItem, FeedSource } from '#shared';
import { formatCount, timeAgo } from '../lib/format.ts';
import { FEED_SOURCE_CODES, FEED_SOURCE_COLORS, FEED_SOURCE_LABELS, SEVERITY_LABELS } from '../lib/labels.ts';
import type { FeedState } from '../hooks/useFeed.ts';
import ScrambleText from './ScrambleText.tsx';

interface FeedViewProps {
  feed: FeedState;
  source: FeedSource | null;
  onSource: (source: FeedSource | null) => void;
  onLoadMore: () => void;
  onReload: () => void;
  /** 只有所有者才传：立即抓取最该更新的频道（一次请求有子请求上限，抓不完的交给定时任务）。 */
  onRefreshAll?: () => void;
  refreshingAll?: boolean;
}

function scoreLabel(item: FeedItem): string | null {
  if (item.score === null) return null;
  if (item.source === 'github') return `★ +${formatCount(item.score)} 今日`;
  return item.source === 'papers' ? `♥ ${formatCount(item.score)}` : `▲ ${formatCount(item.score)}`;
}

function FeedRow({ item, now, position }: { item: FeedItem; now: number; position: number }) {
  const score = scoreLabel(item);
  return (
    <article className="feed-item" style={{ '--tc': FEED_SOURCE_COLORS[item.source], '--i': Math.min(position, 12) } as CSSProperties}>
      <span className="feed-code" title={FEED_SOURCE_LABELS[item.source]}>
        {FEED_SOURCE_CODES[item.source]}
      </span>
      <div className="feed-body">
        <a className="feed-title" href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        {item.summary && <p className="feed-summary">{item.summary}</p>}
        <div className="feed-meta">
          {item.severity && (
            <span className="severity" data-severity={item.severity}>
              {SEVERITY_LABELS[item.severity]}
            </span>
          )}
          <span>{item.channelName}</span>
          {item.author && <span>@{item.author}</span>}
          {score && <span className="feed-score">{score}</span>}
          {item.tags.map((tag) => (
            <span className="feed-tag" key={tag}>
              {tag}
            </span>
          ))}
          <time dateTime={item.publishedAt} title={item.publishedAt}>
            {timeAgo(item.publishedAt, now)}
          </time>
          {item.discussionUrl && (
            <a className="feed-discuss" href={item.discussionUrl} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={12} aria-hidden="true" />
              讨论
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function ChannelStatus({ channels, now }: { channels: FeedChannelStatus[]; now: number }) {
  const healthy = channels.filter((c) => c.ok).length;
  return (
    <details className="feed-channels">
      <summary>
        <code>$ feeds status</code> {healthy}/{channels.length} 个频道正常
      </summary>
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            <span className="state-dot" data-state={channel.lastRunAt === null ? 'awaiting_setup' : channel.ok ? 'active' : 'attention'} />
            <strong>{channel.name}</strong>
            <span className="dim">
              {channel.lastRunAt === null
                ? '尚未抓取'
                : `${timeAgo(channel.lastRunAt, now)} · ${channel.ok ? `${channel.fetched} 条` : (channel.error ?? '失败')}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 信源速递：定时从公开来源抓取的条目，原样展示，链接直达原文。 */
export default function FeedView({ feed, source, onSource, onLoadMore, onReload, onRefreshAll, refreshingAll }: FeedViewProps) {
  const now = feed.loadedAt;
  const loaded = feed.status === 'ready' || (feed.status === 'loading' && feed.items.length > 0);
  return (
    <>
      <div className="page-title">
        <p className="hero-cmd">
          <span className="prompt">$</span> tail -f ~/feeds
        </p>
        <h1>
          <ScrambleText text="公开信源，原样直达。" />
        </h1>
        <p>社区热帖、GitHub 动态、论文、技术博客、安全研究与漏洞公告。定时任务按各频道的刷新间隔抓取，不经过任何模型，保留 30 天。</p>
      </div>

      <div className="browse-controls">
        <div className="filter-row">
          <div className="filter-tabs" role="group" aria-label="按来源筛选">
            <button className={source === null ? 'active' : ''} aria-pressed={source === null} onClick={() => onSource(null)}>
              全部来源
            </button>
            {FEED_SOURCES.map((s) => (
              <button key={s} className={source === s ? 'active' : ''} aria-pressed={source === s} onClick={() => onSource(s)}>
                <span className="tag-dot" style={{ '--tc': FEED_SOURCE_COLORS[s] } as CSSProperties} />
                {FEED_SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
          <span className="feed-actions">
            <button className="btn btn-ghost" onClick={onReload} disabled={feed.status === 'loading'}>
              <RefreshCw size={14} />
              重新读取
            </button>
            {onRefreshAll && (
              <button className="btn" onClick={onRefreshAll} disabled={refreshingAll}>
                {refreshingAll ? '抓取中…' : '立即抓取'}
              </button>
            )}
          </span>
        </div>
      </div>

      {feed.error && (
        <div className="error-banner" role="alert">
          <span>{feed.error}</span>
          <button onClick={onReload}>重试</button>
        </div>
      )}

      {feed.status === 'loading' && feed.items.length === 0 && (
        <div className="loading-state" role="status" aria-label="正在读取信源…">
          <p>
            <span className="prompt">$</span> curl feeds
          </p>
          <p className="dim">
            loading<span className="cursor" aria-hidden="true" />
          </p>
        </div>
      )}

      {loaded && feed.items.length === 0 && (
        <div className="empty-state">
          <pre aria-hidden="true">{'> tail: no entries yet'}</pre>
          <h2>{source ? '这个来源暂时没有条目' : '信源还没有抓取过'}</h2>
          <p>定时任务每 5 分钟抓取最该更新的四个频道，部署后几个小时内全部频道都会抓取一遍。</p>
        </div>
      )}

      {feed.items.length > 0 && (
        <div className="feed-list">
          {feed.items.map((item, i) => (
            <FeedRow key={item.id} item={item} now={now} position={i} />
          ))}
        </div>
      )}

      {feed.nextCursor && (
        <div className="feed-more">
          <button className="btn" onClick={onLoadMore} disabled={feed.loadingMore}>
            {feed.loadingMore ? '读取中…' : '加载更早的条目'}
          </button>
        </div>
      )}

      {feed.channels.length > 0 && <ChannelStatus channels={feed.channels} now={now} />}

      <footer className="main-footer">
        <span>shixun feeds · public sources</span>
        <span>标题与摘要来自原站，未经核实</span>
      </footer>
    </>
  );
}
