import type { Report } from '#shared';

/** 运行环境绑定。由宿主（Worker）在每次请求时传入，API 包本身不读取任何全局。 */
export interface ApiEnv {
  DB?: D1Database;
  /** 可选：允许带 Bearer 凭证的服务端导入（POST /api/reports）。 */
  INGEST_TOKEN?: string;
  /** 站点后台凭证；仅登录用户可经 setup-credential 取回。 */
  SITES_SERVICE_ACCESS?: string;
  /** 可选：逗号分隔的站点所有者邮箱。配置后只有这些账号能取回 SITES_SERVICE_ACCESS。 */
  OWNER_EMAILS?: string;
}

export interface ApiOptions {
  /** 随代码发布的历史日报。数据库中同日期同主题的记录会取代「用户提供的历史文案」。 */
  seedReports?: readonly Report[];
  /** 时钟；测试可注入固定时间。 */
  now?: () => Date;
}
