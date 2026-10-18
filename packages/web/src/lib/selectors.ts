import { CATEGORIES, storyMatches } from '#shared';
import type { Category, ReportSummary, StorySummary } from '#shared';
import type { BrowseState } from '../state/browse.ts';

export function storiesOf(reports: readonly ReportSummary[]): StorySummary[] {
  return reports.flatMap((report) => report.stories);
}

export function matchesCategory(story: StorySummary, category: Category): boolean {
  return category === '全部' || story.tags.includes(category);
}

/** 本地匹配：只看标题与摘要。全文搜索由服务端完成，本地匹配用于等待结果或服务端不可用时。 */
export function matchesQuery(story: StorySummary, query: string): boolean {
  return !query.trim() || storyMatches(`${story.title} ${story.summary}`, query);
}

export interface BrowseModel {
  stories: StorySummary[];
  activeReport: ReportSummary | undefined;
  /** 当前范围内、尚未按领域与关键词过滤的动态。 */
  scoped: StorySummary[];
  filtered: StorySummary[];
  counts: Record<Category, number>;
  storyCounts: ReadonlyMap<string, number>;
}

/**
 * 当前视图能看到哪些动态：
 * - 有搜索词时搜索全部日报：有服务端全文结果（searchHits）就以它为准，否则退回本地标题 + 摘要匹配；
 * - 「稍后阅读」只看已收藏；
 * - 其余只看当前选中的这一期。
 */
export function deriveBrowse(
  reports: readonly ReportSummary[],
  state: BrowseState,
  saved: ReadonlySet<string>,
  searchHits: ReadonlySet<string> | null = null,
): BrowseModel {
  const stories = storiesOf(reports);
  const activeReport = reports.find((r) => r.id === state.edition) ?? reports[0];
  const searching = state.query.trim() !== '';

  const scoped = searching
    ? stories
    : state.view === 'saved'
      ? stories.filter((s) => saved.has(s.id))
      : stories.filter((s) => s.reportId === activeReport?.id);

  const matches = (s: StorySummary) => !searching || (searchHits ? searchHits.has(s.id) : matchesQuery(s, state.query));
  const filtered = scoped.filter((s) => matchesCategory(s, state.category) && matches(s));

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, scoped.filter((s) => matchesCategory(s, c)).length])) as Record<Category, number>;

  const storyCounts = new Map(reports.map((r) => [r.id, r.stories.length]));

  return { stories, activeReport, scoped, filtered, counts, storyCounts };
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** 把文本按搜索词切成「普通 / 命中」片段，供高亮渲染；不区分大小写，关键词按字面匹配。 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .split(new RegExp(`(${escaped})`, 'gi'))
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}
