/** 前后端共用的业务常量。改动这里即同时改变两端的校验与展示。 */

export const TOPICS = ['全球技术社区', '安全专题'] as const;
export const DEFAULT_TOPIC = TOPICS[0];

/** 筛选标签；第一项是「不过滤」。顺序即界面展示顺序。 */
export const CATEGORIES = ['全部', 'AI', '网安', 'Web 安全', '二进制安全', '开源社区', '软件工程', '互联网资讯'] as const;

export const MIN_REPORT_CHARS = 100;
/** 单份日报正文的字节上限。 */
export const MAX_REPORT_BYTES = 500_000;
/** 请求体上限（含 JSON 包装），略大于正文上限。 */
export const MAX_BODY_BYTES = 600_000;
/** 同步状态回执的请求体字节上限（含最多 MAX_SYNC_FAILURES 条失败明细）。 */
export const MAX_STATUS_BODY_BYTES = 16_384;
export const MAX_SYNC_COUNT = 10_000;
/** 一次回执最多携带的失败明细条数；更多的只计入 failed。 */
export const MAX_SYNC_FAILURES = 10;
/** 失败明细里文件名与原因的字符上限，超出部分截断。 */
export const MAX_SYNC_FAILURE_NAME_CHARS = 200;
export const MAX_SYNC_FAILURE_REASON_CHARS = 300;
/** 同步回执保留时长；更早的在写入新回执时清理。 */
export const SYNC_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 超过该时长没有收到 Google 脚本回执，同步状态记为「延迟」。 */
export const SYNC_STALE_MS = 60 * 60 * 1000;

/** 搜索词的字符上限。 */
export const MAX_SEARCH_CHARS = 100;

/** Google Apps Script 同步协议标识（仅标识协议，不是认证）。 */
export const SYNC_PROTOCOL_HEADER = 'x-sites-report-sync';
export const SYNC_PROTOCOL_CURRENT = 'google-apps-script';
export const SYNC_PROTOCOL_RETIRED = 'google-drive';

/** 日报源文件夹（Google Drive）。 */
export const DRIVE_FOLDER_ID = '1K0N3bIvwxE8x38BKc9vVeKxqqDdlGjpT';

export const SIGN_IN_PATH = '/signin-with-chatgpt';

/** 所有 HTTP 路径只在此处定义，前后端共用。 */
export const apiPaths = {
  health: '/api/health',
  reports: '/api/reports',
  report: (id: string) => `/api/reports/${encodeURIComponent(id)}`,
  search: '/api/search',
  sync: '/api/sync',
  syncStatus: '/api/sync/status',
  setupCredential: '/api/integration/setup-credential',
} as const;
