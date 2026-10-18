import type { SetupCredentialResponse } from '#shared';
import { HttpError, json } from '../http.ts';
import type { Handler } from '../router.ts';
import { requireOwner } from './owner.ts';

/** POST /api/integration/setup-credential — 登录的站点所有者一次性取回同步凭证（不写入客户端源码）。 */
export const setupCredentialRoute: Handler = async (context) => {
  await requireOwner(context, '只有站点所有者可以取回同步凭证。');
  if ((await context.caller()).access) {
    // Access 模式下脚本使用服务令牌；令牌只在 Cloudflare 后台创建时显示一次，站点不保存。
    throw new HttpError(409, '本站使用 Cloudflare Access：请在 Zero Trust → Access → Service Auth 创建服务令牌，把 Client ID 与 Client Secret 分别存入脚本属性 CF_ACCESS_CLIENT_ID、CF_ACCESS_CLIENT_SECRET。', {
      code: 'access_service_token',
    });
  }
  const { env } = context;
  if (!env.SITES_SERVICE_ACCESS) throw new HttpError(503, '站点后台凭证尚未配置。');
  const body: SetupCredentialResponse = { token: env.SITES_SERVICE_ACCESS };
  return json(body);
};
