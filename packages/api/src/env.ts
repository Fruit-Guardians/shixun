import type { Report } from '#shared';
import type { AccessVerifier } from './access.ts';

/** 运行环境绑定。由宿主（Worker）在每次请求时传入，API 包本身不读取任何全局。 */
export interface ApiEnv {
  DB?: D1Database;
  /** 可选：允许带 Bearer 凭证的服务端导入（POST /api/reports）。 */
  INGEST_TOKEN?: string;
  /** 站点后台凭证；仅登录用户可经 setup-credential 取回。 */
  SITES_SERVICE_ACCESS?: string;
  /** 可选：逗号分隔的站点所有者邮箱。配置后只有这些账号能取回 SITES_SERVICE_ACCESS。 */
  OWNER_EMAILS?: string;
  /**
   * 身份来源。未设置或 `sites`：信任 Sites 入口注入的身份头（只能部署在 Sites 后面）。
   * `cloudflare-access`：只认 Cloudflare Access 签名的 JWT，明文身份头一律忽略；此时 OWNER_EMAILS 必填。
   */
  AUTH_PROVIDER?: string;
  /** Cloudflare Access 团队域名，如 `example.cloudflareaccess.com`。 */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access 应用的 AUD Tag。 */
  CF_ACCESS_AUD?: string;
}

export interface ApiOptions {
  /** 随代码发布的历史日报。数据库中同日期同主题的记录会取代「用户提供的历史文案」。 */
  seedReports?: readonly Report[];
  /** 时钟；测试可注入固定时间。 */
  now?: () => Date;
  /** Cloudflare Access JWT 校验器；默认使用全局共享的一个（公钥缓存跨请求）。 */
  accessVerifier?: AccessVerifier;
}
