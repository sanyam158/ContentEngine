import { useEffect, useState } from 'react';
import apiService from '../services/api';
import { ArticleCard, type GeneratedArticle } from '../components/ArticleCard';

interface SavedArticleMeta {
  id: string;
  createdAt: string;
  title: string;
  themeId: string;
  themeName: string;
  estimatedReadTime: string;
  tags: string[];
}

export function SavedArticles() {
  const [savedList, setSavedList] = useState<SavedArticleMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadedArticle, setLoadedArticle] = useState<GeneratedArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);

  const refreshList = async () => {
    setLoading(true);
    try {
      const resp = await apiService.listN2AArticles();
      if (resp.success) setSavedList(resp.data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateImage = async (id: string, options?: { prompt?: string; referenceImageBase64?: string; referenceImageMimeType?: string }) => {
    try {
      const resp = await apiService.regenerateArticleImage(id, options);
      if (resp.success && resp.data) {
        setLoadedArticle(resp.data);
      }
    } catch {
      // ignore
    }
  };

  const handleEditImage = async (id: string, editPrompt: string, conversationHistory: any[]) => {
    try {
      const resp = await apiService.editArticleImage(id, editPrompt, conversationHistory);
      if (resp.success && resp.data) {
        setLoadedArticle(resp.data);
      }
      return { conversationHistory: resp.conversationHistory };
    } catch {
      return {};
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this article?')) return;
    try {
      const resp = await apiService.deleteN2AArticle(id);
      if (resp.success) {
        setSavedList(prev => prev.filter(a => a.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setLoadedArticle(null);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadAndExpand = async (id: string) => {
    const isAlreadyExpanded = expandedId === id;
    if (isAlreadyExpanded) {
      setExpandedId(null);
      setLoadedArticle(null);
      return;
    }
    setExpandedId(id);
    setLoadingArticle(true);
    setLoadedArticle(null);
    try {
      const resp = await apiService.getN2AArticle(id);
      if (resp.success) setLoadedArticle(resp.data);
    } finally {
      setLoadingArticle(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  // Group by date (YYYY-MM-DD), then sort newest first within each group
  const byDate = savedList.reduce<Record<string, SavedArticleMeta[]>>((acc, a) => {
    const d = new Date(a.createdAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!acc[d]) acc[d] = [];
    acc[d].push(a);
    return acc;
  }, {});
  const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const sortedGroups = dateKeys.map(d => ({
    date: d,
    label: formatDateLabel(d),
    articles: byDate[d].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));

  function formatDateLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
    if (iso === today) return 'Today';
    if (iso === yesterday) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Saved Articles</h2>
        <button
          onClick={refreshList}
          className="btn-glass text-sm px-4 py-2 rounded-lg hover:bg-white/[0.06] transition"
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading && savedList.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">
          Loading saved articles…
        </div>
      ) : savedList.length === 0 ? (
        <div className="text-center py-16 px-4">
          <p className="text-zinc-400 text-sm mb-2">No saved articles yet.</p>
          <p className="text-zinc-500 text-xs">
            Generate articles from the <span className="text-zinc-400">Noise2Article</span> tab, then they’ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(({ date, label, articles }) => (
            <div key={date}>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">
                {label}
              </div>
              <div className="space-y-2">
                {articles.map((a) => {
            const isExpanded = expandedId === a.id;
            return (
              <div
                key={a.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                {/* Collapsible header */}
                <button
                  onClick={() => loadAndExpand(a.id)}
                  className={`w-full text-left p-4 flex items-center gap-3 transition ${
                    isExpanded ? 'bg-white/[0.04] border-b border-white/[0.04]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <svg
                    className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-100 line-clamp-2 leading-snug">
                      {a.title}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{a.estimatedReadTime}</span>
                      <span aria-hidden>·</span>
                      <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate max-w-[180px]">{a.themeName}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded body: article content */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t-0">
                    {loadingArticle ? (
                      <div className="py-8 text-center text-zinc-500 text-sm">Loading article…</div>
                    ) : loadedArticle ? (
                      <div className="space-y-3">
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => handleDelete(e, a.id)}
                            className="text-xs text-zinc-500 hover:text-red-400 transition flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete article
                          </button>
                        </div>
                        <ArticleCard
                          article={loadedArticle}
                          index={0}
                          articleId={a.id}
                          onRegenerateImage={handleRegenerateImage}
                          onEditImage={handleEditImage}
                        />
                      </div>
                    ) : (
                      <div className="py-6 text-center text-zinc-500 text-sm">
                        Failed to load article.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
