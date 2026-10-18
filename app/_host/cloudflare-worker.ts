import handler from 'vinext/server/fetch-handler';
import { accessLoginRedirect } from '#api';
import type { ApiEnv } from '#api';

/**
 * 直接部署到 Cloudflare Workers 时的入口（wrangler.cloudflare.jsonc 的 main）。
 * 站点公开：页面与读取接口不需要登录。Access 只保护 `/login`（所有者登录）和 `/api/sync`（服务令牌），
 * 写操作由各接口校验 Access JWT（请求头或 CF_Authorization cookie）。
 */
const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return accessLoginRedirect(request, env as unknown as ApiEnv) ?? handler.fetch(request, env, ctx);
  },
};

export default worker;
