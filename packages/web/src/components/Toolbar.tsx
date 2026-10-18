import { ChevronDown, LayoutGrid, List, RefreshCw, X } from 'lucide-react';
import type { RefObject } from 'react';
import { CATEGORIES } from '#shared';
import type { Category, ReportSummary } from '#shared';
import { topicLabel } from '../lib/labels.ts';
import type { Density } from '../lib/preferences.ts';

interface ToolbarProps {
  title: string;
  count: number;
  density: Density;
  query: string;
  refreshing: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onDensity: (density: Density) => void;
  onQuery: (query: string) => void;
  onRefresh: () => void;
}

export function Toolbar({ title, count, density, query, refreshing, searchRef, onDensity, onQuery, onRefresh }: ToolbarProps) {
  return (
    <div className="content-toolbar">
      <div className="section-label">
        {title}
        <span className="result-count">{count}</span>
      </div>
      <div className="toolbar-right">
        <div className="seg" role="group" aria-label="阅读布局">
          {(['grid', 'list'] as const).map((value) => (
            <button
              key={value}
              aria-label={value === 'grid' ? '卡片布局' : '列表布局'}
              aria-pressed={density === value}
              className={density === value ? 'active' : ''}
              onClick={() => onDensity(value)}
            >
              {value === 'grid' ? <LayoutGrid size={16} /> : <List size={17} />}
            </button>
          ))}
        </div>
        <label className="search-box">
          <span className="prompt" aria-hidden="true">
            grep -i
          </span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="主题 / 作者 / 项目"
            aria-label="搜索主题、作者、项目"
          />
          {query ? (
            <button onClick={() => onQuery('')} aria-label="清除搜索">
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
        <button className="btn btn-icon" aria-label="刷新归档" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
        </button>
      </div>
    </div>
  );
}

interface FilterRowProps {
  category: Category;
  counts?: Record<Category, number>;
  onCategory: (category: Category) => void;
  /** 传入时显示「选择日报」下拉。 */
  editions?: { reports: ReportSummary[]; activeId: string; onChange: (id: string) => void };
}

export function FilterRow({ category, counts, onCategory, editions }: FilterRowProps) {
  return (
    <div className="filter-row">
      <div className="filter-tabs">
        {CATEGORIES.map((c) => (
          <button className={category === c ? 'active' : ''} key={c} onClick={() => onCategory(c)} aria-pressed={category === c}>
            {c}
            {counts && <span className="tab-count">{counts[c] ?? 0}</span>}
          </button>
        ))}
      </div>
      {editions && (
        <label className="edition-select">
          <select aria-label="选择日报" value={editions.activeId} onChange={(e) => editions.onChange(e.target.value)}>
            {editions.reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} · {topicLabel(r.topic)}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
      )}
    </div>
  );
}
