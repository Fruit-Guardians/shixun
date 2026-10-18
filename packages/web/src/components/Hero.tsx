import { CornerDownLeft } from 'lucide-react';
import type { ReportSummary, SyncState } from '#shared';
import { SYNC_LABELS } from '../lib/labels.ts';
import { monthDay } from '../lib/format.ts';
import ScrambleText from './ScrambleText.tsx';

interface HeroProps {
  report: ReportSummary | undefined;
  hasDrive: boolean;
  storyCount: number;
  linkCount: number;
  sync: SyncState | null;
  onRead: () => void;
  onOpenSync: () => void;
}

/** 首页：一个终端窗口，命令行 + 标语 + 日期块，底部状态栏显示本期概况。 */
export function Hero({ report, hasDrive, storyCount, linkCount, sync, onRead, onOpenSync }: HeroProps) {
  const latest = report?.date ?? '—';
  const [month, day] = monthDay(report?.date);
  return (
    <section className="hero window">
      <div className="window-bar">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="window-title">shixun — today — {latest}</span>
      </div>
      <div className="window-body">
        <div>
          <p className="hero-cmd">
            <span className="prompt">$</span>shixun today --date {latest}
          </p>
          <h1>
            <ScrambleText text="少一点噪音，" />
            <span className="accent">
              <ScrambleText text="多一点真正的进展。" duration={900} />
            </span>
          </h1>
          <p>
            跟进 AI、安全与开源社区的一手信号。
            <br />
            原帖、代码和研究，每天认真读一遍。<span className="cursor" aria-hidden="true" />
          </p>
          <button onClick={onRead} className="btn btn-primary" disabled={!report}>
            <CornerDownLeft size={15} />
            阅读本期完整日报
          </button>
        </div>
        <div className="hero-date" aria-label={`本期内容日期 ${latest}`}>
          <small>EDITION DATE</small>
          <strong>
            {month}/{day}
          </strong>
          <small>{latest.slice(0, 4)} · UTC−8</small>
        </div>
      </div>
      <div className="hero-stats">
        <span>
          topic: <b>{report?.topic ?? '暂无日报'}</b>
        </span>
        <span>
          stories: <b>{storyCount}</b>
        </span>
        <span>
          links: <b>{linkCount}</b>
        </span>
        <span>src: {hasDrive ? 'google-drive' : 'archive'}</span>
        <button className="sync-pill" data-state={sync?.state ?? 'unknown'} onClick={onOpenSync} aria-label="查看程序同步状态">
          ● {sync ? SYNC_LABELS[sync.state] : '同步设置'}
        </button>
      </div>
    </section>
  );
}
