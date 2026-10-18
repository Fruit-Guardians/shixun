import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { RefObject } from 'react';
import { countLinks } from '#shared';
import type { Category, Report, SyncState } from '#shared';
import type { Density } from '../lib/preferences.ts';
import type { BrowseModel } from '../lib/selectors.ts';
import type { BrowseState } from '../state/browse.ts';
import ArchiveList from './ArchiveList.tsx';
import { EmptyResults } from './EmptyState.tsx';
import { Hero } from './Hero.tsx';
import ScrambleText from './ScrambleText.tsx';
import StoryCard from './StoryCard.tsx';
import { FilterRow, Toolbar } from './Toolbar.tsx';

interface BrowseViewProps {
  browse: BrowseState;
  model: BrowseModel;
  reports: Report[];
  sync: SyncState | null;
  hasDriveImports: boolean;
  error: string | null;
  refreshing: boolean;
  density: Density;
  saved: ReadonlySet<string>;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onCategory: (category: Category) => void;
  onEdition: (id: string) => void;
  onDensity: (density: Density) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  onToggleSave: (storyId: string) => void;
  onOpenReport: (reportId: string, storyIndex?: number) => void;
  onOpenSync: () => void;
}

export default function BrowseView(props: BrowseViewProps) {
  const { browse, model, reports, sync, hasDriveImports, saved } = props;
  const { view, category, query } = browse;
  const { activeReport, filtered } = model;
  const searching = query.trim() !== '';
  const showToday = view === 'today' && !searching;
  const showArchiveList = view === 'archive' && !searching;

  const sectionTitle = searching ? '搜索结果' : view === 'archive' ? '全部日报' : view === 'saved' ? '本机收藏' : '本期动态';

  return (
    <>
      {showToday && (
        <Hero
          report={activeReport}
          hasDrive={hasDriveImports}
          storyCount={activeReport ? (model.storyCounts.get(activeReport.id) ?? 0) : 0}
          linkCount={activeReport ? countLinks(activeReport.raw) : 0}
          sync={sync}
          onRead={() => activeReport && props.onOpenReport(activeReport.id)}
          onOpenSync={props.onOpenSync}
        />
      )}
      {view === 'archive' && (
        <div className="page-title">
          <p className="hero-cmd">
            <span className="prompt">$</span> git log --reports
          </p>
          <h1>
            <ScrambleText text="让每天的发现，留下来。" />
          </h1>
          <p>{reports.length} 份日报，按内容日期归档。新增文件导入后将出现在这里。</p>
        </div>
      )}
      {view === 'saved' && (
        <div className="page-title">
          <p className="hero-cmd">
            <span className="prompt">$</span> ls ~/read-later
          </p>
          <h1>
            <ScrambleText text="好内容，留一点时间再读。" />
          </h1>
          <p>已保存 {saved.size} 条 · 收藏仅保存在当前浏览器。</p>
        </div>
      )}

      <div className="browse-controls">
        <Toolbar
          title={sectionTitle}
          count={showArchiveList ? reports.length : filtered.length}
          density={props.density}
          query={query}
          refreshing={props.refreshing}
          searchRef={props.searchRef}
          onDensity={props.onDensity}
          onQuery={props.onQuery}
          onRefresh={props.onRefresh}
        />

        {view !== 'archive' && (
          <FilterRow
            category={category}
            counts={model.counts}
            onCategory={props.onCategory}
            editions={showToday ? { reports, activeId: activeReport?.id ?? '', onChange: props.onEdition } : undefined}
          />
        )}
      </div>

      {props.error && (
        <div className="error-banner" role="alert">
          <span>{props.error}</span>
          <button onClick={props.onRefresh}>重试</button>
        </div>
      )}

      {showArchiveList ? (
        <ArchiveList reports={reports} storyCounts={model.storyCounts} onOpen={props.onOpenReport} />
      ) : (
        <>
          <div className={`stories-grid ${props.density === 'list' ? 'list-layout' : ''}`}>
            {filtered.map((story, i) => (
              <StoryCard
                key={story.id}
                story={story}
                position={i}
                lead={i === 0 && category === '全部' && !searching}
                query={query}
                saved={saved.has(story.id)}
                onToggleSave={props.onToggleSave}
                onOpen={props.onOpenReport}
              />
            ))}
          </div>
          {filtered.length === 0 && <EmptyResults saved={view === 'saved'} onReset={props.onClearFilters} />}
        </>
      )}

      {showToday && activeReport && (
        <div className="edition-footer">
          <span>
            <strong>{'// 不止这些动态，还有完整的观察与讨论。'}</strong>
            <small>博主追踪、开源项目、技术讨论与 10 分钟精选，都在原文里。</small>
          </span>
          <button className="btn" onClick={() => props.onOpenReport(activeReport.id)}>
            cat report.md
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      <footer className="main-footer">
        <span>shixun v2 · daily signal</span>
        <span>原文保留 · 技术判断以一手资料为准</span>
        <button onClick={props.onOpenSync}>
          数据与同步
          <ArrowUpRight size={12} />
        </button>
      </footer>
    </>
  );
}
