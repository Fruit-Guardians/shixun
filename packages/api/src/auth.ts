import { SYNC_PROTOCOL_CURRENT, SYNC_PROTOCOL_HEADER } from '#shared';
import { ACCESS_JWT_HEADER } from './access.ts';
import type { AccessIdentity, AccessVerifier } from './access.ts';
import type { ApiEnv } from './env.ts';

export interface PlatformUser {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
}

const USER_ID = 'oai-authenticated-user-id';
const USER_EMAIL = 'oai-authenticated-user-email';
const USER_FULL_NAME = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING = 'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** 站点入口（Sites ingress）在登录后注入的身份头；没有则视为未登录。 */
export function getPlatformUser(headers: Headers): PlatformUser | null {
  const userId = headers.get(USER_ID);
  const email = headers.get(USER_EMAIL);
  if (!userId || !email) return null;

  const encoded = headers.get(USER_FULL_NAME);
  const fullName = encoded && headers.get(USER_FULL_NAME_ENCODING) === PERCENT_ENCODED_UTF8 ? safeDecode(encoded) : null;
  return { userId, displayName: fullName ?? email, email, fullName };
}

/**
 * 程序同步协议标识：不得来自浏览器（无 Origin / Sec-Fetch-Site）。
 * 真正的凭证在站点私有入口校验，这里只识别协议，不能替代认证。
 */
export function isProgramSync(request: Request): boolean {
  return (
    !request.headers.has('origin') &&
    !request.headers.has('sec-fetch-site') &&
    request.headers.get(SYNC_PROTOCOL_HEADER) === SYNC_PROTOCOL_CURRENT
  );
}

/** 恒定时间比较，避免通过响应时间推测凭证。 */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function hasBearerToken(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const header = request.headers.get('authorization');
  return header !== null && safeEqual(header, `Bearer ${expected}`);
}

/**
 * 同源检查（防 CSRF）。allowMissing=true 时，没有 Origin 的请求（服务端调用）放行；
 * 否则必须带上并等于本站 Origin。
 */
export function isSameOrigin(request: Request, options: { allowMissing: boolean }): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return options.allowMissing;
  return origin === new URL(request.url).origin;
}

/**
 * 站点所有者检查。未配置 OWNER_EMAILS 时不额外限制（由站点私有访问兜底）；
 * 配置后邮箱必须在名单内（不区分大小写）。`required` 时（Access 模式）未配置即无人是所有者。
 */
export function isOwner(user: PlatformUser, ownerEmails: string | undefined, required = false): boolean {
  const allowed = (ownerEmails ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return (allowed.length === 0 && !required) || allowed.includes(user.email.toLowerCase());
}

export const ACCESS_PROVIDER = 'cloudflare-access';

/** 本次请求的调用方：登录用户、程序同步，或都不是。 */
export interface Caller {
  user: PlatformUser | null;
  /** 受保护的程序同步（Google Apps Script）。 */
  programSync: boolean;
  /** 是否使用 Cloudflare Access 认证。 */
  access: boolean;
}

export function usesAccess(env: ApiEnv): boolean {
  return env.AUTH_PROVIDER === ACCESS_PROVIDER;
}

/** Access 登录后写在本站域名下的 cookie，值就是同一份签名 JWT。 */
export const ACCESS_COOKIE = 'CF_Authorization';
/** 所有者登录入口：只有这个路径（和 /api/sync）在 Access 应用范围内，其余页面与读取接口公开。 */
export const ACCESS_LOGIN_PATH = '/login';
/** Access 自带的退出地址：清除本站域名下的 `CF_Authorization` cookie。 */
export const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout';

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim() || null;
  }
  return null;
}

/**
 * 读取并校验 Access JWT；未配置团队域名或 AUD 时一律失败（宁可拒绝，不可放行）。
 * 受 Access 保护的路径由 Access 注入请求头；公开路径上，登录过的浏览器带着 `CF_Authorization` cookie，
 * 同样验签。cookie 只能证明登录用户，服务令牌必须走请求头。
 */
export async function verifyAccess(request: Request, env: ApiEnv, verifier: AccessVerifier): Promise<AccessIdentity | null> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  const config = { teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD };
  const header = request.headers.get(ACCESS_JWT_HEADER);
  if (header) return verifier.verify(header, config);
  const cookie = readCookie(request, ACCESS_COOKIE);
  if (!cookie) return null;
  const identity = await verifier.verify(cookie, config);
  return identity?.kind === 'user' ? identity : null;
}

export async function resolveCaller(request: Request, env: ApiEnv, verifier: AccessVerifier): Promise<Caller> {
  if (!usesAccess(env)) return { user: getPlatformUser(request.headers), programSync: isProgramSync(request), access: false };

  const identity = await verifyAccess(request, env, verifier);
  if (identity?.kind === 'user') {
    return { user: { userId: identity.sub, displayName: identity.email, email: identity.email, fullName: null }, programSync: false, access: true };
  }
  // 程序同步需要服务令牌 JWT，同时仍满足协议头与「非浏览器」要求。
  return { user: null, programSync: identity?.kind === 'service' && isProgramSync(request), access: true };
}

/** 未登录时的提示：Access 模式下告诉用户去哪里登录。 */
export function loginHint(access: boolean, action: string): string {
  return access ? `请先访问 ${ACCESS_LOGIN_PATH} 登录，再${action}。` : `请先登录，再${action}。`;
}

/**
 * Worker 入口：Access 模式下 `/login` 已由 Access 完成登录（cookie 已写入），直接回到首页。
 * 其他请求返回 null，交给站点处理；页面与读取接口公开，写操作由各接口自己校验身份。
 */
export function accessLoginRedirect(request: Request, env: ApiEnv): Response | null {
  if (!usesAccess(env)) return null;
  const url = new URL(request.url);
  if (url.pathname !== ACCESS_LOGIN_PATH) return null;
  return new Response(null, { status: 302, headers: { Location: new URL('/', url).toString(), 'Cache-Control': 'private, no-store' } });
}
