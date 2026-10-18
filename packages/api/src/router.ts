import type { Report } from '#shared';
import type { ApiEnv } from './env.ts';
import { HttpError } from './http.ts';

export interface RequestContext {
  request: Request;
  url: URL;
  env: ApiEnv;
  params: Record<string, string>;
  /** 随代码发布的历史日报。 */
  seeds: readonly Report[];
  /** 本次请求的时间；整个请求内保持一致。 */
  now: Date;
}

export type Handler = (context: RequestContext) => Response | Promise<Response>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function match(route: string[], actual: string[]): Record<string, string> | null {
  if (route.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.length; i++) {
    const expected = route[i];
    if (expected.startsWith(':')) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual[i]);
      } catch {
        throw new HttpError(400, '请求路径无效。');
      }
    } else if (expected !== actual[i]) {
      return null;
    }
  }
  return params;
}

/** 极简路由：精确段 + `:param`，区分 404 与 405。 */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method: method.toUpperCase(), segments: split(pattern), handler });
    return this;
  }

  get(pattern: string, handler: Handler) {
    return this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: Handler) {
    return this.add('POST', pattern, handler);
  }

  resolve(method: string, pathname: string): { handler: Handler; params: Record<string, string> } {
    const actual = split(pathname);
    const allowed = new Set<string>();
    for (const route of this.routes) {
      const params = match(route.segments, actual);
      if (!params) continue;
      if (route.method === method.toUpperCase()) return { handler: route.handler, params };
      allowed.add(route.method);
    }
    if (allowed.size) throw new HttpError(405, '不支持该请求方法。', { headers: { Allow: [...allowed].join(', ') } });
    throw new HttpError(404, '接口不存在。');
  }
}
