import { useState, useRef, useEffect } from 'react';
import { ScriptInput } from '../components/ScriptInput';
import { ThreadPreview } from '../components/ThreadPreview';
import { VariationsView } from '../components/VariationsView';
import apiService from '../services/api';
import { Thread, Variation, ViewMode, PostingProgress } from '../types';

export function Script2Thread() {
  const [script, setScript] = useState('');
  const [thread, setThread] = useState<Thread | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<Variation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [toneOfVoice, setToneOfVoice] = useState('natural and conversational');
  const [targetAudience, setTargetAudience] = useState('creators and entrepreneurs');
  const [includeResearch, setIncludeResearch] = useState(true);

  // Posting progress
  const [postingProgress, setPostingProgress] = useState<PostingProgress>({
    isPosting: false,
    currentTweet: 0,
    totalTweets: 0,
    tweetIds: [],
    done: false,
  });
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generation progress
  const [genProgress, setGenProgress] = useState(0);
  const genIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
    };
  }, []);

  const handleScriptChange = (newScript: string) => {
    setScript(newScript);
    setError(null);
  };

  const handleGenerateThread = async () => {
    if (!script.trim()) {
      setError('Please enter a script first');
      return;
    }

    setLoading(true);
    setError(null);
    setGenProgress(0);

    let progress = 0;
    genIntervalRef.current = setInterval(() => {
      progress += Math.random() * 12 + 3;
      if (progress > 90) progress = 90;
      setGenProgress(Math.round(progress));
    }, 400);

    try {
      const response = await apiService.generateThread(script, {
        toneOfVoice,
        targetAudience,
        includeResearch,
      });

      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      setGenProgress(100);

      if (response.success) {
        setThread(response.thread);
        setVariations([]);
        setSelectedVariation(null);
        setTimeout(() => {
          setViewMode('preview');
          setGenProgress(0);
        }, 300);
      } else {
        setError('Failed to generate thread. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      setLoading(false);
    }
  };

  const handlePostThread = async (
    tweetsToPost: string[],
    images?: Record<number, { base64: string; mimeType: string }>
  ) => {
    setError(null);

    const totalTweets = tweetsToPost.length;
    setPostingProgress({
      isPosting: true,
      currentTweet: 1,
      totalTweets,
      tweetIds: [],
      done: false,
    });

    let current = 1;
    const interval = images && Object.keys(images).length > 0 ? 4000 : 2500;
    progressIntervalRef.current = setInterval(() => {
      current++;
      if (current <= totalTweets) {
        setPostingProgress((prev) => ({
          ...prev,
          currentTweet: current,
          tweetIds: [...prev.tweetIds, `pending-${current - 1}`],
        }));
      }
    }, interval);

    try {
      const response = await apiService.postThread(tweetsToPost, true, images);

      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      if (response.success) {
        setPostingProgress({
          isPosting: true,
          currentTweet: totalTweets,
          totalTweets,
          tweetIds: response.data.tweetIds || [],
          done: true,
        });
      } else {
        setPostingProgress({
          isPosting: true,
          currentTweet: 0,
          totalTweets,
          tweetIds: [],
          done: false,
          error: response.data.error || 'Failed to post thread',
        });
      }
    } catch (err) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setPostingProgress({
        isPosting: true,
        currentTweet: 0,
        totalTweets,
        tweetIds: [],
        done: false,
        error: err instanceof Error ? err.message : 'Failed to post thread',
      });
    }
  };

  const handleGenerateVariations = async () => {
    if (!script.trim()) {
      setError('Please enter a script first');
      return;
    }

    setLoading(true);
    setError(null);
    setGenProgress(0);

    let progress = 0;
    genIntervalRef.current = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress > 90) progress = 90;
      setGenProgress(Math.round(progress));
    }, 500);

    try {
      const response = await apiService.generateVariations(script, 3, targetAudience);

      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      setGenProgress(100);

      if (response.success) {
        setVariations(response.variations);
        setTimeout(() => {
          setViewMode('variations');
          setGenProgress(0);
        }, 300);
      } else {
        setError('Failed to generate variations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate variations');
    } finally {
      if (genIntervalRef.current) clearInterval(genIntervalRef.current);
      setLoading(false);
    }
  };

  const handleSelectVariation = (variation: Variation) => {
    setSelectedVariation(variation);
    setThread({ tweets: variation.tweets, metadata: variation.metadata });
    setViewMode('preview');
  };

  const handleUpdateThread = (updatedTweets: string[]) => {
    if (thread) {
      setThread({
        ...thread,
        tweets: updatedTweets,
        metadata: {
          ...thread.metadata,
          totalCharacters: updatedTweets.reduce((sum, t) => sum + t.length, 0),
          tweetCount: updatedTweets.length,
        },
      });
      setSuccess('Thread updated');
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const handleDeleteVariation = (id: number) => {
    setVariations(variations.filter((v) => v.id !== id));
  };

  const resetAll = () => {
    setScript('');
    setThread(null);
    setVariations([]);
    setSelectedVariation(null);
    setViewMode('input');
    setPostingProgress({ isPosting: false, currentTweet: 0, totalTweets: 0, tweetIds: [], done: false });
  };

  return (
    <>
      {/* Notifications */}
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

      {success && (
        <div className="notification mb-4 bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 p-3 rounded-xl text-sm">
          {success}
        </div>
      )}

      {/* Main card */}
      <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up delay-1">
        {/* INPUT VIEW */}
        {viewMode === 'input' && (
          <div className="space-y-6">
            <ScriptInput onScriptChange={handleScriptChange} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Tone</label>
                <select
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  className="glass-input w-full p-2.5 rounded-lg text-sm"
                >
                  <option value="natural and conversational">Natural & Conversational</option>
                  <option value="professional but witty">Professional but Witty</option>
                  <option value="storytelling focused">Storytelling</option>
                  <option value="casual and fun">Casual & Fun</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Audience</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., tech entrepreneurs"
                  className="glass-input w-full p-2.5 rounded-lg text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={includeResearch}
                onChange={(e) => setIncludeResearch(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-transparent accent-red-600"
              />
              <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition">
                Include web research for context
              </span>
            </label>

            <div className="space-y-2">
              <button
                onClick={handleGenerateThread}
                disabled={loading || !script.trim()}
                className="btn-primary w-full text-sm"
              >
                {loading ? 'Generating...' : 'Generate Thread'}
              </button>

              {loading && genProgress > 0 && (
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="progress-bar h-full"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* PREVIEW VIEW */}
        {viewMode === 'preview' && thread && (
          <div className="space-y-6">
            <ThreadPreview
              thread={
                selectedVariation
                  ? { tweets: selectedVariation.tweets, metadata: selectedVariation.metadata }
                  : thread
              }
              key={thread.metadata.generatedAt}
              onPost={handlePostThread}
              isPosting={postingProgress.isPosting}
              postingProgress={postingProgress}
              onGenerateVariations={handleGenerateVariations}
              onUpdateThread={handleUpdateThread}
            />

            {!postingProgress.isPosting && (
              <button
                onClick={() => setViewMode('input')}
                className="btn-glass w-full text-sm"
              >
                Back
              </button>
            )}

            {postingProgress.done && (
              <button onClick={resetAll} className="btn-glass w-full text-sm">
                New Thread
              </button>
            )}

            {loading && (
              <div className="absolute inset-0 bg-[#09090b]/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-4 z-20">
                <svg className="w-8 h-8 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-zinc-400">Generating variations...</p>
                {genProgress > 0 && (
                  <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="progress-bar h-full" style={{ width: `${genProgress}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VARIATIONS VIEW */}
        {viewMode === 'variations' && variations.length > 0 && (
          <div className="space-y-6">
            <VariationsView
              variations={variations}
              onSelectVariation={handleSelectVariation}
              onDelete={handleDeleteVariation}
              selectedVariationId={selectedVariation?.id}
            />

            {selectedVariation && (
              <button
                onClick={() => setViewMode('preview')}
                className="btn-primary w-full text-sm"
              >
                Preview Selected
              </button>
            )}

            <button
              onClick={() => setViewMode('input')}
              className="btn-glass w-full text-sm"
            >
              Back
            </button>
          </div>
        )}
      </main>
    </>
  );
}
