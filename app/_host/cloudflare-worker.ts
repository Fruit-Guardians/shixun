import handler from 'vinext/server/fetch-handler';
import { accessGate } from '#api';
import type { ApiEnv } from '#api';

/**
 * 直接部署到 Cloudflare Workers 时的入口（wrangler.cloudflare.jsonc 的 main）。
 * 先过 Access 闸门：没有有效 Access JWT 的请求，页面和接口都不处理。
 */
const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const denied = await accessGate(request, env as unknown as ApiEnv);
    return denied ?? handler.fetch(request, env, ctx);
  },
};

export default worker;
