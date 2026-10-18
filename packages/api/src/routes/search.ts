import { MAX_SEARCH_CHARS } from '#shared';
import { requireDb } from '../database.ts';
import { HttpError, json } from '../http.ts';
import type { Handler } from '../router.ts';
import { searchReports } from '../services/reports.ts';
import { mapServiceErrors } from './service-errors.ts';

/** GET /api/search?q= — 在所有动态的标题与正文里搜索，返回命中的动态 id。 */
export const searchRoute: Handler = async ({ url, env, seeds }) => {
  const query = url.searchParams.get('q') ?? '';
  if (query.length > MAX_SEARCH_CHARS) throw new HttpError(400, `搜索词不能超过 ${MAX_SEARCH_CHARS} 个字符。`);
  return json(await mapServiceErrors('reports.search', '搜索暂时不可用，请稍后重试。', () => searchReports(requireDb(env), seeds, query)));
};
