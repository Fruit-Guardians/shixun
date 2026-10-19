import type { CATEGORIES, FEED_GROUPS, FEED_SEVERITIES, FEED_SOURCES, TOPICS } from './constants.ts';

export type ReportTopic = (typeof TOPICS)[number];
export type Category = (typeof CATEGORIES)[number];
export type FeedSource = (typeof FEED_SOURCES)[number];
export type FeedSeverity = (typeof FEED_SEVERITIES)[number];
export type FeedGroup = (typeof FEED_GROUPS)[number];

export interface Report {
  id: string;
  date: string;
  title: string;
  topic: ReportTopic;
  source: string;
  sourceFileId: string | null;
  raw: string;
  importedAt: string | null;
  revision?: number;
}

/** 日报中「①昨日重要动态」里的一条。 */
export interface Story {
  id: string;
  index: number;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  reportId: string;
  date: string;
  topic: ReportTopic;
}

/** 列表里的一条动态：不含正文，正文只在服务端用于搜索。 */
export type StorySummary = Omit<Story, 'body'>;

/** 列表里的一期日报：元数据、统计与动态摘要，不含原文。原文按需从 `apiPaths.report(id)` 读取。 */
export interface ReportSummary extends Omit<Report, 'raw'> {
  /** 原文字符数（UTF-16 长度）。 */
  chars: number;
  /** 原文里的链接数。 */
  links: number;
  stories: StorySummary[];
}

/** 由原文确定性地派生出的数据（服务端存储，原文变化或解析规则升级时重建）。 */
export interface ReportDigest {
  chars: number;
  links: number;
  stories: Story[];
}

/** 日报正文里的一级章节（①②③…）。 */
export interface Section {
  id: string;
  label: string;
  index: number;
}

export type SyncStateName = 'awaiting_setup' | 'active' | 'stale' | 'attention' | 'disabled';

/** 某个 Drive 文件同步失败的原因，由 Apps Script 上报。 */
export interface SyncFailure {
  fileId: string;
  name: string;
  reason: string;
}

export interface SyncState {
  mode: 'google-apps-script';
  state: SyncStateName;
  lastCheckedAt: string | null;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** 最近一轮失败文件的明细（最多 MAX_SYNC_FAILURES 条）；旧版脚本不上报时为空。 */
  failures: SyncFailure[];
  legacyWriterDisabled: true;
}

/** Apps Script 上报的运行回执。 */
export interface SyncRunInput {
  triggerInstalled: boolean;
  checkedAt?: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  failed?: number;
  failures?: SyncFailure[];
}

/** 校验通过的运行回执；未上报的计数按 0 计。 */
export interface ValidatedSyncRun {
  triggerInstalled: boolean;
  checkedAt: string | null;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  failures: SyncFailure[];
}

/** 导入请求体（手动导入与程序同步共用）。 */
export interface ImportRequest {
  raw: string;
  date: string;
  topic?: ReportTopic;
  sourceFileId?: string;
}

/** 校验通过、可以入库的日报。 */
export interface ValidatedImport {
  id: string;
  raw: string;
  date: string;
  topic: ReportTopic;
  title: string;
  source: string;
  sourceFileId: string | null;
}

export type IngestStatus = 'created' | 'updated' | 'unchanged';

export interface IngestResult {
  id: string;
  status: IngestStatus;
  hash: string;
  revision: number;
}

export interface ReportsResponse {
  reports: ReportSummary[];
  sync: SyncState;
  drive: { status: 'imported' | 'not_connected'; folderId: string };
}

/** 全文搜索结果：命中的动态 id（覆盖动态正文，不只是标题与摘要）。 */
export interface SearchResponse {
  query: string;
  storyIds: string[];
}

/** 一个被替换下来的历史版本（只含元数据；原文按需下载）。 */
export interface ReportVersion {
  id: string;
  hash: string;
  /** 这一版被新版本替换（或被删除）的时间。 */
  savedAt: string;
  /** 原文字符数（按 Unicode 码点计）。 */
  chars: number;
}

/** 某一期的当前版本与历史版本，历史按替换时间倒序。 */
export interface ReportVersionsResponse {
  reportId: string;
  /** 是否为库内记录。种子随站点发布：没有历史，也不能删除。 */
  stored: boolean;
  current: { revision: number; hash: string; importedAt: string | null; chars: number };
  versions: ReportVersion[];
  /** 是否还有更早的版本未列出。 */
  truncated: boolean;
}

export interface DeleteReportResponse {
  id: string;
  deleted: true;
}

export interface SetupCredentialResponse {
  token: string;
}

/**
 * 当前访客的身份，只用于决定界面显示哪些按钮；真正的授权仍由每个写接口自己校验。
 * 不包含服务令牌身份。
 */
export interface SessionResponse {
  /** 是否带着有效的登录身份。 */
  signedIn: boolean;
  /** 是否站点所有者：可以导入、删除、恢复版本和查看同步失败明细。 */
  owner: boolean;
  /** 登录用户自己的邮箱；未登录为 null。 */
  email: string | null;
  /** 所有者登录入口（Cloudflare Access 部署为 `/login`）；平台自带登录时为 null。 */
  loginPath: string | null;
  /** 退出登录地址；未登录或平台自带登录时为 null。 */
  logoutPath: string | null;
}

/** 信源速递里的一条：定时从公开来源抓取，原样展示，不经过任何模型。 */
export interface FeedItem {
  /** `<频道 id>:<来源内 id>`。 */
  id: string;
  source: FeedSource;
  /** 频道 id，如 `hackernews`、`rss-lwn`。 */
  channel: string;
  /** 频道显示名，如「LWN.net」。 */
  channelName: string;
  title: string;
  /** 只会是 http(s) 地址。 */
  url: string;
  /** 讨论或详情页（Hacker News 评论、GitHub 公告页）；没有时为 null。 */
  discussionUrl: string | null;
  /** 纯文本摘要（已去掉 HTML），可能为空。 */
  summary: string;
  author: string | null;
  /** Hacker News 得分、GitHub 今日新增星标；其他来源为 null。 */
  score: number | null;
  /** 漏洞严重程度；非漏洞来源为 null。 */
  severity: FeedSeverity | null;
  /** 补充标签：编程语言、受影响的生态、CVE 编号等。 */
  tags: string[];
  /** 来源给出的发布时间；GitHub Trending 没有发布时间，用首次抓到的时间。 */
  publishedAt: string;
}

/** 一个频道：介绍信息，以及最近一次抓取的结果。 */
export interface FeedChannelStatus {
  id: string;
  source: FeedSource;
  /** 信息源页面上的分组。 */
  group: FeedGroup;
  name: string;
  /** 一句话介绍这个频道主要看什么。 */
  description: string;
  /** 来源网站首页（http(s)）。 */
  homepage: string;
  /** 两次抓取之间至少隔多少分钟。 */
  everyMinutes: number;
  /** 从未抓取过为 null。 */
  lastRunAt: string | null;
  ok: boolean;
  /** 最近一次抓到的条数。 */
  fetched: number;
  /** 失败原因（只含状态码、超时等，不含响应内容）。 */
  error: string | null;
  /** 最近一次抓到的条目里最新的发布时间，包括 30 天保留期以外的；从没抓到过为 null。 */
  latestAt: string | null;
}

/** GET /api/feed/channels：全部频道，按分组、列表顺序排列。 */
export interface FeedChannelsResponse {
  channels: FeedChannelStatus[];
}

export interface FeedResponse {
  items: FeedItem[];
  channels: FeedChannelStatus[];
  /** 还有更早的条目时，传给下一次请求的 `cursor`。 */
  nextCursor: string | null;
}

export interface FeedRefreshResponse {
  channels: FeedChannelStatus[];
}

export interface HealthResponse {
  ok: true;
  database: boolean;
}

/** 所有错误响应的统一结构。 */
export interface ApiErrorBody {
  error: string;
  code?: string;
}
