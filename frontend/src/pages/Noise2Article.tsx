import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiService from '../services/api';
import { ArticleCard, type GeneratedArticle } from '../components/ArticleCard';

// ─── Types (matching backend) ───────────────────────────────────────────────

interface TavilyContextItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

interface FilteredPost {
  id: string;
  source: 'reddit' | 'hn' | 'twitter' | 'rss';
  title: string;
  body: string;
  url?: string;
  author: string;
  score: number;
  commentCount: number;
  createdAt: string;
  subreddit?: string;
  bangerScore: number;
  reasoning: string;
}

interface Theme {
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

interface PipelineStageResult {
  stage: string;
  count: number;
  durationMs: number;
}

interface PipelineResult {
  themes: Theme[];
  articles: GeneratedArticle[];
  stages: PipelineStageResult[];
  totalDurationMs: number;
  rawPostCount: number;
  filteredPostCount: number;
  themeCount: number;
  articleCount: number;
  timestamp: string;
}

// ─── Source Badge ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'reddit' | 'hn' | 'twitter' | 'rss' }) {
  const config = {
    reddit: { label: 'Reddit', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
    hn: { label: 'HN', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    twitter: { label: 'X', color: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
    rss: { label: 'RSS', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  };
  const { label, color } = config[source];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${color}`}>
      {label}
    </span>
  );
}

// ─── Post Card ──────────────────────────────────────────────────────────────

function PostCard({ post }: { post: FilteredPost }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-white/[0.04] last:border-0">
      <SourceBadge source={post.source} />
      <div className="flex-1 min-w-0">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-300 hover:text-white transition line-clamp-1"
        >
          {post.title}
        </a>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-600">
          <span>{post.author}</span>
          <span>{post.score} pts</span>
          <span>{post.commentCount} comments</span>
          {post.subreddit && <span>r/{post.subreddit}</span>}
        </div>
      </div>
      <span className="text-[10px] font-mono text-red-400/70 shrink-0">{post.bangerScore}/10</span>
    </div>
  );
}

// ─── Theme Card (compact) ───────────────────────────────────────────────────

function ThemeCard({ theme, rank }: { theme: Theme; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 shrink-0">
          #{rank}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-white leading-tight">{theme.name}</h4>
          <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{theme.description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-zinc-500">{theme.posts.length} posts</div>
          <div className="text-[10px] text-red-400/70">V:{theme.viralityScore} U:{theme.uniquenessScore} T:{theme.timelinessScore}</div>
        </div>
      </div>

      {/* Top 3 posts always visible */}
      <div className="pl-2 border-l border-red-500/20">
        {theme.posts.slice(0, 3).map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {theme.posts.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1"
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {expanded ? 'Hide' : `+${theme.posts.length - 3} more`}
        </button>
      )}

      {expanded && (
        <div className="pl-2 border-l border-white/[0.06]">
          {theme.posts.slice(3).map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* Tavily context */}
      {theme.tavilyContext && theme.tavilyContext.length > 0 && (
        <div className="text-[10px] text-zinc-600">
          {theme.tavilyContext.length} context sources
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Stage Indicator ───────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  scraping: 'Scraping Reddit, HN & Twitter',
  'pre-filter': 'Pre-filtering noise',
  gatekeeper: 'LLM Banger classification',
  synthesis: 'Synthesizing themes',
  enrichment: 'Enriching with Tavily context',
  writing: 'Writing articles',
};

function StageProgress({ stages, currentStage }: { stages: PipelineStageResult[]; currentStage: string }) {
  const allStageKeys = ['scraping', 'pre-filter', 'gatekeeper', 'synthesis', 'enrichment', 'writing'];
  const completedStages = new Set(stages.map(s => s.stage));

  return (
    <div className="space-y-2">
      {allStageKeys.map((key) => {
        const completed = completedStages.has(key);
        const active = key === currentStage;
        const stageData = stages.find(s => s.stage === key);

        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              {completed ? (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : active ? (
                <svg className="w-4 h-4 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
              )}
            </div>
            <span className={`flex-1 ${active ? 'text-white' : completed ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {STAGE_LABELS[key] || key}
            </span>
            {stageData && (
              <span className="text-zinc-600">
                {stageData.count} items &middot; {(stageData.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { value: 'linkedin',    label: 'LinkedIn Post' },
  { value: 'instagram',   label: 'Instagram Caption' },
  { value: 'shortScript', label: 'Short Form Script' },
];

const NICHE_OPTIONS = [
  { value: 'ai-tech',           label: 'AI & Tech' },
  { value: 'personal-finance',  label: 'Personal Finance' },
  { value: 'health-wellness',   label: 'Health & Wellness' },
{ value: 'travel',            label: 'Travel' },
  { value: 'geopolitics',       label: 'Geopolitics' },
  { value: 'hinduism',          label: 'Hinduism & Indian Culture' },
  { value: 'stock-market',      label: 'Stock Market & Investing' },
];

export function Noise2Article() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [currentStage, setCurrentStage] = useState('');
  const [activeTab, setActiveTab] = useState<'articles' | 'themes'>('articles');
  const [selectedNiche, setSelectedNiche] = useState('ai-tech');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const handleDiscover = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStage('scraping');
    setActiveTab('articles');

    const stageTimers = [
      { stage: 'scraping', delay: 3000 },
      { stage: 'pre-filter', delay: 6000 },
      { stage: 'gatekeeper', delay: 12000 },
      { stage: 'synthesis', delay: 25000 },
      { stage: 'enrichment', delay: 40000 },
      { stage: 'writing', delay: 90000 },
    ];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (const { stage, delay } of stageTimers) {
      timeouts.push(setTimeout(() => setCurrentStage(stage), delay));
    }

    try {
      const resp = await apiService.discoverIdeas({ niche: selectedNiche, platforms: selectedPlatforms });
      if (resp.success) {
        setResult(resp.data);
      } else {
        setError(resp.error || 'Pipeline failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run pipeline');
    } finally {
      timeouts.forEach(clearTimeout);
      setLoading(false);
      setCurrentStage('');
    }
  };

  const articles = result?.articles || [];
  const themes = result?.themes || [];

  return (
    <>
      {/* Error */}
      {error && (
        <div className="notification mb-4 bg-red-500/5 border border-red-500/10 text-red-400 p-3 rounded-xl text-sm flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400/50 hover:text-red-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main card */}
      <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up delay-1">
        {/* IDLE STATE */}
        {!loading && !result && (
          <div className="text-center space-y-6 py-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">Noise to Article</h2>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                Scrapes Reddit (hot), HN & RSS. Filters noise. Synthesizes themes.
                Writes a ready-to-post article with your voice.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <SourceBadge source="reddit" />
              <SourceBadge source="hn" />
              <SourceBadge source="rss" />
            </div>

            <div className="text-xs text-zinc-600 space-y-1">
              <p>10 subreddits (hot) &middot; HN front page &middot; RSS feeds</p>
              <p>LLM gatekeeper &middot; Theme synthesis &middot; Tavily enrichment &middot; Article generation</p>
            </div>

            <div className="flex items-center gap-3 justify-center">
              <select
                value={selectedNiche}
                onChange={(e) => setSelectedNiche(e.target.value)}
                disabled={loading}
                className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {NICHE_OPTIONS.map((n) => (
                  <option key={n.value} value={n.value} className="bg-gray-900">
                    {n.label}
                  </option>
                ))}
              </select>
              <button onClick={handleDiscover} disabled={loading} className="btn-primary px-8 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                Generate Article
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Also generate</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
                {PLATFORM_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(p.value)}
                      onChange={(e) => {
                        setSelectedPlatforms(prev =>
                          e.target.checked ? [...prev, p.value] : prev.filter(v => v !== p.value)
                        );
                      }}
                      disabled={loading}
                      className="w-3 h-3 rounded border border-white/20 bg-white/5 accent-red-500 disabled:opacity-50"
                    />
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

                        <p className="text-xs text-zinc-500">
              <Link to="/saved" className="text-zinc-400 hover:text-white transition underline">
                View saved articles →
              </Link>
            </p>
          
          </div>
        )}

        {/* LOADING STATE */}
        {loading && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-white">Generating Article...</h2>
              <p className="text-xs text-zinc-500">Scraping, filtering, synthesizing, and writing. ~2-3 minutes.</p>
            </div>
            <StageProgress stages={result?.stages || []} currentStage={currentStage} />
          </div>
        )}

        {/* RESULTS STATE (only when we have a pipeline result) */}
        {!loading && result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {articles.length > 0
                    ? `${articles.length} Article${articles.length > 1 ? 's' : ''} Generated`
                    : `${result.themeCount} Themes Discovered`}
                </h2>
                {result && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {result.rawPostCount} scraped &rarr; {result.filteredPostCount} filtered &rarr;
                    {result.themeCount} themes &rarr; {articles.length} articles
                    &middot; {(result.totalDurationMs / 1000).toFixed(0)}s
                  </p>
                )}
              </div>
              <button onClick={handleDiscover} className="btn-glass text-xs px-3 py-1.5">
                Re-run
              </button>
            </div>

            {/* Pipeline stages collapsed (only when we have a fresh result) */}
            {result && (
              <details className="text-xs">
                <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300 transition">
                  Pipeline stages ({result.stages.length})
                </summary>
                <div className="mt-2 pl-2 border-l border-white/[0.06]">
                  <StageProgress stages={result.stages} currentStage="" />
                </div>
              </details>
            )}

            {/* Tabs: Articles | Themes */}
            <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
              <button
                onClick={() => setActiveTab('articles')}
                className={`flex-1 text-xs py-2 rounded-md transition font-medium ${
                  activeTab === 'articles'
                    ? 'bg-red-600/20 text-red-400 border border-red-500/20'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Articles ({articles.length})
              </button>
              <button
                onClick={() => setActiveTab('themes')}
                className={`flex-1 text-xs py-2 rounded-md transition font-medium ${
                  activeTab === 'themes'
                    ? 'bg-white/[0.06] text-white border border-white/[0.08]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Source Themes ({themes.length})
              </button>
            </div>

            {/* Articles tab */}
            {activeTab === 'articles' && (
              <div className="space-y-6">
                {articles.length > 0 ? (
                  articles.map((article, i) => (
                    <ArticleCard
                      key={i}
                      article={article}
                      index={i}
                      articleId={article.id}
                      onRegenerateImage={async (id, options) => {
                        try {
                          const resp = await apiService.regenerateArticleImage(id, options);
                          if (resp.success && resp.data) {
                            setResult(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.articles];
                              updated[i] = resp.data;
                              return { ...prev, articles: updated };
                            });
                          }
                        } catch { /* ignore */ }
                      }}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-sm">
                    No articles generated. The pipeline found themes but couldn't write articles. Try re-running.
                  </div>
                )}
              </div>
            )}

            {/* Themes tab */}
            {activeTab === 'themes' && (
              <div className="space-y-3">
                {themes.length > 0 ? (
                  themes.map((theme, i) => (
                    <ThemeCard key={theme.id} theme={theme} rank={i + 1} />
                  ))
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-sm">
                    No themes found. Try running again later.
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-zinc-500 pt-2 border-t border-white/[0.04]">
              <Link to="/saved" className="text-zinc-400 hover:text-white transition underline">
                View saved articles →
              </Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
