import { SYNC_PROTOCOL_CURRENT, SYNC_PROTOCOL_HEADER } from '#shared';
import { ACCESS_JWT_HEADER, defaultAccessVerifier } from './access.ts';
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

/** 读取并校验 Access JWT；未配置团队域名或 AUD 时一律失败（宁可拒绝，不可放行）。 */
export async function verifyAccess(request: Request, env: ApiEnv, verifier: AccessVerifier): Promise<AccessIdentity | null> {
  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
  return verifier.verify(token, { teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD });
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

/**
 * Worker 入口的整站闸门：Access 模式下，没有有效 Access JWT 的请求（页面与接口）一律拒绝，
 * 防止绕过 Access 直接访问 Worker（例如未受保护的域名）。非 Access 模式返回 null，不做处理。
 */
export async function accessGate(request: Request, env: ApiEnv, verifier: AccessVerifier = defaultAccessVerifier): Promise<Response | null> {
  if (!usesAccess(env)) return null;
  if (await verifyAccess(request, env, verifier)) return null;
  return new Response('需要通过 Cloudflare Access 登录后访问。', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}
