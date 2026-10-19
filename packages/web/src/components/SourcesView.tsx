import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { FEED_GROUPS } from '#shared';
import type { FeedChannelStatus, FeedSource } from '#shared';
import { timeAgo } from '../lib/format.ts';
import { FEED_GROUP_LABELS, FEED_SOURCE_CODES, FEED_SOURCE_COLORS, FEED_SOURCE_LABELS } from '../lib/labels.ts';
import type { FeedChannelsState } from '../hooks/useFeedChannels.ts';
import ScrambleText from './ScrambleText.tsx';

interface SourcesViewProps {
  sources: FeedChannelsState;
  onReload: () => void;
  /** 在信源速递里只看这个来源的条目。 */
  onOpenSource: (source: FeedSource) => void;
}

/** 「每 30 分钟」「每 6 小时」「每天」。 */
export function cadenceLabel(everyMinutes: number): string {
  if (everyMinutes < 60) return `每 ${everyMinutes} 分钟`;
  if (everyMinutes % (24 * 60) === 0) return everyMinutes === 24 * 60 ? '每天' : `每 ${everyMinutes / (24 * 60)} 天`;
  return everyMinutes % 60 === 0 ? `每 ${everyMinutes / 60} 小时` : `每 ${everyMinutes} 分钟`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function runState(channel: FeedChannelStatus): string {
  if (channel.lastRunAt === null) return 'awaiting_setup';
  return channel.ok ? 'active' : 'attention';
}

function SourceCard({ channel, now, onOpenSource }: { channel: FeedChannelStatus; now: number; onOpenSource: (source: FeedSource) => void }) {
  return (
    <li className="source-card" style={{ '--tc': FEED_SOURCE_COLORS[channel.source] } as CSSProperties}>
      <div className="source-head">
        <a className="source-name" href={channel.homepage} target="_blank" rel="noopener noreferrer">
          {channel.name}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <button className="feed-code" title={`在信源速递里看「${FEED_SOURCE_LABELS[channel.source]}」`} onClick={() => onOpenSource(channel.source)}>
          {FEED_SOURCE_CODES[channel.source]}
        </button>
      </div>
      <p className="source-desc">{channel.description}</p>
      <div className="source-meta">
        <span>{hostOf(channel.homepage)}</span>
        <span>{cadenceLabel(channel.everyMinutes)}</span>
        {channel.latestAt && (
          <span>
            最新一篇 <time dateTime={channel.latestAt}>{timeAgo(channel.latestAt, now)}</time>
          </span>
        )}
      </div>
      <div className="source-run">
        <span className="state-dot" data-state={runState(channel)} />
        {channel.lastRunAt === null ? (
          <span>尚未抓取</span>
        ) : (
          <span>
            <time dateTime={channel.lastRunAt}>{timeAgo(channel.lastRunAt, now)}</time>抓取 · {channel.ok ? `${channel.fetched} 条` : (channel.error ?? '失败')}
          </span>
        )}
      </div>
    </li>
  );
}

/** 信息源一览：按分组列出接入的全部频道，介绍、首页、抓取频率与最近状态。 */
export default function SourcesView({ sources, onReload, onOpenSource }: SourcesViewProps) {
  const { channels } = sources;
  const now = sources.loadedAt;
  const groups = FEED_GROUPS.map((group) => ({ group, channels: channels.filter((c) => c.group === group) })).filter((g) => g.channels.length > 0);
  const healthy = channels.filter((c) => c.ok).length;
  const security = channels.filter((c) => c.source === 'security').length;
  return (
    <>
      <div className="page-title">
        <p className="hero-cmd">
          <span className="prompt">$</span> ls ~/sources
        </p>
        <h1>
          <ScrambleText text="我们接了哪些信息源。" />
        </h1>
        <p>
          信源速递里的每一条都来自下面这些公开来源：官方接口、RSS / Atom 或公开页面。定时任务按各自的频率抓取，标题和摘要原样保留，不经过任何模型，条目保留 30 天。
        </p>
      </div>

      {sources.error && (
        <div className="error-banner" role="alert">
          <span>{sources.error}</span>
          <button onClick={onReload}>重试</button>
        </div>
      )}

      {sources.status === 'loading' && channels.length === 0 && (
        <div className="loading-state" role="status" aria-label="正在读取信息源…">
          <p>
            <span className="prompt">$</span> ls ~/sources
          </p>
          <p className="dim">
            loading<span className="cursor" aria-hidden="true" />
          </p>
        </div>
      )}

      {channels.length > 0 && (
        <>
          <div className="sources-summary">
            <span>
              <strong>{channels.length}</strong> 个频道
            </span>
            <span>
              <strong>{groups.length}</strong> 个分组
            </span>
            <span>
              其中安全研究博客 <strong>{security}</strong> 个
            </span>
            <span>
              <strong>{healthy}</strong> 个最近一次抓取正常
            </span>
            <button className="btn btn-ghost" onClick={onReload} disabled={sources.status === 'loading'}>
              <RefreshCw size={14} />
              重新读取
            </button>
          </div>

          <nav className="sources-index" aria-label="信息源分组">
            {groups.map(({ group, channels: list }) => (
              // 地址栏的 hash 用于日报路由，分组跳转直接滚动。
              <button key={group} onClick={() => document.getElementById(`sources-${group}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {FEED_GROUP_LABELS[group]}
                <span className="num">{list.length}</span>
              </button>
            ))}
          </nav>

          {groups.map(({ group, channels: list }) => (
            <section className="sources-group" key={group} id={`sources-${group}`} aria-labelledby={`sources-${group}-title`}>
              <h2 id={`sources-${group}-title`}>
                <span className="dim">##</span> {FEED_GROUP_LABELS[group]}
                <span className="num">{list.length}</span>
              </h2>
              <ul className="source-grid">
                {list.map((channel) => (
                  <SourceCard key={channel.id} channel={channel} now={now} onOpenSource={onOpenSource} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <footer className="main-footer">
        <span>shixun feeds · {channels.length} channels</span>
        <span>想加新的来源？在仓库提 issue 或改 packages/api/src/feeds/channels.ts</span>
      </footer>
    </>
  );
}
