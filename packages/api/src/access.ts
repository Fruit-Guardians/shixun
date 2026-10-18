/**
 * Cloudflare Access 身份校验。
 *
 * 部署在 Cloudflare 上时，请求先经过 Access：登录用户或服务令牌（Service Token）通过后，
 * Access 在 `Cf-Access-Jwt-Assertion` 里附上一份签名 JWT。这里用团队公钥（JWKS）验证签名、
 * 签发方、受众（应用 AUD）和有效期，验证通过才认定身份。不读取任何可伪造的明文身份头。
 */

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export interface AccessConfig {
  /** 团队域名，如 `example.cloudflareaccess.com`（可带 https://）。 */
  teamDomain: string;
  /** Access 应用的 Application Audience (AUD) Tag。 */
  aud: string;
}

export type AccessIdentity =
  | { kind: 'user'; sub: string; email: string }
  /** 服务令牌：没有邮箱，common_name 是 Client ID。 */
  | { kind: 'service'; clientId: string };

export interface AccessVerifier {
  verify(token: string, config: AccessConfig): Promise<AccessIdentity | null>;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface JwtPayload {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  sub?: unknown;
  email?: unknown;
  common_name?: unknown;
}

/** 公钥缓存时长；Access 轮换密钥时，遇到未知 kid 会提前刷新。 */
const JWKS_TTL_MS = 10 * 60_000;
/** 未知 kid 触发刷新的最短间隔，避免伪造 kid 打满对 certs 的请求。 */
const JWKS_MIN_REFRESH_MS = 30_000;
/** 允许的时钟偏差。 */
const LEEWAY_S = 60;

export function issuerFor(teamDomain: string): string {
  return `https://${teamDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
}

function base64UrlDecode(part: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeJson(part: string): Record<string, unknown> | null {
  const bytes = base64UrlDecode(part);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

/**
 * 创建校验器。公钥按团队域名缓存在校验器内；测试可注入 fetch 与时钟。
 */
export function createAccessVerifier(options: { fetch?: typeof fetch; now?: () => number } = {}): AccessVerifier {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const cache = new Map<string, KeySet>();

  async function load(issuer: string): Promise<KeySet> {
    const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`, { redirect: 'error' });
    if (!response.ok) throw new Error(`Access certs HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
      const { kid, ...material } = jwk;
      keys.set(kid, await crypto.subtle.importKey('jwk', material, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    const set = { keys, fetchedAt: now() };
    cache.set(issuer, set);
    return set;
  }

  async function keyFor(issuer: string, kid: string): Promise<CryptoKey | null> {
    let set = cache.get(issuer);
    if (!set || now() - set.fetchedAt > JWKS_TTL_MS) set = await load(issuer);
    else if (!set.keys.has(kid) && now() - set.fetchedAt > JWKS_MIN_REFRESH_MS) set = await load(issuer);
    return set.keys.get(kid) ?? null;
  }

  return {
    async verify(token, config) {
      if (!config.teamDomain || !config.aud) return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const header = decodeJson(parts[0]);
      const payload = decodeJson(parts[1]) as JwtPayload | null;
      const signature = base64UrlDecode(parts[2]);
      // 只接受 RS256：拒绝 alg=none 与算法替换。
      if (!header || !payload || !signature || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

      const issuer = issuerFor(config.teamDomain);
      let key: CryptoKey | null;
      try {
        key = await keyFor(issuer, header.kid);
      } catch (error) {
        console.error('access certs unavailable', error);
        return null;
      }
      if (!key) return null;
      const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) return null;

      const seconds = now() / 1000;
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (payload.iss !== issuer || !audiences.includes(config.aud)) return null;
      if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_S < seconds) return null;
      if (typeof payload.nbf === 'number' && payload.nbf - LEEWAY_S > seconds) return null;

      if (typeof payload.email === 'string' && payload.email && typeof payload.sub === 'string' && payload.sub) {
        return { kind: 'user', sub: payload.sub, email: payload.email };
      }
      if (typeof payload.common_name === 'string' && payload.common_name) return { kind: 'service', clientId: payload.common_name };
      return null;
    },
  };
}

/** Worker 内共用一个校验器，让公钥缓存跨请求生效。 */
export const defaultAccessVerifier = createAccessVerifier();
