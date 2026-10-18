import type { Category, ReportTopic, SyncStateName } from '#shared';

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
