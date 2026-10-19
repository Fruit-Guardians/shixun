import type { Category, FeedGroup, FeedSeverity, FeedSource, ReportTopic, SyncStateName } from '#shared';

export const CATEGORY_LABELS: Record<Category, string> = {
  全部: '全部动态',
  AI: 'AI 与 Agent',
  网安: '网络安全',
  'Web 安全': 'Web 安全',
  二进制安全: '二进制安全',
  开源社区: '开源社区',
  软件工程: '软件工程',
  互联网资讯: '互联网资讯',
};

export const SYNC_LABELS: Record<SyncStateName, string> = {
  awaiting_setup: '等待 Google 首次授权',
  active: '程序同步运行中',
  stale: '最近未收到同步回执',
  attention: '有文件需要检查',
  disabled: 'Google 触发器未启用',
};

export function topicLabel(topic: ReportTopic): string {
  return topic === '安全专题' ? '安全专题' : '综合日报';
}

export function topicEyebrow(topic: ReportTopic): string {
  return topic === '安全专题' ? 'SECURITY EDITION' : 'GLOBAL TECH EDITION';
}

/** 终端风格里的短标签：领域 → 三字母代码。 */
export const TAG_CODES: Record<string, string> = {
  AI: 'AI',
  网安: 'SEC',
  'Web 安全': 'WEB',
  二进制安全: 'BIN',
  开源社区: 'OSS',
  软件工程: 'ENG',
  互联网资讯: 'NET',
};

export function tagCode(tag: string): string {
  return TAG_CODES[tag] ?? tag.slice(0, 3).toUpperCase();
}

export const FEED_SOURCE_LABELS: Record<FeedSource, string> = {
  hackernews: 'Hacker News',
  lobsters: 'Lobsters',
  v2ex: 'V2EX',
  github: 'GitHub Trending',
  releases: '版本发布',
  papers: '论文',
  rss: '博客 / RSS',
  zh: '中文博客',
  security: '安全研究',
  kev: 'CISA KEV',
  nvd: 'NVD 漏洞',
  ghsa: 'GitHub Advisory',
  osv: 'OSV 生态',
};

/** 信源条目左侧的短代码。 */
export const FEED_SOURCE_CODES: Record<FeedSource, string> = {
  hackernews: 'HN',
  lobsters: 'LOB',
  v2ex: 'V2EX',
  github: 'GH',
  releases: 'REL',
  papers: 'PPR',
  rss: 'RSS',
  zh: '中文',
  security: 'SEC',
  kev: 'KEV',
  nvd: 'CVE',
  ghsa: 'GHSA',
  osv: 'OSV',
};

/** 与侧栏领域同一组颜色，按大类分：社区黄、GitHub 青、论文绿、博客蓝、中文灰、漏洞与安全研究红、公告紫。 */
export const FEED_SOURCE_COLORS: Record<FeedSource, string> = {
  hackernews: 'var(--c5)',
  lobsters: 'var(--c5)',
  v2ex: 'var(--c5)',
  github: 'var(--c4)',
  releases: 'var(--c4)',
  papers: 'var(--c0)',
  rss: 'var(--c3)',
  zh: 'var(--c6)',
  security: 'var(--c1)',
  kev: 'var(--c1)',
  nvd: 'var(--c1)',
  ghsa: 'var(--c2)',
  osv: 'var(--c2)',
};

/** 信息源页面的分组标题。 */
export const FEED_GROUP_LABELS: Record<FeedGroup, string> = {
  community: '开发者社区',
  github: 'GitHub 与版本发布',
  papers: '论文',
  blogs: '技术博客',
  zh: '中文',
  vulns: '漏洞情报',
  'sec-web': 'Web 安全、代码审计与漏洞挖掘',
  'sec-binary': '二进制、浏览器、内核、逆向与 Fuzzing',
  'sec-windows': 'Windows、Active Directory、身份安全与红队',
  'sec-cloud': '云安全、容器与 Kubernetes',
  'sec-threat': '恶意软件、威胁情报、应急响应与取证',
  'sec-mobile': '移动安全、IoT、硬件与嵌入式',
  'sec-supply': '开源安全、代码审计与软件供应链',
  'sec-crypto': '密码学、协议与智能合约安全',
  'sec-ai': 'AI / LLM / Agent 安全',
  'sec-archive': '值得精读的旧文',
};

export const SEVERITY_LABELS: Record<FeedSeverity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
};
