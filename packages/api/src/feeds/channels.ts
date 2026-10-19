import type { FeedGroup, FeedSource } from '#shared';

/** 每个频道用哪种解析方式。 */
export type FeedParser = 'hackernews' | 'github-trending' | 'feed' | 'ruanyf-weekly' | 'lobsters' | 'v2ex' | 'hf-papers' | 'hf-models' | 'nvd' | 'kev' | 'ghsa' | 'osv';

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

/** 周更、月更的博客与周刊：半天看一次。 */
const slow = { everyMinutes: 12 * HOUR, mayBeEmpty: true };
/** 一天几十条的资讯站。 */
const busy = { everyMinutes: 3 * HOUR };

function releases(repo: string, name: string, description: string, everyMinutes = 3 * HOUR): FeedChannel {
  return {
    id: `release-${repo.split('/')[1].replace(/\W+/g, '-').toLowerCase()}`,
    source: 'releases',
    group: 'github',
    name: `${name} Releases`,
    description,
    homepage: `https://github.com/${repo}/releases`,
    parser: 'feed',
    url: `https://github.com/${repo}/releases.atom`,
    everyMinutes,
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
 * 按 everyMinutes 算，平均每小时约 37 次抓取，低于每小时 48 个名额；最坏情况（4 个 OSV 频道）约 36 个子请求。
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
  releases('ggml-org/llama.cpp', 'llama.cpp', 'llama.cpp 的构建发布，几乎每天都有。', 6 * HOUR),
  releases('huggingface/transformers', 'Transformers', 'Hugging Face Transformers 的版本说明，新模型支持一般先出现在这里。', 6 * HOUR),
  releases('denoland/deno', 'Deno', 'Deno 运行时的版本发布。', 6 * HOUR),
  releases('vitejs/vite', 'Vite', 'Vite 及其插件的版本发布。', 6 * HOUR),
  releases('kubernetes/kubernetes', 'Kubernetes', 'Kubernetes 的正式版与补丁版本。', 6 * HOUR),
  releases('rust-lang/rust', 'Rust', 'Rust 编译器与工具链的版本发布。', 6 * HOUR),
  {
    ...feed('release-python', 'releases', 'github', 'Python Releases', 'https://www.python.org/downloads/feed.rss', 'https://www.python.org/downloads/', 'CPython 的正式版、预发布与安全修复版本。', { everyMinutes: 6 * HOUR, mayBeEmpty: true }),
    titlePrefix: 'Python',
  },
  feed('release-linux', 'releases', 'github', 'Linux 内核发布', 'https://www.kernel.org/feeds/kdist.xml', 'https://www.kernel.org/', 'kernel.org 的主线、稳定版与长期支持版内核发布。', { everyMinutes: 6 * HOUR, mayBeEmpty: true }),
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
  feed('arxiv-cr', 'papers', 'papers', 'arXiv cs.CR', 'https://rss.arxiv.org/rss/cs.CR', 'https://arxiv.org/list/cs.CR/new', 'arXiv 密码学与安全分类的每日新论文。', { everyMinutes: 6 * HOUR, mayBeEmpty: true, maxBytes: 200_000 }),
  feed('arxiv-se', 'papers', 'papers', 'arXiv cs.SE', 'https://rss.arxiv.org/rss/cs.SE', 'https://arxiv.org/list/cs.SE/new', 'arXiv 软件工程分类的每日新论文。', { everyMinutes: 6 * HOUR, mayBeEmpty: true, maxBytes: 200_000 }),
  {
    id: 'hf-models',
    source: 'papers',
    group: 'papers',
    name: 'Hugging Face 热门模型',
    description: 'Hugging Face 上热度最高的模型，附任务类型、框架与点赞数；只收最近 30 天创建的。',
    homepage: 'https://huggingface.co/models?sort=trending',
    parser: 'hf-models',
    url: 'https://huggingface.co/api/models?sort=trendingScore&limit=30',
    everyMinutes: 2 * HOUR,
    mayBeEmpty: true,
  },
  // —— AI 实验室与研究博客 ——
  feed('ai-deepmind', 'ai', 'ai', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'https://deepmind.google/discover/blog/', 'Gemini、AlphaFold 等模型与研究的官方发布。', slow),
  feed('ai-google-research', 'ai', 'ai', 'Google Research', 'https://research.google/blog/rss/', 'https://research.google/blog/', 'Google 研究院的论文解读，覆盖机器学习、系统与量子计算。', slow),
  feed('ai-msr', 'ai', 'ai', 'Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/', 'https://www.microsoft.com/en-us/research/blog/', '微软研究院的研究进展与论文介绍。', slow),
  feed('ai-pytorch', 'ai', 'ai', 'PyTorch Blog', 'https://pytorch.org/feed/', 'https://pytorch.org/blog/', 'PyTorch 版本、编译器与分布式训练的技术文章。', slow),
  feed('ai-together', 'ai', 'ai', 'Together AI', 'https://www.together.ai/blog/rss.xml', 'https://www.together.ai/blog', '开源模型推理、训练与内核优化（FlashAttention 团队）。', slow),
  feed('ai-importai', 'ai', 'ai', 'Import AI', 'https://importai.substack.com/feed', 'https://jack-clark.net/', 'Jack Clark 的每周 AI 研究与政策简报。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('ai-latentspace', 'ai', 'ai', 'Latent Space', 'https://www.latent.space/feed', 'https://www.latent.space/', '面向 AI 工程师的访谈与行业综述。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('ai-interconnects', 'ai', 'ai', 'Interconnects', 'https://www.interconnects.ai/feed', 'https://www.interconnects.ai/', 'Nathan Lambert 谈后训练、RLHF 与开源模型。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('ai-raschka', 'ai', 'ai', 'Ahead of AI · Sebastian Raschka', 'https://magazine.sebastianraschka.com/feed', 'https://magazine.sebastianraschka.com/', 'LLM 架构与训练方法的长文解读。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('ai-lilianweng', 'ai', 'ai', "Lil'Log · Lilian Weng", 'https://lilianweng.github.io/index.xml', 'https://lilianweng.github.io/', '机器学习主题的系统性综述长文，更新很少。', archive),
  feed('ai-karpathy', 'ai', 'ai', 'Andrej Karpathy', 'https://karpathy.bearblog.dev/feed/', 'https://karpathy.bearblog.dev/', 'Karpathy 的个人博客，谈 LLM 与软件的变化。', archive),
  // —— 技术博客 ——
  feed('rss-cloudflare', 'rss', 'blogs', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'https://blog.cloudflare.com/', '网络、边缘计算与 Workers 平台的工程文章和事故复盘。'),
  feed('rss-github-blog', 'rss', 'blogs', 'GitHub Blog', 'https://github.blog/feed/', 'https://github.blog/', 'GitHub 产品更新、工程实践与开源动态。'),
  feed('rss-openai', 'rss', 'blogs', 'OpenAI News', 'https://openai.com/news/rss.xml', 'https://openai.com/news/', 'OpenAI 的模型发布、研究与产品新闻。'),
  feed('rss-huggingface', 'rss', 'blogs', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog', '开源模型、训练与推理工具的技术文章。'),
  feed('rss-simonwillison', 'rss', 'blogs', 'Simon Willison', 'https://simonwillison.net/atom/everything/', 'https://simonwillison.net/', 'LLM 工具、提示注入与个人软件实践的高频笔记。'),
  feed('rss-lwn', 'rss', 'blogs', 'LWN.net', 'https://lwn.net/headlines/rss', 'https://lwn.net/', 'Linux 内核与开源社区的深度报道。'),
  feed('rss-thehackernews', 'rss', 'blogs', 'The Hacker News', 'https://feeds.feedburner.com/TheHackersNews', 'https://thehackernews.com/', '每日安全新闻：漏洞、攻击活动与数据泄露。'),
  feed('rss-krebs', 'rss', 'blogs', 'Krebs on Security', 'https://krebsonsecurity.com/feed/', 'https://krebsonsecurity.com/', '网络犯罪调查报道。'),
  // —— 公司工程博客与个人技术博客 ——
  feed('eng-netflix', 'engineering', 'engineering', 'Netflix TechBlog', 'https://netflixtechblog.com/feed', 'https://netflixtechblog.com/', '大规模流媒体的基础设施、数据与机器学习实践。', slow),
  feed('eng-meta', 'engineering', 'engineering', 'Engineering at Meta', 'https://engineering.fb.com/feed/', 'https://engineering.fb.com/', 'Meta 的基础设施、AI 系统与开源项目。', slow),
  feed('eng-stripe', 'engineering', 'engineering', 'Stripe Blog', 'https://stripe.com/blog/feed.rss', 'https://stripe.com/blog', '支付基础设施与工程文化。', slow),
  feed('eng-discord', 'engineering', 'engineering', 'Discord Blog', 'https://discord.com/blog/rss.xml', 'https://discord.com/blog', 'Discord 的工程与产品文章（混有社区公告）。', slow),
  feed('eng-dropbox', 'engineering', 'engineering', 'Dropbox Tech', 'https://dropbox.tech/feed', 'https://dropbox.tech/', '存储、同步引擎与基础设施的工程实践。', slow),
  feed('eng-flyio', 'engineering', 'engineering', 'Fly.io Blog', 'https://fly.io/blog/feed.xml', 'https://fly.io/blog/', '边缘部署、Firecracker 与分布式系统，写得很有趣。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('eng-tailscale', 'engineering', 'engineering', 'Tailscale Blog', 'https://tailscale.com/blog/index.xml', 'https://tailscale.com/blog', 'WireGuard、NAT 穿透与零信任网络。', slow),
  feed('eng-pragmatic', 'engineering', 'engineering', 'The Pragmatic Engineer', 'https://newsletter.pragmaticengineer.com/feed', 'https://newsletter.pragmaticengineer.com/', 'Gergely Orosz 谈大厂工程实践与行业变化（部分付费）。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('eng-fowler', 'engineering', 'engineering', 'Martin Fowler', 'https://martinfowler.com/feed.atom', 'https://martinfowler.com/', '软件架构、重构与 AI 辅助开发的文章。', slow),
  feed('eng-jvns', 'engineering', 'engineering', 'Julia Evans', 'https://jvns.ca/atom.xml', 'https://jvns.ca/', '把 Linux、网络、Git 讲明白的小文章与漫画。', slow),
  feed('eng-danluu', 'engineering', 'engineering', 'Dan Luu', 'https://danluu.com/atom.xml', 'https://danluu.com/', '数据驱动的长文：性能、可靠性与工程决策。', { ...archive, maxBytes: LARGE_FEED_BYTES }),
  // —— 语言、浏览器与平台官方博客 ——
  feed('lang-rust', 'rss', 'platforms', 'Rust Blog', 'https://blog.rust-lang.org/feed.xml', 'https://blog.rust-lang.org/', 'Rust 版本发布与项目治理的官方公告。', slow),
  feed('lang-go', 'rss', 'platforms', 'The Go Blog', 'https://go.dev/blog/feed.atom', 'https://go.dev/blog/', 'Go 团队的版本介绍与语言设计文章。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('lang-python', 'rss', 'platforms', 'Python Insider', 'https://pythoninsider.blogspot.com/feeds/posts/summary', 'https://pythoninsider.blogspot.com/', 'CPython 核心开发团队的发布与公告。', slow),
  feed('lang-nodejs', 'rss', 'platforms', 'Node.js Blog', 'https://nodejs.org/en/feed/blog.xml', 'https://nodejs.org/en/blog', 'Node.js 版本发布与安全公告。', slow),
  feed('lang-typescript', 'rss', 'platforms', 'TypeScript Blog', 'https://devblogs.microsoft.com/typescript/feed/', 'https://devblogs.microsoft.com/typescript/', 'TypeScript 新版本的特性说明。', slow),
  feed('plat-kubernetes', 'rss', 'platforms', 'Kubernetes Blog', 'https://kubernetes.io/feed.xml', 'https://kubernetes.io/blog/', 'Kubernetes 版本亮点、SIG 动态与功能深入介绍。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('plat-chromium', 'rss', 'platforms', 'Chromium Blog', 'https://blog.chromium.org/feeds/posts/summary', 'https://blog.chromium.org/', 'Chrome 新特性、Web 平台与安全改进。', slow),
  // 全站更新日志有一千多条、近 4MB，只读开头。
  feed('plat-vercel', 'rss', 'platforms', 'Vercel 更新', 'https://vercel.com/atom', 'https://vercel.com/changelog', 'Vercel 平台与 Next.js 生态的博客和更新日志。', { ...slow, maxBytes: 200_000 }),
  // —— 周刊、更新日志与新产品 ——
  feed('weekly-twir', 'rss', 'weekly', 'This Week in Rust', 'https://this-week-in-rust.org/rss.xml', 'https://this-week-in-rust.org/', 'Rust 社区每周精选文章、新库与 RFC 进展。', slow),
  feed('weekly-js', 'rss', 'weekly', 'JavaScript Weekly', 'https://javascriptweekly.com/rss/', 'https://javascriptweekly.com/', 'JavaScript 生态的每周精选。', slow),
  feed('weekly-go', 'rss', 'weekly', 'Golang Weekly', 'https://cprss.s3.amazonaws.com/golangweekly.com.xml', 'https://golangweekly.com/', 'Go 生态的每周精选。', slow),
  feed('weekly-gh-changelog', 'rss', 'weekly', 'GitHub Changelog', 'https://github.blog/changelog/feed/', 'https://github.blog/changelog/', 'GitHub 功能上线与变更记录。', busy),
  feed('weekly-aws', 'rss', 'weekly', "AWS What's New", 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', 'https://aws.amazon.com/new/', 'AWS 新服务与功能发布，每天十几条。', busy),
  feed('weekly-producthunt', 'rss', 'weekly', 'Product Hunt', 'https://www.producthunt.com/feed', 'https://www.producthunt.com/', '每天新上线的产品。', busy),
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
  feed('zh-meituan', 'zh', 'zh', '美团技术团队', 'https://tech.meituan.com/feed/', 'https://tech.meituan.com/', '美团的后端、算法与基础设施实践。', slow),
  feed('zh-solidot', 'zh', 'zh', 'Solidot', 'https://www.solidot.org/index.rss', 'https://www.solidot.org/', '奇客的资讯：科技、开源与科学短讯。', busy),
  feed('zh-oschina', 'zh', 'zh', '开源中国', 'https://www.oschina.net/news/rss', 'https://www.oschina.net/news', '开源项目发布与国内开源动态。', busy),
  feed('zh-ithome', 'zh', 'zh', 'IT之家', 'https://www.ithome.com/rss/', 'https://www.ithome.com/', '数码与科技快讯，更新很频繁。', busy),
  feed('zh-ifanr', 'zh', 'zh', '爱范儿', 'https://www.ifanr.com/feed', 'https://www.ifanr.com/', '科技产品与商业报道。', { ...busy, maxBytes: LARGE_FEED_BYTES }),
  feed('zh-geekpark', 'zh', 'zh', '极客公园', 'https://www.geekpark.net/rss', 'https://www.geekpark.net/', '科技公司、AI 产品与创业报道。', { ...busy, maxBytes: LARGE_FEED_BYTES }),
  feed('zh-appinn', 'zh', 'zh', '小众软件', 'https://www.appinn.com/feed/', 'https://www.appinn.com/', '实用软件、浏览器扩展与在线工具推荐。', slow),
  feed('zh-tw93', 'zh', 'zh', '潮流周刊 · Tw93', 'https://weekly.tw93.fun/rss.xml', 'https://weekly.tw93.fun/', '前端工程师 Tw93 的每周技术与工具分享。', slow),
  feed('zh-hellogithub', 'zh', 'zh', 'HelloGitHub 月刊', 'https://hellogithub.com/rss', 'https://hellogithub.com/', '每月推荐有趣、入门级的开源项目。', archive),
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
  // —— 安全资讯、通告与邮件列表 ——
  feed('secnews-bleeping', 'secnews', 'sec-news', 'BleepingComputer', 'https://www.bleepingcomputer.com/feed/', 'https://www.bleepingcomputer.com/', '勒索软件、数据泄露与漏洞利用的新闻报道。', busy),
  feed('secnews-schneier', 'secnews', 'sec-news', 'Schneier on Security', 'https://www.schneier.com/feed/atom/', 'https://www.schneier.com/', 'Bruce Schneier 对安全、隐私与政策的评论。', slow),
  feed('secnews-risky', 'secnews', 'sec-news', 'Risky Bulletin', 'https://risky.biz/feeds/risky-business-news/', 'https://risky.biz/', 'Risky Business 团队每天的安全新闻简报。', busy),
  feed('secnews-oss-security', 'secnews', 'sec-news', 'oss-security 邮件列表', 'https://seclists.org/rss/oss-sec.rss', 'https://www.openwall.com/lists/oss-security/', '开源软件漏洞的披露与讨论，很多 CVE 最早出现在这里。', busy),
  feed('secnews-fulldisclosure', 'secnews', 'sec-news', 'Full Disclosure', 'https://seclists.org/rss/fulldisclosure.rss', 'https://seclists.org/fulldisclosure/', '公开的漏洞披露邮件列表，常附 PoC。', busy),
  feed('secnews-exploitdb', 'secnews', 'sec-news', 'Exploit-DB', 'https://www.exploit-db.com/rss.xml', 'https://www.exploit-db.com/', '公开漏洞利用代码库的新收录。', busy),
  feed('secnews-certcc', 'secnews', 'sec-news', 'CERT/CC 漏洞说明', 'https://kb.cert.org/vuls/atomfeed/', 'https://kb.cert.org/vuls/', 'CERT/CC 协调披露的漏洞说明（VU#），常涉及多家厂商。', slow),
  feed('secnews-cisa', 'secnews', 'sec-news', 'CISA 安全通告', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', 'https://www.cisa.gov/news-events/cybersecurity-advisories', 'CISA 的工控系统通告、联合通告与威胁分析。', { ...slow, maxBytes: LARGE_FEED_BYTES }),
  feed('secnews-chrome', 'secnews', 'sec-news', 'Chrome Releases', 'https://chromereleases.googleblog.com/feeds/posts/summary', 'https://chromereleases.googleblog.com/', 'Chrome 各渠道版本更新，含修复的安全漏洞列表。', busy),
  feed('secnews-debian', 'secnews', 'sec-news', 'Debian 安全公告', 'https://www.debian.org/security/dsa', 'https://www.debian.org/security/', 'Debian 发行版的安全更新（DSA）。', busy),
  feed('secnews-ubuntu', 'secnews', 'sec-news', 'Ubuntu 安全公告', 'https://ubuntu.com/security/notices/rss.xml', 'https://ubuntu.com/security/notices', 'Ubuntu 的安全更新（USN）。', slow),
  feed('secnews-anquanke', 'secnews', 'sec-news', '安全客', 'https://api.anquanke.com/data/v1/rss', 'https://www.anquanke.com/', '360 旗下的中文安全资讯与技术文章。', busy),
  feed('secnews-xz', 'secnews', 'sec-news', '先知社区', 'https://xz.aliyun.com/feed', 'https://xz.aliyun.com/', '阿里云先知的中文漏洞分析与渗透技术文章。', busy),
  feed('secnews-4hou', 'secnews', 'sec-news', '嘶吼', 'https://www.4hou.com/feed', 'https://www.4hou.com/', '中文安全资讯与技术文章；近期更新较少。', archive),
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
export const FEED_CHANNELS_PER_RUN = 4;
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
