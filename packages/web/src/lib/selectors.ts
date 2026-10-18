import { CATEGORIES, storiesFor } from '#shared';
import type { Category, Report, Story } from '#shared';
import type { BrowseState } from '../state/browse.ts';

export function storiesOf(reports: readonly Report[]): Story[] {
  return reports.flatMap((report) => storiesFor(report));
}

export function matchesCategory(story: Story, category: Category): boolean {
  return category === '全部' || story.tags.includes(category);
}

export function matchesQuery(story: Story, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || `${story.title} ${story.body}`.toLowerCase().includes(needle);
}

export interface BrowseModel {
  stories: Story[];
  activeReport: Report | undefined;
  /** 当前范围内、尚未按领域与关键词过滤的动态。 */
  scoped: Story[];
  filtered: Story[];
  counts: Record<Category, number>;
  storyCounts: ReadonlyMap<string, number>;
}

/**
 * 当前视图能看到哪些动态：
 * - 有搜索词时搜索全部日报；
 * - 「稍后阅读」只看已收藏；
 * - 其余只看当前选中的这一期。
 */
export function deriveBrowse(reports: readonly Report[], state: BrowseState, saved: ReadonlySet<string>): BrowseModel {
  const stories = storiesOf(reports);
  const activeReport = reports.find((r) => r.id === state.edition) ?? reports[0];
  const searching = state.query.trim() !== '';

  const scoped = searching
    ? stories
    : state.view === 'saved'
      ? stories.filter((s) => saved.has(s.id))
      : stories.filter((s) => s.reportId === activeReport?.id);

  const filtered = scoped.filter((s) => matchesCategory(s, state.category) && matchesQuery(s, state.query));

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, scoped.filter((s) => matchesCategory(s, c)).length])) as Record<Category, number>;

  const storyCounts = new Map<string, number>();
  for (const s of stories) storyCounts.set(s.reportId, (storyCounts.get(s.reportId) ?? 0) + 1);

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
