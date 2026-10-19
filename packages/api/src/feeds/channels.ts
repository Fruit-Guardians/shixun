import type { FeedGroup, FeedSource } from '#shared';

/** 每个频道用哪种解析方式。 */
export type FeedParser = 'hackernews' | 'github-trending' | 'feed' | 'ruanyf-weekly' | 'lobsters' | 'v2ex' | 'hf-papers' | 'nvd' | 'kev' | 'ghsa' | 'osv';

export interface FeedChannel {
  id: string;
  source: FeedSource;
  /** 信息源页面上的分组。 */
  group: FeedGroup;
  name: string;
  /** 一句话介绍，显示在信息源页面。 */
  description: string;
  /** 来源网站首页。 */
  homepage: string;
  parser: FeedParser;
  /** 抓取地址；NVD、KEV、GitHub Advisory 的查询参数在抓取时补上，OSV 是生态目录的地址。 */
  url: string;
  /** 两次抓取之间至少隔多少分钟。 */
  everyMinutes: number;
  /** 正常情况下也可能一条都没有（漏洞时间窗、周末的 arXiv 等），0 条不算失败。 */
  mayBeEmpty?: boolean;
  /** 单个响应最多读的字节数，默认见 services/feed.ts。带全文的大源只读开头一段就够了。 */
  maxBytes?: number;
  /** 标题前缀，如版本发布频道的项目名。 */
  titlePrefix?: string;
}

const HOUR = 60;
/** 带全文、动辄几 MB 的源：只读开头这么多。 */
const LARGE_FEED_BYTES = 400_000;

type FeedOptions = Pick<FeedChannel, 'everyMinutes' | 'mayBeEmpty' | 'maxBytes'>;

/** 一个 RSS / Atom 频道。默认每 3 小时抓一次。 */
function feed(id: string, source: FeedSource, group: FeedGroup, name: string, url: string, homepage: string, description: string, options: Partial<FeedOptions> = {}): FeedChannel {
  return { id, source, group, name, description, homepage, parser: 'feed', url, everyMinutes: 3 * HOUR, ...options };
}

/**
 * 安全研究博客：更新以周计，每 6 小时看一次就够了；已经很少更新、主要用来翻旧文的，每天一次。
 * 来源列表整理自用户提供的「安全研究博客清单」。
 */
function security(id: string, group: FeedGroup, name: string, url: string, homepage: string, description: string, options: Partial<FeedOptions> = {}): FeedChannel {
  return feed(`sec-${id}`, 'security', group, name, url, homepage, description, { everyMinutes: 6 * HOUR, mayBeEmpty: true, ...options });
}
const archive = { everyMinutes: 24 * HOUR };

function releases(repo: string, name: string, description: string): FeedChannel {
  return {
    id: `release-${repo.split('/')[1].replace(/\W+/g, '-').toLowerCase()}`,
    source: 'releases',
    group: 'github',
    name: `${name} Releases`,
    description,
    homepage: `https://github.com/${repo}/releases`,
    parser: 'feed',
    url: `https://github.com/${repo}/releases.atom`,
    everyMinutes: 3 * HOUR,
    mayBeEmpty: true,
    titlePrefix: name,
  };
}

function osv(ecosystem: string, name: string): FeedChannel {
  return {
    id: `osv-${ecosystem.replace(/\W+/g, '').toLowerCase()}`,
    source: 'osv',
    group: 'vulns',
    name: `OSV · ${name}`,
    description: `${name} 生态的开源漏洞记录（OSV 汇总 GitHub Advisory 与各生态自己的公告库），只取最近发布的；恶意包报告不收录。`,
    homepage: `https://osv.dev/list?ecosystem=${encodeURIComponent(ecosystem)}`,
    parser: 'osv',
    url: `https://osv-vulnerabilities.storage.googleapis.com/${ecosystem}/`,
    everyMinutes: HOUR,
    mayBeEmpty: true,
  };
}

/**
 * 全部频道，按信息源页面的展示顺序排列。
 * 定时任务每 5 分钟触发一次，每次只抓最该更新的 FEED_CHANNELS_PER_RUN 个（见 pickDueChannels），
 * 单次调用的子请求很少（Workers 免费版每次调用上限 50 个）。
 * 按 everyMinutes 算，平均每小时约 26 次抓取，低于每小时 36 个名额。
 */
export const FEED_CHANNELS: readonly FeedChannel[] = [
  // —— 社区 ——
  {
    id: 'hackernews',
    source: 'hackernews',
    group: 'community',
    name: 'Hacker News',
    description: 'Hacker News 首页正在讨论的链接，附得分与评论数。',
    homepage: 'https://news.ycombinator.com/',
    parser: 'hackernews',
    url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
    everyMinutes: 30,
  },
  {
    id: 'hackernews-show',
    source: 'hackernews',
    group: 'community',
    name: 'Show HN',
    description: '开发者在 Hacker News 上展示自己做的项目，取最新的、至少 10 分的。',
    homepage: 'https://news.ycombinator.com/show',
    parser: 'hackernews',
    // search 按相关度排序会返回历年最热的帖子；按时间取最新的，过滤掉没人看的。
    url: 'https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=points%3E%3D10&hitsPerPage=30',
    everyMinutes: HOUR,
  },
  {
    id: 'lobsters',
    source: 'lobsters',
    group: 'community',
    name: 'Lobsters',
    description: '邀请制的技术社区，按标签分类，讨论质量高、噪音少。',
    homepage: 'https://lobste.rs/',
    parser: 'lobsters',
    url: 'https://lobste.rs/hottest.json',
    everyMinutes: 30,
  },
  {
    id: 'v2ex',
    source: 'v2ex',
    group: 'community',
    name: 'V2EX 热门',
    description: '中文创意工作者社区当天的热门主题，不只技术，也有职场与生活。',
    homepage: 'https://www.v2ex.com/',
    parser: 'v2ex',
    url: 'https://www.v2ex.com/api/topics/hot.json',
    everyMinutes: HOUR,
  },
  // —— GitHub ——
  {
    id: 'github-trending',
    source: 'github',
    group: 'github',
    name: 'GitHub Trending',
    description: 'GitHub 当天新增星标最多的仓库；没有官方接口，按页面结构解析。',
    homepage: 'https://github.com/trending',
    parser: 'github-trending',
    url: 'https://github.com/trending',
    everyMinutes: HOUR,
  },
  releases('facebook/react', 'React', 'React 的正式版与预发布版本说明。'),
  releases('vercel/next.js', 'Next.js', 'Next.js 的版本发布，含 canary。'),
  releases('oven-sh/bun', 'Bun', 'Bun 运行时的版本发布。'),
  releases('vllm-project/vllm', 'vLLM', 'vLLM 推理引擎的版本发布。'),
  releases('ollama/ollama', 'Ollama', 'Ollama 本地模型运行器的版本发布。'),
  // —— 论文 ——
  {
    id: 'hf-papers',
    source: 'papers',
    group: 'papers',
    name: 'Hugging Face Daily Papers',
    description: '社区每天挑出的 AI 论文，按点赞数看热度，链接到论文页与 arXiv。',
    homepage: 'https://huggingface.co/papers',
    parser: 'hf-papers',
    url: 'https://huggingface.co/api/daily_papers?limit=30',
    everyMinutes: HOUR,
  },
  feed(
    'arxiv-ai',
    'papers',
    'papers',
    'arXiv cs.AI / CL / LG',
    'https://rss.arxiv.org/rss/cs.AI+cs.CL+cs.LG',
    'https://arxiv.org/list/cs.AI/new',
    'arXiv 人工智能、计算语言学、机器学习三个分类的每日新论文，只收前 30 篇。',
    // 每天几百篇、1.5MB 以上；只收前 30 篇，读前 200KB 就够了。周末没有新论文。
    { everyMinutes: 6 * HOUR, mayBeEmpty: true, maxBytes: 200_000 },
  ),
  // —— 技术博客 ——
  feed('rss-cloudflare', 'rss', 'blogs', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'https://blog.cloudflare.com/', '网络、边缘计算与 Workers 平台的工程文章和事故复盘。'),
  feed('rss-github-blog', 'rss', 'blogs', 'GitHub Blog', 'https://github.blog/feed/', 'https://github.blog/', 'GitHub 产品更新、工程实践与开源动态。'),
  feed('rss-openai', 'rss', 'blogs', 'OpenAI News', 'https://openai.com/news/rss.xml', 'https://openai.com/news/', 'OpenAI 的模型发布、研究与产品新闻。'),
  feed('rss-huggingface', 'rss', 'blogs', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog', '开源模型、训练与推理工具的技术文章。'),
  feed('rss-simonwillison', 'rss', 'blogs', 'Simon Willison', 'https://simonwillison.net/atom/everything/', 'https://simonwillison.net/', 'LLM 工具、提示注入与个人软件实践的高频笔记。'),
  feed('rss-lwn', 'rss', 'blogs', 'LWN.net', 'https://lwn.net/headlines/rss', 'https://lwn.net/', 'Linux 内核与开源社区的深度报道。'),
  feed('rss-thehackernews', 'rss', 'blogs', 'The Hacker News', 'https://feeds.feedburner.com/TheHackersNews', 'https://thehackernews.com/', '每日安全新闻：漏洞、攻击活动与数据泄露。'),
  feed('rss-krebs', 'rss', 'blogs', 'Krebs on Security', 'https://krebsonsecurity.com/feed/', 'https://krebsonsecurity.com/', '网络犯罪调查报道。'),
  // —— 中文 ——
  // 阮一峰博客本站对抓取返回质询页，用 feedburner 上的同步源。
  feed('zh-ruanyf', 'zh', 'zh', '阮一峰的网络日志', 'https://feeds.feedburner.com/ruanyifeng', 'https://www.ruanyifeng.com/blog/', '科技爱好者周刊与技术随笔。'),
  {
    id: 'zh-ruanyf-weekly',
    source: 'zh',
    group: 'zh',
    name: '科技爱好者周刊',
    description: '每周五发布的科技周刊；从仓库的发布提交里识别新的一期。',
    homepage: 'https://github.com/ruanyf/weekly',
    parser: 'ruanyf-weekly',
    url: 'https://github.com/ruanyf/weekly/commits/master.atom',
    everyMinutes: 6 * HOUR,
    mayBeEmpty: true,
  },
  feed('zh-infoq', 'zh', 'zh', 'InfoQ 中文', 'https://www.infoq.cn/feed', 'https://www.infoq.cn/', '架构、AI 工程与行业动态的中文报道。'),
  feed('zh-sspai', 'zh', 'zh', '少数派', 'https://sspai.com/feed', 'https://sspai.com/', '数字产品、效率工具与生活方式。'),
  // —— 漏洞情报 ——
  {
    id: 'kev',
    source: 'kev',
    group: 'vulns',
    name: 'CISA KEV 在野利用',
    description: 'CISA 确认已被在野利用的漏洞目录，最值得优先处理；按列入目录的日期排序，附处置期限。',
    homepage: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    parser: 'kev',
    url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    everyMinutes: 2 * HOUR,
    mayBeEmpty: true,
  },
  {
    id: 'nvd',
    source: 'nvd',
    group: 'vulns',
    name: 'NVD 高危漏洞',
    description: 'NVD 最近 48 小时发布、CVSS 为高危或严重的 CVE。',
    homepage: 'https://nvd.nist.gov/vuln/search',
    parser: 'nvd',
    url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    everyMinutes: HOUR,
    mayBeEmpty: true,
  },
  {
    id: 'ghsa',
    source: 'ghsa',
    group: 'vulns',
    name: 'GitHub Advisory',
    description: 'GitHub 审核过的开源依赖安全公告，标出受影响的包。',
    homepage: 'https://github.com/advisories',
    parser: 'ghsa',
    url: 'https://api.github.com/advisories',
    everyMinutes: HOUR,
  },
  osv('PyPI', 'PyPI'),
  osv('npm', 'npm'),
  osv('Go', 'Go'),
  osv('crates.io', 'Rust (crates.io)'),
  // —— 安全研究：Web 安全、代码审计、漏洞挖掘 ——
  security('portswigger', 'sec-web', 'PortSwigger Research', 'https://portswigger.net/research/rss', 'https://portswigger.net/research', '请求走私、XSS、缓存投毒、认证机制等新的 Web 攻击面，适合发现新思路。'),
  security('doyensec', 'sec-web', 'Doyensec', 'https://blog.doyensec.com/atom.xml', 'https://blog.doyensec.com/', 'Web、Electron 与业务逻辑审计，也有系统安全研究，贴近审计工作。', { maxBytes: LARGE_FEED_BYTES }),
  security('watchtowr', 'sec-web', 'watchTowr Labs', 'https://labs.watchtowr.com/rss/', 'https://labs.watchtowr.com/', '企业软件、VPN、网关的漏洞分析、补丁对比与攻击链复盘。', { maxBytes: LARGE_FEED_BYTES }),
  security('orange', 'sec-web', 'Orange Tsai', 'https://blog.orange.tw/atom.xml', 'https://blog.orange.tw/', 'Web 攻击链、协议与解析差异、PHP、CTF；中英文，值得翻旧文。', archive),
  security('phith0n', 'sec-web', '离别歌 · phith0n', 'https://www.leavesongs.com/feed/', 'https://www.leavesongs.com/', 'Web 安全、代码审计、CTF 与开发实践，适合中文精读。'),
  security('seebug', 'sec-web', 'Seebug Paper', 'https://paper.seebug.org/rss/', 'https://paper.seebug.org/', '漏洞分析、安全研究与译文，覆盖面广的中文研究文章平台。'),
  // —— 二进制、浏览器、内核、逆向与 Fuzzing ——
  // 全文源 5MB 以上，每篇几十 KB，读开头一段就有十来篇。
  security('project-zero', 'sec-binary', 'Google Project Zero', 'https://projectzero.google/feed.xml', 'https://projectzero.google/', '浏览器、操作系统、移动端的漏洞利用链与缓解机制。', { maxBytes: LARGE_FEED_BYTES }),
  security('quarkslab', 'sec-binary', 'Quarkslab', 'https://blog.quarkslab.com/feeds/all.rss.xml', 'https://blog.quarkslab.com/', '逆向工程、二进制分析、Fuzzing、固件与密码学。', { maxBytes: LARGE_FEED_BYTES }),
  security('synacktiv', 'sec-binary', 'Synacktiv', 'https://www.synacktiv.com/en/feed/lastblog.xml', 'https://www.synacktiv.com/en/publications', '二进制利用、Pwn2Own、嵌入式与逆向，也覆盖 AD 与 Web。源里没有发布时间，按首次抓到的时间排序。'),
  // ZDI 单篇带全文，第一篇就有 400KB 左右，按默认上限读。
  security('zdi', 'sec-binary', 'Zero Day Initiative', 'https://www.zerodayinitiative.com/blog?format=rss', 'https://www.zerodayinitiative.com/blog', '漏洞根因、利用细节、Pwn2Own 与补丁分析（博客源，不是公告源）。'),
  security('exodus', 'sec-binary', 'Exodus Intelligence', 'https://blog.exodusintel.com/feed/', 'https://blog.exodusintel.com/', '浏览器引擎、Windows/Linux 内核、虚拟化逃逸与内存破坏分析。', { maxBytes: LARGE_FEED_BYTES }),
  security('ret2', 'sec-binary', 'RET2 Systems', 'https://blog.ret2.io/feed.xml', 'https://blog.ret2.io/', '浏览器、虚拟化与设备漏洞利用，以及逆向分析工具；更新很少。', { ...archive, maxBytes: LARGE_FEED_BYTES }),
  security('firefox', 'sec-binary', 'Firefox Attack & Defense', 'https://attackanddefense.dev/feed.xml', 'https://attackanddefense.dev/', '浏览器 Fuzzing、IPC、沙箱、静态分析与 Firefox 安全工程。'),
  // —— Windows、Active Directory、身份安全与红队 ——
  security('specterops', 'sec-windows', 'SpecterOps', 'https://specterops.io/feed/', 'https://specterops.io/blog/', 'AD、身份攻击路径、BloodHound、检测工程与云身份安全。', { maxBytes: LARGE_FEED_BYTES }),
  security('itm4n', 'sec-windows', 'itm4n', 'https://itm4n.github.io/feed.xml', 'https://itm4n.github.io/', 'Windows 本地提权、服务、权限边界与补丁分析。'),
  // —— 云安全、容器、Kubernetes ——
  security('datadog', 'sec-cloud', 'Datadog Security Labs', 'https://securitylabs.datadoghq.com/rss/feed.xml', 'https://securitylabs.datadoghq.com/', 'AWS、Kubernetes、云身份、真实攻击与检测研究，技术文章集中。'),
  security('wiz', 'sec-cloud', 'Wiz', 'https://www.wiz.io/feed/rss.xml', 'https://www.wiz.io/blog', '云平台漏洞、IAM、跨服务攻击链；混有产品文章，优先看 Research。', { maxBytes: 200_000 }),
  security('sysdig', 'sec-cloud', 'Sysdig', 'https://sysdig.com/feed/', 'https://sysdig.com/blog/', '容器运行时、Kubernetes、Falco 与云端攻击检测；混有产品内容。'),
  // —— 恶意软件、威胁情报、应急响应与取证 ——
  security('dfir-report', 'sec-threat', 'The DFIR Report', 'https://thedfirreport.com/feed/', 'https://thedfirreport.com/', '真实入侵的完整复盘：时间线、横向移动、日志与检测。'),
  security('unit42', 'sec-threat', 'Unit 42', 'https://unit42.paloaltonetworks.com/feed/', 'https://unit42.paloaltonetworks.com/', 'APT、恶意软件、勒索与云威胁研究。'),
  security('talos', 'sec-threat', 'Cisco Talos', 'https://blog.talosintelligence.com/rss/', 'https://blog.talosintelligence.com/', '威胁活动、恶意软件、漏洞研究与检测情报。', { maxBytes: LARGE_FEED_BYTES }),
  security('oalabs', 'sec-threat', 'OALABS Research', 'https://research.openanalysis.net/feed.xml', 'https://research.openanalysis.net/', '恶意代码逆向、混淆、解密与样本分析的实操笔记。'),
  security('qianxin-xlab', 'sec-threat', '奇安信 X 实验室', 'https://blog.xlab.qianxin.com/rss/', 'https://blog.xlab.qianxin.com/', '僵尸网络、IoT 恶意软件、攻击基础设施与威胁追踪；中英文。', { maxBytes: LARGE_FEED_BYTES }),
  security('sans-isc', 'sec-threat', 'SANS Internet Storm Center', 'https://isc.sans.edu/rssfeed_full.xml', 'https://isc.sans.edu/', '每日样本分析、日志与流量异常、事件线索。'),
  // —— 移动安全、IoT、硬件与嵌入式 ——
  security('keenlab', 'sec-mobile', '腾讯科恩实验室', 'https://keenlab.tencent.com/zh/atom.xml', 'https://keenlab.tencent.com/', '浏览器、移动端、车联网与设备漏洞利用研究。'),
  security('xuanwu', 'sec-mobile', '腾讯玄武实验室', 'https://xlab.tencent.com/cn/atom.xml', 'https://xlab.tencent.com/', '系统与应用漏洞、移动安全，以及 AI 安全研究。'),
  security('nowsecure', 'sec-mobile', 'NowSecure', 'https://www.nowsecure.com/feed/', 'https://www.nowsecure.com/blog/', 'Android/iOS 应用测试、移动隐私与 SDK 供应链，偏工程实践。'),
  // 原 sector7.computest.nl，现在跳转到 DEFION；直接用新地址（Workers 里跟随这个跳转会失败）。
  security('sector7', 'sec-mobile', 'DEFION Research（原 Sector 7）', 'https://defion.security/feeds/en/research.xml', 'https://defion.security/', '设备、汽车充电设施、操作系统与漏洞利用；更新很少。', archive),
  // —— 开源安全、代码审计与软件供应链 ——
  security('trailofbits', 'sec-supply', 'Trail of Bits', 'https://blog.trailofbits.com/feed/', 'https://blog.trailofbits.com/', '代码审计、Fuzzing、静态分析、密码学与供应链安全。', { maxBytes: LARGE_FEED_BYTES }),
  security('github-security-lab', 'sec-supply', 'GitHub Security Lab', 'https://github.blog/tag/github-security-lab/feed/', 'https://securitylab.github.com/', '开源项目漏洞、CodeQL、变体分析与自动化审计。'),
  security('gitguardian', 'sec-supply', 'GitGuardian', 'https://blog.gitguardian.com/rss/', 'https://blog.gitguardian.com/', '密钥泄露、非人类身份与开发流程风险；混有产品内容。', { maxBytes: LARGE_FEED_BYTES }),
  // —— 密码学、协议与智能合约安全 ——
  security('matthew-green', 'sec-crypto', 'Matthew Green', 'https://blog.cryptographyengineering.com/feed/', 'https://blog.cryptographyengineering.com/', '密码工程、端到端加密与隐私协议，解释性强。'),
  security('cryptologie', 'sec-crypto', 'Cryptologie · David Wong', 'https://www.cryptologie.net/feed.xml', 'https://www.cryptologie.net/', '密码协议、零知识证明、实现细节与密码审计。'),
  security('openzeppelin', 'sec-crypto', 'OpenZeppelin', 'https://blog.openzeppelin.com/rss.xml', 'https://blog.openzeppelin.com/', '智能合约审计报告与协议安全；也含公司动态。'),
  // —— AI / LLM / Agent 安全 ——
  security('embrace-the-red', 'sec-ai', 'Embrace The Red', 'https://embracethered.com/blog/index.xml', 'https://embracethered.com/blog/', '提示注入、Agent 权限边界、工具调用与真实产品的数据泄露漏洞。'),
  // —— 值得精读的旧文 ——
  // Blogspot 的 summary 源，全文源太大。
  security('tyranids-lair', 'sec-archive', "James Forshaw · Tyranid's Lair", 'https://www.tiraniddo.dev/feeds/posts/summary', 'https://www.tiraniddo.dev/', 'Windows 权限模型、COM、认证与系统机制；按资料库使用。', archive),
  security('limitedresults', 'sec-archive', 'LimitedResults', 'https://limitedresults.com/api/rss', 'https://limitedresults.com/', '硬件故障注入、Glitch、芯片读保护与嵌入式安全；按资料库使用。', archive),
];

/** 与 wrangler.cloudflare.jsonc 里的 cron（每 5 分钟）一致。 */
export const FEED_CRON_INTERVAL_MS = 5 * 60 * 1000;
/** 每次定时触发最多抓几个频道。 */
export const FEED_CHANNELS_PER_RUN = 3;
/** OSV 频道每次最多取几条详情。 */
export const OSV_DETAILS_PER_RUN = 8;

/** 一个频道大约用几个子请求：OSV 是目录加若干条详情，NVD 按两档严重程度各查一次。 */
export function channelCost(channel: FeedChannel): number {
  if (channel.parser === 'osv') return 1 + OSV_DETAILS_PER_RUN;
  return channel.parser === 'nvd' ? 2 : 1;
}

/**
 * 按过期程度排序：没抓过的最先（按列表顺序），其余按「距上次抓取 / everyMinutes」从大到小。
 * 定时触发会有抖动，差不到半个触发间隔也算到期。
 */
export function rankChannels(lastRuns: ReadonlyMap<string, string>, now: number, channels: readonly FeedChannel[] = FEED_CHANNELS): { channel: FeedChannel; due: boolean }[] {
  return channels
    .map((channel, order) => {
      const last = lastRuns.get(channel.id);
      const elapsed = last === undefined ? Infinity : now - Date.parse(last);
      const period = channel.everyMinutes * 60_000;
      return { channel, order, due: elapsed + FEED_CRON_INTERVAL_MS / 2 >= period, overdue: elapsed / period };
    })
    .sort((a, b) => b.overdue - a.overdue || a.order - b.order)
    .map(({ channel, due }) => ({ channel, due }));
}

/** 这次定时触发要抓的频道：到期的里面最过期的几个。 */
export function pickDueChannels(lastRuns: ReadonlyMap<string, string>, now: number, max = FEED_CHANNELS_PER_RUN, channels: readonly FeedChannel[] = FEED_CHANNELS): FeedChannel[] {
  return rankChannels(lastRuns, now, channels)
    .filter((c) => c.due)
    .slice(0, max)
    .map((c) => c.channel);
}

export function findChannel(id: string): FeedChannel | undefined {
  return FEED_CHANNELS.find((channel) => channel.id === id);
}
