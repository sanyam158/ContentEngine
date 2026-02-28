import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiService from '../services/api';
import { ArticleCard, type GeneratedArticle } from '../components/ArticleCard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StageResult {
  stage: string;
  durationMs: number;
  detail: string;
}

interface Idea2ContentResult {
  article: GeneratedArticle | null;
  research: { brief: string; sources: { title: string; url: string }[]; queries: string[] };
  stages: StageResult[];
  totalDurationMs: number;
  durationMs: number;
}

// ─── Stage Indicator ─────────────────────────────────────────────────────────

const I2C_STAGE_LABELS: Record<string, string> = {
  research: 'Generating search queries & searching (Tavily)',
  writing:  'Writing article & repurposed content',
};

function I2CStageProgress({
  stages,
  currentStage,
}: {
  stages: StageResult[];
  currentStage: string;
}) {
  const allKeys = ['research', 'writing'];
  const completedKeys = new Set(stages.map((s) => s.stage));

  return (
    <div className="space-y-2">
      {allKeys.map((key) => {
        const completed = completedKeys.has(key);
        const active = key === currentStage;
        const stageData = stages.find((s) => s.stage === key);

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
              {I2C_STAGE_LABELS[key] || key}
            </span>
            {stageData && stageData.durationMs > 0 && (
              <span className="text-zinc-600">{(stageData.durationMs / 1000).toFixed(1)}s</span>
            )}
            {stageData?.detail && completed && (
              <span className="text-zinc-600 max-w-[140px] truncate">{stageData.detail}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Options ─────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { value: 'linkedin',  label: 'LinkedIn Post' },
  { value: 'instagram', label: 'Instagram Caption' },
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export function Idea2Content() {
  const [prompt, setPrompt]                       = useState('');
  const [selectedNiche, setSelectedNiche]         = useState('ai-tech');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading]                     = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [result, setResult]                       = useState<Idea2ContentResult | null>(null);
  const [currentStage, setCurrentStage]           = useState('');

  const canGenerate = prompt.trim().length > 0 && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStage('research');

    // Advance loading stage indicators on a timer
    const stageTimers = [
      { stage: 'writing', delay: 25000 },
    ];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (const { stage, delay } of stageTimers) {
      timeouts.push(setTimeout(() => setCurrentStage(stage), delay));
    }

    try {
      const resp = await apiService.generateFromIdea({
        prompt: prompt.trim(),
        niche: selectedNiche,
        platforms: selectedPlatforms,
      });

      if (resp.success) {
        setResult(resp.data);
      } else {
        setError(resp.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      timeouts.forEach(clearTimeout);
      setLoading(false);
      setCurrentStage('');
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setPrompt('');
  };

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
          <div className="space-y-6 py-2">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Idea to Content</h2>
              <p className="text-sm text-zinc-500">
                Type any topic or idea. The engine researches it, then writes a
                full article with thread tweets and optional social posts.
              </p>
            </div>

            {/* Prompt textarea */}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              rows={4}
              placeholder="e.g. How AI agents are replacing manual DevOps workflows&#10;e.g. The real cost of ultra-processed food on longevity&#10;e.g. Why India's stock market is decoupling from the US"
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder:text-zinc-600 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
            />
            <p className="text-[10px] text-zinc-600 -mt-4">Ctrl/Cmd+Enter to generate</p>

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3">
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

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="btn-primary px-6 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate
              </button>
            </div>

            {/* Platform checkboxes */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Also generate</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {PLATFORM_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(p.value)}
                      onChange={(e) => {
                        setSelectedPlatforms((prev) =>
                          e.target.checked ? [...prev, p.value] : prev.filter((v) => v !== p.value)
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
              <h2 className="text-lg font-semibold text-white">Generating...</h2>
              <p className="text-xs text-zinc-500">Researching your topic and writing. ~1-2 minutes.</p>
            </div>
            <I2CStageProgress stages={result?.stages || []} currentStage={currentStage} />
          </div>
        )}

        {/* RESULT STATE */}
        {!loading && result && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Article Generated</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {result.research.sources?.length
                    ? `${result.research.sources.length} research sources`
                    : 'No external sources found'}
                  &nbsp;&middot;&nbsp;{(result.totalDurationMs / 1000).toFixed(0)}s
                </p>
              </div>
              <button onClick={handleReset} className="btn-glass text-xs px-3 py-1.5">
                New idea
              </button>
            </div>

            {/* Pipeline stages (collapsed by default) */}
            <details className="text-xs">
              <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300 transition">
                Pipeline stages ({result.stages.length})
              </summary>
              <div className="mt-2 pl-2 border-l border-white/[0.06]">
                <I2CStageProgress stages={result.stages} currentStage="" />
              </div>
            </details>

            {/* Article */}
            {result.article ? (
              <ArticleCard
                article={result.article}
                index={0}
                articleId={result.article.id}
                onRegenerateImage={async (id, options) => {
                  try {
                    const resp = await apiService.regenerateArticleImage(id, options);
                    if (resp.success && resp.data) {
                      setResult((prev) => prev ? { ...prev, article: resp.data } : prev);
                    }
                  } catch { /* ignore */ }
                }}
              />
            ) : (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Article generation failed. Try rephrasing your idea or try again.
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
