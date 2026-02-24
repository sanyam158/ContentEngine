import React, { useState, useRef, useCallback } from 'react';
import { PostingProgress, TweetImage, CoverImage } from '../types';
import apiService from '../services/api';

interface Thread {
  tweets: string[];
  coverImage?: CoverImage | null;
  metadata: {
    totalCharacters: number;
    tweetCount: number;
    generatedAt: string;
    validation?: {
      valid: boolean;
      warnings: string[];
      stats: { totalTweets: number; avgLength: number; totalChars: number };
    };
  };
}

interface ThreadPreviewProps {
  thread: Thread;
  onPost: (tweets: string[], images?: Record<number, { base64: string; mimeType: string }>) => void;
  isPosting: boolean;
  postingProgress?: PostingProgress;
  onGenerateVariations?: () => void;
  onUpdateThread?: (tweets: string[]) => void;
}

export const ThreadPreview: React.FC<ThreadPreviewProps> = ({
  thread,
  onPost,
  isPosting,
  postingProgress,
  onGenerateVariations,
  onUpdateThread,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedTweets, setEditedTweets] = useState<string[]>(thread.tweets);
  const [tweetImages, setTweetImages] = useState<Record<number, TweetImage>>(() => {
    // Initialize with cover image on first tweet if available
    const initial: Record<number, TweetImage> = {};
    if (thread.coverImage) {
      initial[0] = {
        preview: `data:${thread.coverImage.mimeType};base64,${thread.coverImage.base64}`,
        base64: thread.coverImage.base64,
        mimeType: thread.coverImage.mimeType,
        isGenerated: true,
        conversationHistory: (thread.coverImage as any)?.conversationHistory,
      };
    }
    return initial;
  });

  // Image generation state
  const [imageGenLoading, setImageGenLoading] = useState<number | null>(null);
  const [showPromptInput, setShowPromptInput] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const refImageInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleEditTweet = (index: number, newText: string) => {
    const updated = [...editedTweets];
    updated[index] = newText;
    setEditedTweets(updated);
  };

  const handleAddTweet = (afterIndex?: number) => {
    const updated = [...editedTweets];
    const insertAt = afterIndex !== undefined ? afterIndex + 1 : updated.length;
    updated.splice(insertAt, 0, '');
    // Shift image indices
    const newImages: Record<number, TweetImage> = {};
    Object.entries(tweetImages).forEach(([key, val]) => {
      const k = Number(key);
      newImages[k >= insertAt ? k + 1 : k] = val;
    });
    setTweetImages(newImages);
    setEditedTweets(updated);
  };

  const handleDeleteTweet = (index: number) => {
    if (editedTweets.length <= 1) return;
    const updated = editedTweets.filter((_, i) => i !== index);
    // Shift image indices
    const newImages: Record<number, TweetImage> = {};
    Object.entries(tweetImages).forEach(([key, val]) => {
      const k = Number(key);
      if (k === index) return;
      newImages[k > index ? k - 1 : k] = val;
    });
    setTweetImages(newImages);
    setEditedTweets(updated);
  };

  const handleImageAttach = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setTweetImages((prev) => ({
        ...prev,
        [index]: { file, preview: reader.result as string },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleImageRemove = (index: number) => {
    setTweetImages((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleImageDownload = (index: number) => {
    const img = tweetImages[index];
    if (!img) return;

    const dataUrl = img.preview;
    let mime = img.mimeType;
    if (!mime) {
      const m = /^data:(.*?);/i.exec(dataUrl);
      mime = m?.[1] || 'image/png';
    }

    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('webp')
      ? 'webp'
      : 'png';

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `tweet-${index + 1}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // AI image generation for a tweet
  const handleGenerateImage = async (index: number, prompt?: string, referenceFiles?: File[]) => {
    setImageGenLoading(index);
    try {
      const tweetText = editMode ? editedTweets[index] : thread.tweets[index];
      const result = await apiService.generateImage(
        {
          prompt: prompt || undefined,
          tweetText: prompt ? undefined : tweetText,
          threadContext: thread.tweets.join(' ').substring(0, 500),
        },
        referenceFiles
      );

      if (result.success && result.image) {
        setTweetImages((prev) => ({
          ...prev,
          [index]: {
            preview: `data:${result.image.mimeType};base64,${result.image.base64}`,
            base64: result.image.base64,
            mimeType: result.image.mimeType,
            isGenerated: true,
            conversationHistory: result.image.conversationHistory,
          },
        }));
      }
    } catch (err) {
      console.error('Image generation failed:', err);
    } finally {
      setImageGenLoading(null);
      setShowPromptInput(null);
      setCustomPrompt('');
    }
  };

  const handleRegenerateWithPrompt = (index: number) => {
    if (!customPrompt.trim()) return;
    handleGenerateImage(index, customPrompt);
  };

  const handleRegenerateWithRef = (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    handleGenerateImage(index, customPrompt || undefined, fileArr);
  };

  const handleEditImage = async (index: number) => {
    if (!customPrompt.trim()) return;
    const img = tweetImages[index];
    if (!img?.conversationHistory) return;
    setImageGenLoading(index);
    try {
      const result = await apiService.editImage(customPrompt, { conversationHistory: img.conversationHistory });
      if (result.success && result.image) {
        setTweetImages((prev) => ({
          ...prev,
          [index]: {
            preview: `data:${result.image.mimeType};base64,${result.image.base64}`,
            base64: result.image.base64,
            mimeType: result.image.mimeType,
            isGenerated: true,
            conversationHistory: result.image.conversationHistory,
          },
        }));
      }
    } catch (err) {
      console.error('Image edit failed:', err);
    } finally {
      setImageGenLoading(null);
      setShowPromptInput(null);
      setCustomPrompt('');
    }
  };

  const handleSaveEdits = () => {
    const nonEmpty = editedTweets.filter((t) => t.trim().length > 0);
    if (nonEmpty.length === 0) return;
    onUpdateThread?.(nonEmpty);
    setEditedTweets(nonEmpty);
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditedTweets(thread.tweets);
    setTweetImages({});
    setEditMode(false);
  };

  const handleEnterEdit = () => {
    setEditedTweets(thread.tweets);
    setEditMode(true);
  };

  // ── Drag & drop ──
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDraggedIndex(index);
      dragNodeRef.current = e.currentTarget;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      requestAnimationFrame(() => dragNodeRef.current?.classList.add('tweet-card-dragging'));
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedIndex === null || draggedIndex === index) return;
      setDragOverIndex(index);
    },
    [draggedIndex]
  );

  const handleDragLeave = useCallback(() => setDragOverIndex(null), []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === dropIndex) {
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }
      const updated = [...editedTweets];
      const [removed] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, removed);
      // Remap images
      const oldImages = { ...tweetImages };
      const newImages: Record<number, TweetImage> = {};
      Object.entries(oldImages).forEach(([key, val]) => {
        let k = Number(key);
        if (k === draggedIndex) {
          newImages[dropIndex] = val;
        } else {
          if (k > draggedIndex) k--;
          if (k >= dropIndex) k++;
          newImages[k] = val;
        }
      });
      setTweetImages(newImages);
      setEditedTweets(updated);
      setDraggedIndex(null);
      setDragOverIndex(null);
    },
    [draggedIndex, editedTweets, tweetImages]
  );

  const handleDragEnd = useCallback(() => {
    dragNodeRef.current?.classList.remove('tweet-card-dragging');
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, []);

  const displayTweets = editMode ? editedTweets : thread.tweets;
  const avgLength =
    displayTweets.length > 0
      ? Math.round(displayTweets.reduce((sum, t) => sum + t.length, 0) / displayTweets.length)
      : 0;

  // ── Posting progress overlay ──
  if (postingProgress && postingProgress.isPosting) {
    const { currentTweet, totalTweets, done, tweetIds, error } = postingProgress;
    const pct = done ? 100 : Math.round((currentTweet / totalTweets) * 100);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-4 py-8">
          {error ? (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-red-400 text-sm">{error}</p>
            </>
          ) : done ? (
            <>
              <div
                className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto"
                style={{ animation: 'check-in 0.4s ease-out' }}
              >
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Thread posted</h3>
              <p className="text-sm text-zinc-400">
                {tweetIds.length} tweets published as a thread
              </p>
              {tweetIds.length > 0 && (
                <a
                  href={`https://x.com/i/status/${tweetIds[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 btn-primary text-sm mt-2"
                >
                  View on X
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Posting thread...</h3>
              <p className="text-sm text-zinc-400">
                Tweet {currentTweet} of {totalTweets}
              </p>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="progress-bar h-full" style={{ width: `${pct}%` }} />
        </div>

        {/* Per-tweet status */}
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {Array.from({ length: totalTweets }).map((_, i) => {
            const isPosted = i < tweetIds.length;
            const isCurrent = i === currentTweet - 1 && !done && !error;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm py-1.5 px-3 rounded-lg ${
                  isPosted ? 'text-emerald-400' : isCurrent ? 'text-red-400' : 'text-zinc-600'
                }`}
              >
                {isPosted ? (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-zinc-700 flex-shrink-0" />
                )}
                <span className="truncate font-mono text-xs">
                  Tweet {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Main preview ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-white">Thread Preview</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {displayTweets.length} tweets &middot; ~{avgLength} chars avg
          </p>
        </div>
        <button
          onClick={editMode ? handleCancelEdit : handleEnterEdit}
          className="btn-glass text-sm py-2 px-4"
        >
          {editMode ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Validation warnings */}
      {thread.metadata.validation && !thread.metadata.validation.valid && (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-xs text-amber-400/80 space-y-1">
          {thread.metadata.validation.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Edit hint */}
      {editMode && (
        <p className="text-xs text-zinc-500">
          Drag to reorder &middot; Click + to add &middot; Trash to remove
        </p>
      )}

      {/* Tweet list */}
      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
        {displayTweets.map((tweet, index) => (
          <div key={editMode ? `e-${index}` : `v-${index}`}>
            <div
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`tweet-card p-4 transition-all ${
                editMode ? 'cursor-grab active:cursor-grabbing' : ''
              } ${
                dragOverIndex === index && draggedIndex !== null && draggedIndex !== index
                  ? draggedIndex < index
                    ? 'tweet-card-drop-below'
                    : 'tweet-card-drop-above'
                  : ''
              } ${draggedIndex === index ? 'tweet-card-dragging' : ''}`}
            >
              {/* Header row */}
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  {editMode && (
                    <svg className="w-4 h-4 text-zinc-600 cursor-grab" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  )}
                  <span className="text-xs font-mono text-zinc-600">
                    {index + 1}/{displayTweets.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {editMode ? (
                    <button
                      onClick={() => handleDeleteTweet(index)}
                      disabled={editedTweets.length <= 1}
                      className="btn-danger p-1.5 rounded-lg disabled:opacity-20"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => copyToClipboard(tweet, index)}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 transition"
                      title="Copy"
                    >
                      {copiedIndex === index ? (
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Body */}
              {editMode ? (
                <textarea
                  value={editedTweets[index]}
                  onChange={(e) => handleEditTweet(index, e.target.value)}
                  className="glass-input w-full p-3 rounded-lg text-sm resize-none"
                  rows={3}
                  maxLength={280}
                  placeholder="Write your tweet..."
                  autoFocus={editedTweets[index] === ''}
                />
              ) : (
                <p className="text-sm text-zinc-200 leading-relaxed break-words whitespace-pre-wrap">
                  {tweet}
                </p>
              )}

              {/* Image preview */}
              {tweetImages[index] && (
                <div className="mt-3 relative group">
                  <img
                    src={tweetImages[index].preview}
                    alt="Attachment"
                    className="w-full max-h-48 rounded-lg object-cover border border-white/10"
                  />
                  {tweetImages[index].isGenerated && (
                    <span className="absolute top-2 left-2 text-[10px] bg-black/60 backdrop-blur-sm text-zinc-300 px-1.5 py-0.5 rounded-md">
                      AI Generated
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => handleImageDownload(index)}
                      className="w-7 h-7 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-[9px] hover:bg-black/90 transition"
                      title="Download"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => handleImageRemove(index)}
                      className="w-6 h-6 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-xs hover:bg-red-500 transition"
                      title="Remove"
                    >
                      &times;
                    </button>
                    <button
                      onClick={() => {
                        setShowPromptInput(showPromptInput === index ? null : index);
                      }}
                      className="w-6 h-6 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-xs hover:bg-red-500 transition"
                      title="Regenerate"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    {tweetImages[index]?.conversationHistory && (
                      <button
                        onClick={() => {
                          setShowPromptInput(showPromptInput === index ? null : index);
                        }}
                        className="w-6 h-6 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-xs hover:bg-blue-500 transition"
                        title="Edit image"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Image generation loading */}
              {imageGenLoading === index && (
                <div className="mt-3 w-full h-32 rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-red-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-xs text-zinc-500">Generating image...</span>
                </div>
              )}

              {/* Regenerate prompt input */}
              {showPromptInput === index && (
                <div className="mt-2 space-y-2 animate-fade-in">
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe what you want..."
                    className="glass-input w-full p-2 rounded-lg text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRegenerateWithPrompt(index);
                      if (e.key === 'Escape') { setShowPromptInput(null); setCustomPrompt(''); }
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRegenerateWithPrompt(index)}
                      disabled={!customPrompt.trim() || imageGenLoading === index}
                      className="btn-primary text-xs py-1.5 px-3 flex-1"
                    >
                      Generate
                    </button>
                    {tweetImages[index]?.conversationHistory && (
                      <button
                        onClick={() => handleEditImage(index)}
                        disabled={!customPrompt.trim() || imageGenLoading === index}
                        className="btn-glass text-xs py-1.5 px-3 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/20 transition"
                      >
                        Edit
                      </button>
                    )}
                    <label className="btn-glass text-xs py-1.5 px-3 cursor-pointer text-center">
                      + Reference
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        ref={refImageInputRef}
                        onChange={(e) => {
                          handleRegenerateWithRef(index, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={() => { setShowPromptInput(null); setCustomPrompt(''); }}
                      className="btn-glass text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Footer row */}
              <div className="mt-2 flex justify-between items-center">
                <span
                  className={`text-xs font-mono ${
                    (editMode ? editedTweets[index] : tweet).length > 280
                      ? 'text-red-400'
                      : 'text-zinc-600'
                  }`}
                >
                  {(editMode ? editedTweets[index] : tweet).length}/280
                </span>

                {/* Image actions */}
                {!tweetImages[index] && imageGenLoading !== index && showPromptInput !== index && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleGenerateImage(index)}
                      disabled={imageGenLoading !== null}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition"
                      title="AI Generate"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI Image
                    </button>
                    <button
                      onClick={() => setShowPromptInput(index)}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition"
                      title="Custom prompt"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Prompt
                    </button>
                    {editMode && (
                      <label className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 cursor-pointer transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImageAttach(index, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Add tweet between */}
            {editMode && (
              <button
                onClick={() => handleAddTweet(index)}
                className="w-full mt-1.5 py-1 border border-dashed border-white/5 rounded-lg text-zinc-600 hover:border-red-500/30 hover:text-red-400 transition flex items-center justify-center gap-1 text-xs"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add tweet
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {editMode ? (
          <>
            <button
              onClick={handleSaveEdits}
              disabled={editedTweets.every((t) => !t.trim())}
              className="btn-primary flex-1 text-sm"
            >
              Save ({editedTweets.filter((t) => t.trim()).length} tweets)
            </button>
            <button onClick={handleCancelEdit} className="btn-glass flex-1 text-sm">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                // Collect images to pass with post
                const imagesToPost: Record<number, { base64: string; mimeType: string }> = {};
                Object.entries(tweetImages).forEach(([key, img]) => {
                  if (img.base64 && img.mimeType) {
                    imagesToPost[Number(key)] = { base64: img.base64, mimeType: img.mimeType };
                  }
                });
                onPost(
                  displayTweets,
                  Object.keys(imagesToPost).length > 0 ? imagesToPost : undefined
                );
              }}
              disabled={isPosting || displayTweets.some((t) => t.length > 280)}
              className="btn-primary flex-1 text-sm"
            >
              {isPosting ? 'Posting...' : 'Post to X'}
            </button>
            {onGenerateVariations && (
              <button onClick={onGenerateVariations} className="btn-glass flex-1 text-sm">
                Variations
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
