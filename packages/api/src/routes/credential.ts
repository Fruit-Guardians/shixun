import type { SetupCredentialResponse } from '#shared';
import { HttpError, json } from '../http.ts';
import type { Handler } from '../router.ts';
import { requireOwner } from './owner.ts';

/** POST /api/integration/setup-credential — 登录的站点所有者一次性取回同步凭证（不写入客户端源码）。 */
export const setupCredentialRoute: Handler = ({ request, env }) => {
  requireOwner(request, env, '只有站点所有者可以取回同步凭证。');
  if (!env.SITES_SERVICE_ACCESS) throw new HttpError(503, '站点后台凭证尚未配置。');
  const body: SetupCredentialResponse = { token: env.SITES_SERVICE_ACCESS };
  return json(body);
};
