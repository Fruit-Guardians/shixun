import { FEED_SEVERITIES } from '#shared';
import type { FeedSeverity } from '#shared';
import { clip, decodeEntities, htmlText, markdownText, normalizeTime, plainText, safeUrl, unwrapCdata } from './text.ts';

/** 解析出的一条，还没归到频道。key 是来源内的稳定 id。 */
export interface FeedDraft {
  key: string;
  title: string;
  url: string;
  discussionUrl: string | null;
  summary: string;
  author: string | null;
  score: number | null;
  severity: FeedSeverity | null;
  tags: string[];
  publishedAt: string;
}

export const TITLE_CHARS = 200;
export const SUMMARY_CHARS = 400;
/** 每个频道每次最多收录的条数。 */
export const MAX_ITEMS_PER_RUN = 30;

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null);

function severityOf(value: unknown): FeedSeverity | null {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  // GitHub / OSV 把中危写作 moderate。
  const text = raw === 'moderate' ? 'medium' : raw;
  return (FEED_SEVERITIES as readonly string[]).includes(text) ? (text as FeedSeverity) : null;
}

function finish(drafts: FeedDraft[]): FeedDraft[] {
  const seen = new Set<string>();
  return drafts.filter((d) => d.title && !seen.has(d.key) && seen.add(d.key)).slice(0, MAX_ITEMS_PER_RUN);
}

/** Hacker News 首页（Algolia API：`/api/v1/search?tags=front_page`）。 */
export function parseHackerNews(body: unknown, now: Date): FeedDraft[] {
  const hits = Array.isArray(record(body).hits) ? (record(body).hits as unknown[]) : [];
  return finish(
    hits.flatMap((value): FeedDraft[] => {
      const hit = record(value);
      const id = str(hit.objectID);
      const title = str(hit.title);
      if (!id || !/^\d+$/.test(id) || !title) return [];
      const discussion = `https://news.ycombinator.com/item?id=${id}`;
      const comments = num(hit.num_comments);
      return [
        {
          key: id,
          title: plainText(title, TITLE_CHARS),
          url: safeUrl(str(hit.url)) ?? discussion,
          discussionUrl: discussion,
          summary: '',
          author: str(hit.author),
          score: num(hit.points),
          severity: null,
          tags: comments === null ? [] : [`${comments} 条评论`],
          publishedAt: normalizeTime(str(hit.created_at), now),
        },
      ];
    }),
  );
}

const REPO_PATH = /^[\w.-]+\/[\w.-]+$/;

/** github.com/trending 页面。没有官方接口，只按结构解析；页面改版时解析为空，频道会记为失败。 */
export function parseGithubTrending(html: string, now: Date): FeedDraft[] {
  const articles = html.split(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>/).slice(1);
  return finish(
    articles.flatMap((chunk): FeedDraft[] => {
      const article = chunk.split('</article>')[0];
      const heading = /<h2\b[\s\S]*?<\/h2>/.exec(article)?.[0] ?? '';
      const path = /href="\/([^"?#]+)"/.exec(heading)?.[1];
      if (!path || !REPO_PATH.test(path)) return [];
      const description = /<p\b[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(article)?.[1] ?? '';
      const language = /itemprop="programmingLanguage"[^>]*>([^<]+)</.exec(article)?.[1];
      const today = /([\d,]+)\s+stars?\s+(?:today|this week|this month)/.exec(article)?.[1];
      const total = new RegExp(`href="/${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/stargazers"[^>]*>[\\s\\S]*?</svg>\\s*([\\d,]+)`).exec(article)?.[1];
      const tags = [language ? decodeEntities(language.trim()) : null, total ? `★ ${total}` : null].filter((t): t is string => Boolean(t));
      return [
        {
          key: path.toLowerCase(),
          title: path,
          url: `https://github.com/${path}`,
          discussionUrl: null,
          summary: htmlText(description, SUMMARY_CHARS),
          author: path.split('/')[0],
          score: today ? Number(today.replace(/,/g, '')) : null,
          severity: null,
          tags,
          // 榜单没有发布时间：用抓到的时间。入库时保留第一次的值，即「首次上榜」。
          publishedAt: now.toISOString(),
        },
      ];
    }),
  );
}

function tagText(block: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return match ? unwrapCdata(match[1]).trim() || null : null;
}

/** RSS 2.0 的 author 是邮箱，常写成 `mail@example.com (Name)`：只留名字，纯邮箱丢掉。 */
function authorName(value: string | null): string | null {
  if (!value) return null;
  const text = plainText(value, 80);
  const named = /^\S+@\S+\s+\((.+)\)$/.exec(text)?.[1];
  if (named) return named.trim() || null;
  return /^\S+@\S+$/.test(text) ? null : text || null;
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  // Blogger 的属性用单引号。
  const pick = links.find((attrs) => /rel=["']alternate["']/i.test(attrs)) ?? links.find((attrs) => !/rel=/i.test(attrs)) ?? links[0];
  return pick ? (/href=(?:"([^"]+)"|'([^']+)')/i.exec(pick)?.slice(1).find(Boolean) ?? null) : null;
}

/** 摘要开头、结尾的固定套话：arXiv 的「arXiv:id Announce Type: new Abstract:」，少数派的「查看全文」。 */
function trimBoilerplate(text: string): string {
  return text.replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*/i, '').replace(/\s*(查看全文|点击查看原文\s*[>＞]?)$/, '');
}

function withPrefix(title: string, prefix: string | undefined): string {
  return prefix && !title.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix} ${title}` : title;
}

/**
 * RSS 2.0 与 Atom。逐条匹配 item / entry，正文被截断时只会少掉末尾几条。
 * 只处理前面若干条：大源（arXiv、带全文的博客）逐条去标签很费 CPU。
 */
export function parseFeedXml(xml: string, base: string, now: Date, options: { titlePrefix?: string } = {}): FeedDraft[] {
  const blocks = [];
  for (const match of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    blocks.push(match[0]);
    if (blocks.length >= MAX_ITEMS_PER_RUN * 2) break;
  }
  return finish(
    blocks.flatMap((block): FeedDraft[] => {
      const title = clip(withPrefix(plainText(tagText(block, 'title') ?? '', TITLE_CHARS), options.titlePrefix), TITLE_CHARS);
      const link = safeUrl(tagText(block, 'link') ?? atomLink(block), base);
      if (!title || !link) return [];
      const id = tagText(block, 'guid') ?? tagText(block, 'id') ?? link;
      const body = tagText(block, 'description') ?? tagText(block, 'summary') ?? tagText(block, 'content:encoded') ?? tagText(block, 'content') ?? '';
      const authorBlock = tagText(block, 'author');
      const author = tagText(block, 'dc:creator') ?? (authorBlock ? (tagText(authorBlock, 'name') ?? authorBlock) : null);
      const date = tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated') ?? tagText(block, 'dc:date');
      return [
        {
          key: clip(decodeEntities(id), 300),
          title,
          url: link,
          discussionUrl: null,
          // 多留一点再去套话、再截断，免得套话占掉摘要长度。
          summary: clip(trimBoilerplate(plainText(body, SUMMARY_CHARS + 80)), SUMMARY_CHARS),
          author: authorName(author),
          score: null,
          severity: null,
          tags: [],
          publishedAt: normalizeTime(date, now),
        },
      ];
    }),
  );
}

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

/** NVD 的 CVSS 指标：优先主评分（Primary），其次任一来源；先看 v3.1 / v3.0，再看 v4.0。 */
function nvdSeverity(metrics: Record<string, unknown>): { severity: FeedSeverity | null; score: number | null } {
  for (const key of ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV40']) {
    const list = Array.isArray(metrics[key]) ? (metrics[key] as unknown[]).map(record) : [];
    const metric = list.find((m) => m.type === 'Primary') ?? list[0];
    if (!metric) continue;
    const data = record(metric.cvssData);
    const severity = severityOf(data.baseSeverity ?? metric.baseSeverity);
    if (severity) return { severity, score: typeof data.baseScore === 'number' ? data.baseScore : null };
  }
  return { severity: null, score: null };
}

/** NVD CVE API 2.0。只收录有严重程度的条目；已撤销（Rejected）的跳过。 */
export function parseNvd(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(record(body).vulnerabilities) ? (record(body).vulnerabilities as unknown[]) : [];
  return finish(
    list.flatMap((value): FeedDraft[] => {
      const cve = record(record(value).cve);
      const id = str(cve.id);
      if (!id || !CVE_ID.test(id) || cve.vulnStatus === 'Rejected') return [];
      const descriptions = Array.isArray(cve.descriptions) ? cve.descriptions.map(record) : [];
      const description = str((descriptions.find((d) => d.lang === 'en') ?? descriptions[0])?.value) ?? '';
      const { severity, score } = nvdSeverity(record(cve.metrics));
      if (!severity) return [];
      const text = plainText(description, SUMMARY_CHARS);
      const firstSentence = text.split(/(?<=\.)\s/)[0] ?? text;
      return [
        {
          key: id,
          title: clip(`${id} · ${firstSentence}`, 140),
          url: `https://nvd.nist.gov/vuln/detail/${id}`,
          discussionUrl: null,
          summary: text,
          author: null,
          score: null,
          severity,
          tags: score === null ? [] : [`CVSS ${score.toFixed(1)}`],
          publishedAt: normalizeTime(str(cve.published), now),
        },
      ];
    }),
  );
}

const GHSA_ID = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;

/** GitHub Advisory Database（`GET /advisories?type=reviewed`）。 */
export function parseGhsa(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(body) ? body : [];
  return finish(
    list.flatMap((value): FeedDraft[] => {
      const advisory = record(value);
      const id = str(advisory.ghsa_id);
      const summary = str(advisory.summary);
      if (!id || !GHSA_ID.test(id) || !summary) return [];
      const cve = str(advisory.cve_id);
      const packages = (Array.isArray(advisory.vulnerabilities) ? advisory.vulnerabilities : [])
        .map((v) => record(record(v).package))
        .map((p) => (str(p.ecosystem) && str(p.name) ? `${str(p.ecosystem)}:${str(p.name)}` : null))
        .filter((p): p is string => Boolean(p));
      const page = safeUrl(str(advisory.html_url)) ?? `https://github.com/advisories/${id}`;
      return [
        {
          key: id,
          title: plainText(summary, TITLE_CHARS),
          url: page,
          discussionUrl: null,
          summary: plainText(str(advisory.description) ?? '', SUMMARY_CHARS),
          author: null,
          score: null,
          severity: severityOf(advisory.severity),
          tags: [...(cve && CVE_ID.test(cve) ? [cve] : []), ...[...new Set(packages)].slice(0, 3)].map((t) => clip(t, 60)),
          publishedAt: normalizeTime(str(advisory.published_at), now),
        },
      ];
    }),
  );
}

function nvdDescription(cve: Record<string, unknown>): string {
  const descriptions = Array.isArray(cve.descriptions) ? cve.descriptions.map(record) : [];
  return plainText(str((descriptions.find((d) => d.lang === 'en') ?? descriptions[0])?.value) ?? '', SUMMARY_CHARS);
}

/**
 * CISA KEV（已确认在野利用）。取自 NVD CVE API 的 `hasKev` 查询，比下载 1.8MB 的完整目录小得多。
 * 发布时间用列入 KEV 的日期，而不是 CVE 本身的发布日期（不少是多年前的老漏洞）。
 */
export function parseKev(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(record(body).vulnerabilities) ? (record(body).vulnerabilities as unknown[]) : [];
  const drafts = list.flatMap((value): FeedDraft[] => {
    const cve = record(record(value).cve);
    const id = str(cve.id);
    const added = str(cve.cisaExploitAdd);
    if (!id || !CVE_ID.test(id) || !added || !/^\d{4}-\d{2}-\d{2}$/.test(added)) return [];
    const name = str(cve.cisaVulnerabilityName);
    const { severity, score } = nvdSeverity(record(cve.metrics));
    const due = str(cve.cisaActionDue);
    return [
      {
        key: id,
        title: clip(`${id} · ${name ? plainText(name, TITLE_CHARS) : nvdDescription(cve)}`, 140),
        url: `https://nvd.nist.gov/vuln/detail/${id}`,
        discussionUrl: null,
        summary: nvdDescription(cve),
        author: null,
        score: null,
        severity,
        tags: [score === null ? null : `CVSS ${score.toFixed(1)}`, due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? `处置期限 ${due}` : null].filter((t): t is string => Boolean(t)),
        publishedAt: normalizeTime(added, now),
      },
    ];
  });
  return finish(drafts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
}

/** Lobsters（`/hottest.json`）。文字帖没有外链，链到讨论页。 */
export function parseLobsters(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(body) ? body : [];
  return finish(
    list.flatMap((value): FeedDraft[] => {
      const story = record(value);
      const id = str(story.short_id);
      const title = str(story.title);
      const discussion = safeUrl(str(story.comments_url));
      if (!id || !/^\w+$/.test(id) || !title || !discussion) return [];
      const comments = num(story.comment_count);
      const submitter = str(story.submitter_user) ?? str(record(story.submitter_user).username);
      const tags = (Array.isArray(story.tags) ? story.tags : []).map(str).filter((t): t is string => Boolean(t)).slice(0, 3);
      return [
        {
          key: id,
          title: plainText(title, TITLE_CHARS),
          url: safeUrl(str(story.url)) ?? discussion,
          discussionUrl: discussion,
          summary: plainText(str(story.description_plain) ?? '', SUMMARY_CHARS),
          author: submitter ? clip(submitter, 60) : null,
          score: num(story.score),
          severity: null,
          tags: [...tags.map((t) => clip(t, 30)), ...(comments === null ? [] : [`${comments} 条评论`])],
          publishedAt: normalizeTime(str(story.created_at), now),
        },
      ];
    }),
  );
}

/** V2EX 热门（`/api/topics/hot.json`）。created 是 Unix 秒。 */
export function parseV2ex(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(body) ? body : [];
  return finish(
    list.flatMap((value): FeedDraft[] => {
      const topic = record(value);
      const id = num(topic.id);
      const title = str(topic.title);
      if (id === null || id <= 0 || !title) return [];
      const url = `https://www.v2ex.com/t/${id}`;
      const created = num(topic.created);
      const replies = num(topic.replies);
      const node = str(record(topic.node).title);
      return [
        {
          key: String(id),
          title: plainText(title, TITLE_CHARS),
          url,
          discussionUrl: null,
          summary: markdownText(str(topic.content) ?? '', SUMMARY_CHARS),
          author: str(record(topic.member).username),
          score: null,
          severity: null,
          tags: [...(node ? [clip(plainText(node, 30), 30)] : []), ...(replies === null ? [] : [`${replies} 条回复`])],
          publishedAt: normalizeTime(created === null ? null : new Date(created * 1000).toISOString(), now),
        },
      ];
    }),
  );
}

const ARXIV_ID = /^\d{4}\.\d{4,5}$/;

/** Hugging Face Daily Papers（`/api/daily_papers`）：社区每天挑出的论文，得分是点赞数。 */
export function parseHfPapers(body: unknown, now: Date): FeedDraft[] {
  const list = Array.isArray(body) ? body : [];
  return finish(
    list.flatMap((value): FeedDraft[] => {
      const entry = record(value);
      const paper = record(entry.paper);
      const id = str(paper.id);
      const title = str(paper.title) ?? str(entry.title);
      if (!id || !ARXIV_ID.test(id) || !title) return [];
      const authors = (Array.isArray(paper.authors) ? paper.authors : []).map((a) => str(record(a).name)).filter((a): a is string => Boolean(a));
      const repo = safeUrl(str(paper.githubRepo));
      const comments = num(entry.numComments);
      return [
        {
          key: id,
          title: plainText(title, TITLE_CHARS),
          url: `https://huggingface.co/papers/${id}`,
          discussionUrl: `https://arxiv.org/abs/${id}`,
          summary: plainText(str(paper.summary) ?? str(entry.summary) ?? '', SUMMARY_CHARS),
          author: authors.length ? clip(authors.length > 1 ? `${authors[0]} 等` : authors[0], 80) : null,
          score: num(paper.upvotes),
          severity: null,
          tags: [`arXiv ${id}`, ...(repo?.startsWith('https://github.com/') ? ['有代码'] : []), ...(comments ? [`${comments} 条评论`] : [])],
          publishedAt: normalizeTime(str(paper.submittedOnDailyAt) ?? str(entry.publishedAt), now),
        },
      ];
    }),
  );
}

/** 科技爱好者周刊：仓库提交记录里的「release issue N」即新一期发布。 */
export function parseRuanyfWeekly(xml: string, now: Date): FeedDraft[] {
  const blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return finish(
    blocks.flatMap((block): FeedDraft[] => {
      const issue = /release\s+issue[\s-]*(\d{1,4})\b/i.exec(plainText(tagText(block, 'title') ?? '', TITLE_CHARS))?.[1];
      if (!issue) return [];
      return [
        {
          key: `issue-${issue}`,
          title: `科技爱好者周刊（第 ${issue} 期）`,
          url: `https://github.com/ruanyf/weekly/blob/master/docs/issue-${issue}.md`,
          discussionUrl: null,
          summary: '',
          author: '阮一峰',
          score: null,
          severity: null,
          tags: [],
          publishedAt: normalizeTime(tagText(block, 'updated'), now),
        },
      ];
    }),
  );
}

const OSV_ID = /^[A-Z][A-Z0-9]*(-[A-Za-z0-9.]+){1,4}$/;

/**
 * OSV 生态目录里的 `modified_id.csv`（每行「修改时间,id」，最新的在前）→ 要取详情的 id。
 * MAL-*（恶意包）数量极大、内容雷同，不收录。
 */
export function parseOsvIndex(csv: string, max: number): string[] {
  const ids: string[] = [];
  for (const line of csv.split('\n')) {
    const id = line.split(',')[1]?.trim();
    if (!id || !OSV_ID.test(id) || id.startsWith('MAL-') || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

/** 一条 OSV 记录（schema 1.x）。撤回的（withdrawn）跳过。 */
export function parseOsv(body: unknown, now: Date): FeedDraft | null {
  const vuln = record(body);
  const id = str(vuln.id);
  if (!id || !OSV_ID.test(id) || str(vuln.withdrawn)) return null;
  const details = markdownText(str(vuln.details) ?? '', SUMMARY_CHARS);
  const summary = str(vuln.summary);
  const aliases = (Array.isArray(vuln.aliases) ? vuln.aliases : []).map(str).filter((a): a is string => Boolean(a));
  const cve = aliases.find((a) => CVE_ID.test(a));
  const packages = (Array.isArray(vuln.affected) ? vuln.affected : []).map((a) => str(record(record(a).package).name)).filter((p): p is string => Boolean(p));
  return {
    key: id,
    title: clip(`${id} · ${summary ? plainText(summary, TITLE_CHARS) : (details.split(/(?<=\.)\s/)[0] ?? details)}`, 160),
    url: `https://osv.dev/vulnerability/${id}`,
    discussionUrl: null,
    summary: details,
    author: null,
    score: null,
    severity: severityOf(record(vuln.database_specific).severity),
    tags: [...(cve ? [cve] : []), ...[...new Set(packages)].slice(0, 3)].map((t) => clip(t, 60)),
    publishedAt: normalizeTime(str(vuln.published), now),
  };
}
