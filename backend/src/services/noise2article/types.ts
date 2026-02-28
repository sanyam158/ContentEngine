/**
 * =============================================================================
 * Noise2Article — Shared Types
 * =============================================================================
 */

// ─── Source Types ───────────────────────────────────────────────────────────

export type PostSource = 'reddit' | 'hn' | 'twitter' | 'rss';

export type RepurposedPlatform = 'linkedin' | 'instagram';

export type SubredditTier = 1 | 2 | 3;

export interface SubredditConfig {
  name: string;
  tier: SubredditTier;
  /** Minimum score threshold for this subreddit */
  minScore: number;
  /** Minimum comment count (only enforced for tier 3) */
  minComments: number;
}

// ─── Pipeline Configuration ─────────────────────────────────────────────────

// ─── Niche Context ──────────────────────────────────────────────────────────

/**
 * Niche-specific strings injected into all LLM prompts.
 * Adding a new niche only requires a new entry in NICHE_PRESETS — zero code changes.
 */
export interface NicheContext {
  /** Short identifier used in logs and API responses */
  id: string;
  /** Human-readable label (used in frontend dropdown) */
  displayName: string;
  /** Brand voice descriptor for synthesizer/writer prompts, e.g. "viral tech/AI media brand" */
  brandVoice: string;
  /** Platform descriptor for gatekeeper/enricher prompts, e.g. "tech/AI content platform" */
  platformDescriptor: string;
  /** Comma-separated concrete tool/term examples for gatekeeper specificity check */
  specificityExamples: string;
  /** Regex pattern string (compiled at call site) for filtering HN front-page posts */
  hnFrontPagePattern: string;
  /** One-liner describing what makes a great article in this niche — injected into writer */
  bangerDefinition: string;
}

export interface NichePreset {
  context: NicheContext;
  configOverrides: Pick<PipelineConfig, 'subreddits' | 'hnQueries' | 'rssFeeds'>;
}

export interface PipelineConfig {
  /** Subreddits to scrape */
  subreddits: SubredditConfig[];
  /** Twitter accounts to monitor */
  twitterAccounts: string[];
  /** HN search queries */
  hnQueries: string[];
  /** RSS feed URLs */
  rssFeeds: string[];
  /** Max hot posts per subreddit */
  redditPostsPerSub: number;
  /** Max HN results per query */
  hnMaxResults: number;
  /** Max tweets per Twitter account */
  tweetsPerAccount: number;
  /** Max RSS items per feed */
  rssItemsPerFeed: number;
  /** Number of top themes to enrich with Tavily */
  topThemesToEnrich: number;
  /** Gatekeeper batch size for LLM calls */
  gatekeeperBatchSize: number;
  /** Niche context for LLM prompt injection. Defaults to ai-tech if omitted. */
  nicheContext?: NicheContext;
  /** Additional platforms to generate repurposed content for alongside the main article */
  platforms?: RepurposedPlatform[];
}

/** Default pipeline configuration */
export const DEFAULT_CONFIG: PipelineConfig = {
  subreddits: [
    // Tier 1 — Core AI/builder communities
    { name: 'LocalLLaMA', tier: 1, minScore: 10, minComments: 0 },
    { name: 'ClaudeAI', tier: 1, minScore: 10, minComments: 0 },
    { name: 'OpenAI', tier: 1, minScore: 10, minComments: 0 },
    { name: 'SaaS', tier: 1, minScore: 10, minComments: 0 },
    { name: 'SideProject', tier: 1, minScore: 10, minComments: 0 },
    // Tier 2 — Technical niche
    { name: 'devops', tier: 2, minScore: 10, minComments: 0 },
    { name: 'dataengineering', tier: 2, minScore: 10, minComments: 0 },
    { name: 'selfhosted', tier: 2, minScore: 10, minComments: 0 },
    { name: 'commandline', tier: 2, minScore: 10, minComments: 0 },
    // Tier 3 — Growth (strict filter)
    { name: 'growthhacking', tier: 3, minScore: 20, minComments: 20 },
  ],
  twitterAccounts: [], // X/Twitter disabled — use Reddit, HN, RSS only
  hnQueries: [
    'AI OR workflow OR tool',
    'LLM OR agent OR automation',
  ],
  rssFeeds: [
    'https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml', // The Rundown AI
    'https://www.technologyreview.com/topic/artificial-intelligence/feed', // MIT Review
    'https://www.artificialintelligence-news.com/feed/', // AI News
    'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', // The Verge AI
    'https://www.livemint.com/rss/AI', // Mint AI
    'https://www.marktechpost.com/feed/', // MarkTechPost
    'https://techcrunch.com/category/artificial-intelligence/feed/', // TechCrunch AI
    'https://arstechnica.com/ai/feed/', // Ars Technica AI
  ],
  redditPostsPerSub: 5,
  hnMaxResults: 20,
  tweetsPerAccount: 1,
  rssItemsPerFeed: 5,
  // We only want a couple of really strong articles per run.
  topThemesToEnrich: 2,
  gatekeeperBatchSize: 10,
};

// ─── Niche Presets ──────────────────────────────────────────────────────────

export const NICHE_PRESETS: Record<string, NichePreset> = {
  'ai-tech': {
    context: {
      id: 'ai-tech',
      displayName: 'AI & Tech',
      brandVoice: 'viral tech/AI media brand',
      platformDescriptor: 'tech/AI content platform',
      specificityExamples: 'Claude, GPT-4o, Docker, FastAPI, LoRA, MCP, LangChain, Ollama',
      hnFrontPagePattern: '\\bai\\b|llm|gpt|claude|gemini|agent|workflow|startup|saas|open.?source|docker|kubernetes|api|automation',
      bangerDefinition: 'practical builder workflows with concrete tools, benchmark numbers, and open-source links',
    },
    configOverrides: {
      subreddits: [
        { name: 'LocalLLaMA', tier: 1, minScore: 10, minComments: 0 },
        { name: 'ClaudeAI', tier: 1, minScore: 10, minComments: 0 },
        { name: 'OpenAI', tier: 1, minScore: 10, minComments: 0 },
        { name: 'SaaS', tier: 1, minScore: 10, minComments: 0 },
        { name: 'SideProject', tier: 1, minScore: 10, minComments: 0 },
        { name: 'devops', tier: 2, minScore: 10, minComments: 0 },
        { name: 'dataengineering', tier: 2, minScore: 10, minComments: 0 },
        { name: 'selfhosted', tier: 2, minScore: 10, minComments: 0 },
        { name: 'commandline', tier: 2, minScore: 10, minComments: 0 },
        { name: 'growthhacking', tier: 3, minScore: 20, minComments: 20 },
      ],
      hnQueries: ['AI OR workflow OR tool', 'LLM OR agent OR automation'],
      rssFeeds: [
        'https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml',
        'https://www.technologyreview.com/topic/artificial-intelligence/feed',
        'https://www.artificialintelligence-news.com/feed/',
        'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
        'https://www.livemint.com/rss/AI',
        'https://www.marktechpost.com/feed/',
        'https://techcrunch.com/category/artificial-intelligence/feed/',
        'https://arstechnica.com/ai/feed/',
      ],
    },
  },

  'personal-finance': {
    context: {
      id: 'personal-finance',
      displayName: 'Personal Finance',
      brandVoice: 'personal finance media brand for millennials and Gen Z',
      platformDescriptor: 'personal finance content platform',
      specificityExamples: 'YNAB, Mint, Fidelity, Vanguard, index funds, Roth IRA, HSA, debt avalanche, FIRE',
      hnFrontPagePattern: 'budget|invest|debt|mortgage|\\bira\\b|401k|frugal|\\bfire\\b|dividend|savings|interest rate|inflation|credit score',
      bangerDefinition: 'actionable money moves with real dollar amounts, timelines, and before/after comparisons',
    },
    configOverrides: {
      subreddits: [
        { name: 'personalfinance', tier: 1, minScore: 100, minComments: 0 },
        { name: 'financialindependence', tier: 1, minScore: 50, minComments: 0 },
        { name: 'frugal', tier: 2, minScore: 30, minComments: 0 },
        { name: 'investing', tier: 2, minScore: 50, minComments: 0 },
        { name: 'Bogleheads', tier: 2, minScore: 30, minComments: 0 },
        { name: 'povertyfinance', tier: 2, minScore: 20, minComments: 0 },
        { name: 'dividends', tier: 3, minScore: 30, minComments: 20 },
        { name: 'Fire', tier: 3, minScore: 30, minComments: 20 },
      ],
      hnQueries: ['personal finance OR budgeting', 'investing OR retirement savings'],
      rssFeeds: [
        'https://www.getrichslowly.org/feed/',
        'https://affordanything.com/feed/',
        'https://www.wisebread.com/feed',
        'https://www.nerdwallet.com/blog/feed/',
        'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedType=rss',
        'https://feeds.npr.org/510289/podcast.xml',
        'https://www.mrmoneymustache.com/feed/',
        'https://fourpillarfreedom.com/feed/',
      ],
    },
  },

  'health-wellness': {
    context: {
      id: 'health-wellness',
      displayName: 'Health & Wellness',
      brandVoice: 'evidence-based health and wellness media brand',
      platformDescriptor: 'health and wellness content platform',
      specificityExamples: 'Whoop, Oura Ring, CGM, VO2 max, Zone 2, HRV, creatine, ozempic, RCT, sleep stages',
      hnFrontPagePattern: 'health|fitness|nutrition|sleep|longevity|exercise|diet|mental health|biohack|supplement|clinical trial|study',
      bangerDefinition: 'concrete health protocols with measurable outcomes, study citations, or personal biometric data',
    },
    configOverrides: {
      subreddits: [
        { name: 'longevity', tier: 1, minScore: 30, minComments: 0 },
        { name: 'nutrition', tier: 1, minScore: 30, minComments: 0 },
        { name: 'fitness', tier: 1, minScore: 50, minComments: 0 },
        { name: 'sleep', tier: 2, minScore: 20, minComments: 0 },
        { name: 'running', tier: 2, minScore: 30, minComments: 0 },
        { name: 'strength_training', tier: 2, minScore: 30, minComments: 0 },
        { name: 'biohacking', tier: 3, minScore: 30, minComments: 20 },
        { name: 'mentalhealth', tier: 3, minScore: 50, minComments: 20 },
      ],
      hnQueries: ['health research OR longevity study', 'fitness OR nutrition science'],
      rssFeeds: [
        'https://www.healthline.com/rss/news',
        'https://well.blogs.nytimes.com/feed/',
        'https://www.medicalnewstoday.com/rss/all-news.xml',
        'https://examine.com/feed.xml',
        'https://www.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC',
        'https://www.nih.gov/rss/news/nih-news.rss',
        'https://www.sciencedaily.com/rss/health_medicine.xml',
        'https://feeds.feedburner.com/PrecisionNutrition',
      ],
    },
  },

  'travel': {
    context: {
      id: 'travel',
      displayName: 'Travel',
      brandVoice: 'practical travel media brand for independent travelers',
      platformDescriptor: 'travel content platform',
      specificityExamples: 'Skyscanner, Airbnb, Google Flights, eSIM, Priority Pass, travel credit card, visa-on-arrival, hostel, carry-on only, travel insurance',
      hnFrontPagePattern: 'travel|\\bvisa\\b|passport|\\bflight\\b|\\bhotel\\b|airbnb|hostel|nomad|\\bexpat\\b|backpack|itinerary|\\bcurrency\\b|booking|trip report',
      bangerDefinition: 'specific trip reports with real costs, booking hacks, or visa/logistics details that readers can replicate',
    },
    configOverrides: {
      subreddits: [
        { name: 'travel', tier: 1, minScore: 200, minComments: 0 },
        { name: 'solotravel', tier: 1, minScore: 100, minComments: 0 },
        { name: 'digitalnomad', tier: 1, minScore: 50, minComments: 0 },
        { name: 'backpacking', tier: 2, minScore: 50, minComments: 0 },
        { name: 'travel_advice', tier: 2, minScore: 30, minComments: 0 },
        { name: 'shoestring', tier: 2, minScore: 20, minComments: 0 },
        { name: 'expats', tier: 3, minScore: 30, minComments: 10 },
        { name: 'travelhacks', tier: 3, minScore: 20, minComments: 10 },
      ],
      hnQueries: ['travel hacking OR visa OR flight deal', 'digital nomad OR remote work abroad'],
      rssFeeds: [
        'https://www.thepointsguy.com/feed/',
        'https://www.nomadicmatt.com/feed/',
        'https://www.lonelyplanet.com/news/feed',
        'https://expertvagabond.com/feed/',
        'https://www.wanderingearl.com/feed/',
        'https://www.thebrokebackpacker.com/feed/',
        'https://www.travelandleisure.com/rss/all.rss',
        'https://www.cntraveler.com/feed/rss',
      ],
    },
  },

  'geopolitics': {
    context: {
      id: 'geopolitics',
      displayName: 'Geopolitics',
      brandVoice: 'analytical geopolitics media brand for informed global citizens',
      platformDescriptor: 'geopolitics and international affairs content platform',
      specificityExamples: 'NATO, BRICS, UN Security Council, sanctions, Belt and Road, Taiwan Strait, ASEAN, G7, proxy war, sovereignty',
      hnFrontPagePattern: 'geopolit|\\bnato\\b|\\bchina\\b|\\brussia\\b|ukraine|taiwan|sanction|\\bwar\\b|diplomacy|nuclear|\\bimf\\b|alliance|sovereignty',
      bangerDefinition: 'clear-eyed analysis of power dynamics with historical context, named actors, and concrete stakes for readers',
    },
    configOverrides: {
      subreddits: [
        { name: 'geopolitics', tier: 1, minScore: 50, minComments: 0 },
        { name: 'worldnews', tier: 1, minScore: 200, minComments: 0 },
        { name: 'CredibleDefense', tier: 1, minScore: 30, minComments: 0 },
        { name: 'NeutralPolitics', tier: 2, minScore: 30, minComments: 0 },
        { name: 'GlobalPolitics', tier: 2, minScore: 20, minComments: 0 },
        { name: 'internationalpolitics', tier: 2, minScore: 20, minComments: 0 },
        { name: 'IRstudies', tier: 3, minScore: 20, minComments: 10 },
        { name: 'PoliticalScience', tier: 3, minScore: 20, minComments: 10 },
      ],
      hnQueries: ['geopolitics OR sanctions OR diplomacy', 'China OR Russia OR NATO OR Taiwan'],
      rssFeeds: [
        'https://www.foreignaffairs.com/rss.xml',
        'https://thediplomat.com/feed/',
        'https://warontherocks.com/feed/',
        'https://foreignpolicy.com/feed/',
        'https://www.rand.org/pubs/all.xml',
        'https://carnegieendowment.org/rss/',
        'https://www.aljazeera.com/xml/rss/all.xml',
        'https://thewire.in/rss',
      ],
    },
  },

  'hinduism': {
    context: {
      id: 'hinduism',
      displayName: 'Hinduism & Indian Culture',
      brandVoice: 'thoughtful Hindu philosophy and Indian civilization media brand',
      platformDescriptor: 'Hinduism and Indian culture content platform',
      specificityExamples: 'Vedanta, Bhagavad Gita, Upanishads, Dharma, Karma, Advaita, Bhakti, Shaivism, Vaishnavism, Sanatan Dharma, Ayurveda, Sanskrit',
      hnFrontPagePattern: '\\bhindu\\b|vedic|\\bdharma\\b|\\bkarma\\b|\\byoga\\b|sanatan|upanishad|bhagavad|vedanta|indian.?culture|\\bsanskrit\\b|\\bmandir\\b|\\bpuja\\b',
      bangerDefinition: 'deep dives into Hindu philosophy, scripture, or living traditions with accessible explanations and contemporary relevance',
    },
    configOverrides: {
      subreddits: [
        { name: 'hinduism', tier: 1, minScore: 30, minComments: 0 },
        { name: 'IndianHistory', tier: 1, minScore: 30, minComments: 0 },
        { name: 'yoga', tier: 1, minScore: 50, minComments: 0 },
        { name: 'Vedanta', tier: 2, minScore: 20, minComments: 0 },
        { name: 'IndianPhilosophy', tier: 2, minScore: 20, minComments: 0 },
        { name: 'india', tier: 2, minScore: 100, minComments: 0 },
        { name: 'Sanatana_Dharma', tier: 3, minScore: 20, minComments: 10 },
        { name: 'bhaktyoga', tier: 3, minScore: 10, minComments: 5 },
      ],
      hnQueries: ['Hinduism OR Vedanta OR Sanskrit', 'Indian philosophy OR Dharma OR Yoga'],
      rssFeeds: [
        'https://swarajyamag.com/feed',
        'https://pragyata.com/feed/',
        'https://www.dharmadispatch.in/feed',
        'https://www.indicatoday.com/feed/',
        'https://indiafacts.org/feed/',
        'https://www.hinduismtoday.com/rss',
        'https://www.thehindu.com/society/history-and-culture/feeder/default.rss',
        'https://www.speakingtree.in/rss',
      ],
    },
  },

  'stock-market': {
    context: {
      id: 'stock-market',
      displayName: 'Stock Market & Investing',
      brandVoice: 'no-nonsense stock market and investing media brand for retail investors',
      platformDescriptor: 'stock market and equity investing content platform',
      specificityExamples: 'S&P 500, P/E ratio, RSI, MACD, options, short squeeze, dividend yield, SPY, QQQ, earnings per share, technical analysis, fundamental analysis',
      hnFrontPagePattern: '\\bstock\\b|equity|market crash|\\bearnings\\b|\\bfed\\b|federal reserve|interest rate|\\bipo\\b|short sell|hedge fund|wall street|bull market|bear market',
      bangerDefinition: 'specific stock analysis or market moves with real ticker symbols, price levels, and a clear underlying thesis',
    },
    configOverrides: {
      subreddits: [
        { name: 'stocks', tier: 1, minScore: 100, minComments: 0 },
        { name: 'investing', tier: 1, minScore: 100, minComments: 0 },
        { name: 'wallstreetbets', tier: 1, minScore: 500, minComments: 0 },
        { name: 'SecurityAnalysis', tier: 2, minScore: 30, minComments: 0 },
        { name: 'dividends', tier: 2, minScore: 30, minComments: 0 },
        { name: 'options', tier: 2, minScore: 50, minComments: 0 },
        { name: 'StockMarket', tier: 3, minScore: 50, minComments: 20 },
        { name: 'ValueInvesting', tier: 3, minScore: 20, minComments: 10 },
      ],
      hnQueries: ['stock market OR earnings OR Federal Reserve', 'investing OR equity OR options trading'],
      rssFeeds: [
        'https://finance.yahoo.com/news/rssindex',
        'https://feeds.content.dowjones.io/public/rss/mw_topstories',
        'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedType=rss',
        'https://feeds.bloomberg.com/markets/news.rss',
        'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
        'https://seekingalpha.com/feed.xml',
        'https://www.fool.com/feeds/index.aspx',
        'https://www.ft.com/rss/home',
      ],
    },
  },
};

/** Returns a preset by ID, or undefined if not found */
export function getNichePreset(nicheId: string): NichePreset | undefined {
  return NICHE_PRESETS[nicheId];
}

/** Default niche context — mirrors ai-tech preset for full backward compatibility */
export const DEFAULT_NICHE_CONTEXT: NicheContext = NICHE_PRESETS['ai-tech'].context;

// ─── Raw Post (normalized from any source) ──────────────────────────────────

export interface RawPost {
  id: string;
  source: PostSource;
  title: string;
  /** Body preview, max ~500 chars */
  body: string;
  url?: string;
  author: string;
  /** Upvotes / points / likes */
  score: number;
  commentCount: number;
  createdAt: string;
  /** Reddit-only: which subreddit */
  subreddit?: string;
  /** RSS-only: feed name */
  feedName?: string;
  /** Has a GitHub/repo link */
  hasLink?: boolean;
  /** Mentions specific metrics/numbers */
  hasNumbers?: boolean;
}

// ─── Filtered Post (after gatekeeper) ───────────────────────────────────────

export interface FilteredPost extends RawPost {
  /** Banger score 0-10 assigned by LLM */
  bangerScore: number;
  /** LLM reasoning for the score */
  reasoning: string;
}

// ─── Theme (synthesized from filtered posts) ────────────────────────────────

export interface TavilyContextItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  posts: FilteredPost[];
  viralityScore: number;
  uniquenessScore: number;
  timelinessScore: number;
  overallRank: number;
  tavilyContext?: TavilyContextItem[];
}

// ─── Generated Article ──────────────────────────────────────────────────────

export interface GeneratedArticle {
  /** Saved ID */
  id: string;
  createdAt: string;
  /** The article title (first-person hook) */
  title: string;
  /** First 2-3 sentences that work as a standalone tweet */
  hook: string;
  /** X-ready full article body (plain text; preserves line breaks) */
  xText: string;
  /** Full article body in markdown (optional) */
  markdown: string;
  /** Topic tags */
  tags: string[];
  /** Estimated read time */
  estimatedReadTime: string;
  /** Pre-formatted thread tweets (280 char max each) */
  threadTweets: string[];
  /** Optional generated header image */
  image?: {
    base64?: string;
    mimeType: string;
    prompt: string;
  };
  /** Permanent hosted URL of the image (set after uploading to ImgBB; replaces base64 for Gist storage) */
  imageUrl?: string;
  /** Source attribution used to write the article */
  /** Source attribution - includes both raw post sources and Tavily research sources */
  sources: Array<{ source: PostSource | 'tavily'; title: string; url?: string }>;
  /** Which theme this article was generated from */
  themeId: string;
  themeName: string;
  /** Niche ID this article was generated for (e.g. "ai-tech", "geopolitics") */
  niche?: string;
  /** Platform-specific repurposed content generated from this article */
  repurposed?: {
    linkedin?: string;
    instagram?: { hook: string; caption: string };
  };
}

// ─── Pipeline Result ────────────────────────────────────────────────────────

export interface PipelineStageResult {
  stage: string;
  count: number;
  durationMs: number;
}

export interface PipelineResult {
  themes: Theme[];
  /** Generated articles (one per top theme) */
  articles: GeneratedArticle[];
  stages: PipelineStageResult[];
  totalDurationMs: number;
  rawPostCount: number;
  filteredPostCount: number;
  themeCount: number;
  articleCount: number;
  timestamp: string;
}
