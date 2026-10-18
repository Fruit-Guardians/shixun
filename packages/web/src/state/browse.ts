import type { Category } from '#shared';

export type View = 'today' | 'archive' | 'saved';

export interface BrowseState {
  view: View;
  category: Category;
  query: string;
  /** 「每日观察」当前选中的日报 id；找不到时界面回退到最新一期。 */
  edition: string;
}

export type BrowseAction =
  | { type: 'navigate'; view: View }
  | { type: 'set-category'; category: Category }
  /** 侧栏选择领域：从日报归档或阅读页进入时回到「每日观察」。 */
  | { type: 'focus-category'; category: Category; fromReader: boolean }
  | { type: 'set-query'; query: string }
  | { type: 'set-edition'; id: string }
  /** 切到某一期并清除筛选（侧栏近期日报、导入完成后）。 */
  | { type: 'show-edition'; id: string }
  | { type: 'clear-filters' };

export function initialBrowse(edition: string): BrowseState {
  return { view: 'today', category: '全部', query: '', edition };
}

export function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
  switch (action.type) {
    case 'navigate':
      return { ...state, view: action.view, category: '全部', query: '' };
    case 'set-category':
      return { ...state, category: action.category };
    case 'focus-category':
      return { ...state, category: action.category, view: action.fromReader || state.view === 'archive' ? 'today' : state.view };
    case 'set-query':
      return { ...state, query: action.query };
    case 'set-edition':
      return { ...state, edition: action.id };
    case 'show-edition':
      return { view: 'today', category: '全部', query: '', edition: action.id };
    case 'clear-filters':
      return { ...state, category: '全部', query: '' };
  }
}
