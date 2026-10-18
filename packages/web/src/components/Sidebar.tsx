import type { CSSProperties } from 'react';
import { CATEGORIES } from '#shared';
import type { Category, ReportSummary, SyncState } from '#shared';
import { CATEGORY_LABELS, SYNC_LABELS, topicLabel } from '../lib/labels.ts';
import type { View } from '../state/browse.ts';

interface SidebarProps {
  view: View;
  reading: boolean;
  mobileOpen: boolean;
  reportCount: number;
  savedCount: number;
  category: Category;
  counts: Record<Category, number>;
  recent: ReportSummary[];
  edition: string;
  sync: SyncState | null;
  onNavigate: (view: View) => void;
  onCategory: (category: Category) => void;
  onEdition: (id: string) => void;
  onOpenSync: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const { view, reading, mobileOpen, reportCount, savedCount, category, counts, recent, edition, sync } = props;
  const on = (active: boolean) => (active && !reading ? 'on' : '');

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <section className="side-group">
        <h3>阅读空间</h3>
        <div className="side-list">
          <button className={on(view === 'today')} onClick={() => props.onNavigate('today')}>
            每日观察<span className="leader" />
            <span className="num">{reportCount}</span>
          </button>
          <button className={on(view === 'archive')} onClick={() => props.onNavigate('archive')}>
            所有日报<span className="leader" />
            <span className="num">log</span>
          </button>
          <button className={on(view === 'saved')} onClick={() => props.onNavigate('saved')}>
            稍后阅读<span className="leader" />
            <span className="num">{savedCount}</span>
          </button>
        </div>
      </section>

      <section className="side-group">
        <h3>关注领域</h3>
        <div className="side-list">
          {CATEGORIES.slice(1).map((c, i) => (
            <button key={c} className={on(category === c)} onClick={() => props.onCategory(c)}>
              <span className="tag-dot" style={{ '--tc': `var(--c${i})` } as CSSProperties} />
              {CATEGORY_LABELS[c]}
              <span className="leader" />
              <span className="num">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="side-group">
        <h3>近期日报</h3>
        <div className="side-list">
          {recent.map((r) => (
            <button key={r.id} className={on(edition === r.id)} onClick={() => props.onEdition(r.id)}>
              {r.date.slice(5)}
              <span className="leader" />
              <span className="num">{topicLabel(r.topic)}</span>
            </button>
          ))}
        </div>
      </section>

      <button className="sync-card" onClick={props.onOpenSync}>
        <code>$ systemctl status sync</code>
        <strong>
          <span className="state-dot" data-state={sync?.state ?? 'unknown'} />
          {sync ? SYNC_LABELS[sync.state] : '查看同步设置'}
        </strong>
        <span className="dim">Grok → Markdown → 拾讯</span>
      </button>

      <div className="side-foot">
        {'// 保持好奇，认真阅读。'}
        <br />
        UTC−8 · 原文归档
      </div>
    </aside>
  );
}
