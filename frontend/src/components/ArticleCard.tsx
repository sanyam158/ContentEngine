import { useState, useRef, useCallback, useEffect } from 'react';
import apiService from '../services/api';

/**
 * Convert markdown to HTML for rich-text clipboard copy.
 * When pasted into X's article editor, this preserves bold, headers, lists, etc.
 * (Same behavior as pasting from Google Docs.)
 */
function markdownToHtml(md: string): string {
  let html = md
    // Headers: ### -> h3, ## -> h2, # -> h1
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
    // Strikethrough: ~~text~~
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Inline code: `code`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Unordered lists: - item or * item
    .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
    // Numbered lists: 1. item
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> blocks in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Paragraphs: wrap remaining text blocks in <p>
  html = html
    .split('\n\n')
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks already in HTML tags
      if (/^<(h[1-6]|ul|ol|pre|li|blockquote)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Copy rich HTML text to clipboard so it pastes with formatting into X articles.
 * Falls back to plain text if ClipboardItem API isn't supported.
 */
async function copyRichText(html: string, plainText: string): Promise<void> {
  try {
    // Use ClipboardItem API to copy both HTML and plain text
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      }),
    ]);
  } catch {
    // Fallback: copy plain text
    await navigator.clipboard.writeText(plainText);
  }
}

export type RepurposedPlatform = 'linkedin' | 'instagram';

export interface GeneratedArticle {
  id: string;
  createdAt: string;
  title: string;
  hook: string;
  xText: string;
  markdown: string;
  tags: string[];
  estimatedReadTime: string;
  threadTweets: string[];
  sources: Array<{ source: 'reddit' | 'hn' | 'twitter' | 'rss' | 'tavily'; title: string; url?: string }>;
  image?: { base64?: string; mimeType: string; prompt: string };
  imageUrl?: string;
  themeId: string;
  themeName: string;
  repurposed?: {
    linkedin?: string;
    instagram?: { hook: string; caption: string };
  };
}

interface ImageControlOptions {
  prompt?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

export function ArticleCard({
  article,
  index,
  articleId,
  onRegenerateImage,
  onEditImage,
  onArticleUpdate,
}: {
  article: GeneratedArticle;
  index: number;
  articleId?: string;
  onRegenerateImage?: (id: string, options?: ImageControlOptions) => void | Promise<void>;
  onEditImage?: (id: string, editPrompt: string, conversationHistory: any[]) => Promise<{ conversationHistory?: any[] } | void>;
  onArticleUpdate?: (updated: GeneratedArticle) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [format, setFormat] = useState<'x' | 'markdown'>('x');
  const [regenerating, setRegenerating] = useState(false);

  // Repurposed content state
  const [repurposed, setRepurposed] = useState(article.repurposed ?? {});
  const [showLinkedIn, setShowLinkedIn] = useState(!!article.repurposed?.linkedin);
  const [showInstagram, setShowInstagram] = useState(!!article.repurposed?.instagram);
  const [repurposeLoading, setRepurposeLoading] = useState<RepurposedPlatform | null>(null);
  const [repurposeError, setRepurposeError] = useState<RepurposedPlatform | null>(null);

  // Keep local repurposed state in sync when parent article prop updates; auto-expand if content arrives
  useEffect(() => {
    const incoming = article.repurposed ?? {};
    setRepurposed(incoming);
    if (incoming.linkedin) setShowLinkedIn(true);
    if (incoming.instagram) setShowInstagram(true);
  }, [article.repurposed]);

  // Image control state
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [imageMode, setImageMode] = useState<'regenerate' | 'edit'>('regenerate');
  const [imagePrompt, setImagePrompt] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[] | null>(null);
  const [showSources, setShowSources] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  const downloadImage = () => {
    if (!article.image && !article.imageUrl) return;
    const link = document.createElement('a');
    const safeTitle =
      article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'article-image';
    if (article.imageUrl) {
      link.href = article.imageUrl;
      link.download = `${safeTitle}.jpg`;
      link.target = '_blank';
    } else {
      const { mimeType, base64 } = article.image!;
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
      link.href = `data:${mimeType};base64,${base64}`;
      link.download = `${safeTitle}.${extension}`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  /** Copy article as rich HTML (for pasting into X article editor with formatting) */
  const copyForX = useCallback(async () => {
    const fullMarkdown = `# ${article.title}\n\n${article.markdown}`;
    const html = markdownToHtml(fullMarkdown);
    await copyRichText(html, article.xText);
    setCopied('article');
    setTimeout(() => setCopied(null), 2000);
  }, [article]);

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceFile(file);
      const reader = new FileReader();
      reader.onload = () => setReferencePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setReferenceFile(null);
      setReferencePreview(null);
    }
  };

  const handleImageAction = async () => {
    if (!articleId) return;
    setRegenerating(true);
    try {
      if (imageMode === 'edit' && conversationHistory && onEditImage) {
        const result = await onEditImage(articleId, imagePrompt, conversationHistory);
        if (result?.conversationHistory) {
          setConversationHistory(result.conversationHistory);
        }
      } else if (onRegenerateImage) {
        let refB64: string | undefined;
        let refMime: string | undefined;
        if (referenceFile) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(referenceFile);
          });
          const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
          if (match) { refMime = match[1]; refB64 = match[2]; }
        }
        await onRegenerateImage(articleId, {
          prompt: imagePrompt || undefined,
          referenceImageBase64: refB64,
          referenceImageMimeType: refMime,
        });
      }
    } finally {
      setRegenerating(false);
      setShowImagePanel(false);
      setImagePrompt('');
      setReferenceFile(null);
      setReferencePreview(null);
    }
  };

  const generateRepurposed = async (platform: RepurposedPlatform) => {
    if (!articleId) return;
    setRepurposeLoading(platform);
    setRepurposeError(null);
    try {
      const resp = await apiService.repurposeArticle(articleId, [platform]);
      const platformContent = resp.data?.repurposed?.[platform];
      if (resp.success && platformContent) {
        setRepurposed(prev => ({ ...prev, [platform]: platformContent }));
        if (platform === 'linkedin') setShowLinkedIn(true);
        if (platform === 'instagram') setShowInstagram(true);
        onArticleUpdate?.(resp.data);
      } else {
        setRepurposeError(platform);
      }
    } catch {
      setRepurposeError(platform);
    } finally {
      setRepurposeLoading(null);
    }
  };

  const sourceLabel = (s: string) => {
    const labels: Record<string, string> = { reddit: 'Reddit', hn: 'Hacker News', twitter: 'X/Twitter', rss: 'RSS', tavily: 'Web' };
    return labels[s] || s;
  };

  const activeBody = format === 'x' ? article.xText : `# ${article.title}\n\n${article.markdown}`;
  const bodyPreview = activeBody.split('\n').slice(0, 18).join('\n');
  const hasMore = activeBody.split('\n').length > 18;

  return (
    <div className="glass rounded-xl overflow-hidden animate-fade-in-up flex flex-col">
      {/* Article header */}
      <div className="bg-gradient-to-r from-red-600/10 to-red-500/5 border-b border-red-500/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                ARTICLE #{index + 1}
              </span>
              <span className="text-[10px] text-zinc-500">{article.estimatedReadTime}</span>
              <span className="text-[10px] text-zinc-600">from: {article.themeName}</span>
            </div>
            <h2
              className="text-base font-bold text-white leading-snug cursor-pointer hover:text-red-300 transition group/title"
              onClick={() => copyToClipboard(article.title, 'title')}
              title="Click to copy title"
            >
              {article.title}
              <span className="inline-flex ml-1.5 opacity-0 group-hover/title:opacity-100 transition align-middle">
                {copied === 'title' ? (
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </span>
            </h2>
          </div>
        </div>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {article.tags.map((tag, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Optional header image */}
      {(article.image || article.imageUrl) && (
        <div className="bg-black/40 border-b border-white/[0.06]">
          <div className="aspect-[16/9] w-full overflow-hidden relative group">
            <img
              src={article.imageUrl ?? `data:${article.image!.mimeType};base64,${article.image!.base64}`}
              alt={article.image?.prompt ?? 'Article image'}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition">
              <button onClick={downloadImage} className="text-[10px] px-2 py-1 rounded bg-black/70 text-zinc-200 hover:bg-black/90 hover:text-white transition">
                Download
              </button>
              {articleId && onRegenerateImage && (
                <>
                  <button
                    onClick={() => { setImageMode('regenerate'); setShowImagePanel(!showImagePanel); }}
                    disabled={regenerating}
                    className="text-[10px] px-2 py-1 rounded bg-black/60 text-zinc-300 hover:bg-black/80 hover:text-white transition disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                  {conversationHistory && onEditImage && (
                    <button
                      onClick={() => { setImageMode('edit'); setShowImagePanel(!showImagePanel); }}
                      disabled={regenerating}
                      className="text-[10px] px-2 py-1 rounded bg-black/60 text-zinc-300 hover:bg-black/80 hover:text-white transition disabled:opacity-50"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Image control panel */}
          {showImagePanel && articleId && (
            <div className="p-3 border-t border-white/[0.06] space-y-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase">
                  {imageMode === 'edit' ? 'Edit image' : 'Regenerate image'}
                </span>
              </div>
              <input
                type="text"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder={imageMode === 'edit' ? 'Describe the edit (e.g., "make it more colorful")...' : 'Custom prompt (optional)...'}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-zinc-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (imageMode === 'regenerate' || imagePrompt.trim())) handleImageAction();
                  if (e.key === 'Escape') setShowImagePanel(false);
                }}
                autoFocus
              />
              {imageMode === 'regenerate' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {referenceFile ? referenceFile.name : 'Reference image'}
                    <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceChange} />
                  </label>
                  {referencePreview && (
                    <img src={referencePreview} alt="Ref" className="w-8 h-8 rounded border border-white/10 object-cover" />
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleImageAction}
                  disabled={regenerating || (imageMode === 'edit' && !imagePrompt.trim())}
                  className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50"
                >
                  {regenerating ? 'Working...' : imageMode === 'edit' ? 'Apply Edit' : 'Generate'}
                </button>
                <button
                  onClick={() => { setShowImagePanel(false); setImagePrompt(''); setReferenceFile(null); setReferencePreview(null); }}
                  className="btn-glass text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No image - generate one */}
      {!article.image && !article.imageUrl && articleId && onRegenerateImage && (
        <div className="p-4 border-b border-white/[0.06]">
          {showImagePanel ? (
            <div className="space-y-2 animate-fade-in">
              <input
                type="text"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Custom prompt (optional - leave empty for AI art director)..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-zinc-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleImageAction();
                  if (e.key === 'Escape') setShowImagePanel(false);
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleImageAction} disabled={regenerating} className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50">
                  {regenerating ? 'Generating...' : 'Generate Image'}
                </button>
                <button onClick={() => setShowImagePanel(false)} className="btn-glass text-xs py-1.5 px-3">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setImageMode('regenerate'); setShowImagePanel(true); }}
              className="w-full py-3 border border-dashed border-white/10 rounded-lg text-xs text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Generate header image
            </button>
          )}
        </div>
      )}

      {/* Hook section */}
      <div className="p-5 border-b border-white/[0.04]">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Hook (standalone tweet)</p>
        <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
          <p className="text-sm text-zinc-300 leading-relaxed italic">"{article.hook}"</p>
        </div>
        <button
          onClick={() => copyToClipboard(article.hook, 'hook')}
          className="mt-2 text-[11px] text-zinc-500 hover:text-red-400 transition flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {copied === 'hook' ? 'Copied!' : 'Copy hook'}
        </button>
      </div>

      {/* Thread tweets */}
      {article.threadTweets.length > 0 && (
        <div className="p-5 border-b border-white/[0.04]">
          <button
            onClick={() => setShowThread(!showThread)}
            className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 hover:text-zinc-300 transition w-full"
          >
            <svg className={`w-3 h-3 transition-transform ${showThread ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Thread version ({article.threadTweets.length} tweets)
          </button>
          {showThread && (
            <div className="mt-3 space-y-2">
              {article.threadTweets.map((tweet, i) => (
                <div key={i} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full bg-red-600/20 border border-red-500/20 flex items-center justify-center text-[9px] font-bold text-red-400 shrink-0">
                      {i + 1}
                    </div>
                    {i < article.threadTweets.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-xs text-zinc-300 leading-relaxed">{tweet}</p>
                    <button
                      onClick={() => copyToClipboard(tweet, `tweet-${i}`)}
                      className="mt-1 text-[10px] text-zinc-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                    >
                      {copied === `tweet-${i}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => copyToClipboard(article.threadTweets.join('\n\n'), 'thread')}
                className="text-[11px] text-zinc-500 hover:text-red-400 transition flex items-center gap-1 mt-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied === 'thread' ? 'Copied all!' : 'Copy entire thread'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* LinkedIn section */}
      <div className="p-5 border-b border-white/[0.04]">
        <button
          onClick={() => setShowLinkedIn(!showLinkedIn)}
          className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 hover:text-zinc-300 transition w-full"
        >
          <svg className={`w-3 h-3 transition-transform ${showLinkedIn ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          LinkedIn Post
          {repurposed.linkedin && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400/60 inline-block" />}
        </button>

        {showLinkedIn && (
          <div className="mt-3">
            {repurposeLoading === 'linkedin' ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </div>
            ) : repurposed.linkedin ? (
              <div>
                <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04] max-h-64 overflow-y-auto">
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{repurposed.linkedin}</p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => copyToClipboard(repurposed.linkedin!, 'linkedin')}
                    className="text-[11px] text-zinc-500 hover:text-red-400 transition flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copied === 'linkedin' ? 'Copied!' : 'Copy'}
                  </button>
                  {articleId && (
                    <button
                      onClick={() => generateRepurposed('linkedin')}
                      className="text-[11px] text-zinc-600 hover:text-zinc-400 transition flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Regenerate
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <span className="text-xs text-zinc-600">LinkedIn Post not generated yet.</span>
                {articleId && (
                  <button
                    onClick={() => generateRepurposed('linkedin')}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate
                  </button>
                )}
                {repurposeError === 'linkedin' && <span className="text-[10px] text-red-400/60">Failed — try again</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instagram section */}
      <div className="p-5 border-b border-white/[0.04]">
        <button
          onClick={() => setShowInstagram(!showInstagram)}
          className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 hover:text-zinc-300 transition w-full"
        >
          <svg className={`w-3 h-3 transition-transform ${showInstagram ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Instagram Caption
          {repurposed.instagram && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400/60 inline-block" />}
        </button>

        {showInstagram && (
          <div className="mt-3">
            {repurposeLoading === 'instagram' ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </div>
            ) : repurposed.instagram ? (
              <div className="space-y-3">
                {/* Hook sub-panel */}
                <div>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Hook (image overlay)</p>
                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{repurposed.instagram.hook}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(repurposed.instagram!.hook, 'instagram-hook')}
                    className="mt-1.5 text-[11px] text-zinc-500 hover:text-red-400 transition flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copied === 'instagram-hook' ? 'Copied!' : 'Copy hook'}
                  </button>
                </div>
                {/* Caption sub-panel */}
                <div>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">Caption</p>
                  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04] max-h-64 overflow-y-auto">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{repurposed.instagram.caption}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      onClick={() => copyToClipboard(repurposed.instagram!.caption, 'instagram-caption')}
                      className="text-[11px] text-zinc-500 hover:text-red-400 transition flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied === 'instagram-caption' ? 'Copied!' : 'Copy caption'}
                    </button>
                    {articleId && (
                      <button
                        onClick={() => generateRepurposed('instagram')}
                        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <span className="text-xs text-zinc-600">Instagram Caption not generated yet.</span>
                {articleId && (
                  <button
                    onClick={() => generateRepurposed('instagram')}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate
                  </button>
                )}
                {repurposeError === 'instagram' && <span className="text-[10px] text-red-400/60">Failed — try again</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full article body */}
      <div className="p-5 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Article Text</p>
            <div className="flex gap-1 bg-white/[0.03] rounded-md p-1 border border-white/[0.04]">
              <button
                onClick={() => setFormat('x')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition ${format === 'x' ? 'bg-red-600/20 text-red-400 border border-red-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                X-ready
              </button>
              <button
                onClick={() => setFormat('markdown')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition ${format === 'markdown' ? 'bg-white/[0.06] text-white border border-white/[0.08]' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Markdown
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {format === 'x' && (
              <button
                onClick={copyForX}
                className="text-[11px] text-red-400 hover:text-red-300 transition flex items-center gap-1 font-medium"
                title="Copies with formatting (bold, headers) - paste directly into X article editor"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied === 'article' ? 'Copied!' : 'Copy for X (formatted)'}
              </button>
            )}
            <button
              onClick={() => copyToClipboard(activeBody, 'article-plain')}
              className="text-[11px] text-zinc-500 hover:text-zinc-400 transition flex items-center gap-1"
              title="Copy as plain text"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied === 'article-plain' ? 'Copied!' : format === 'x' ? 'Plain text' : 'Copy markdown'}
            </button>
          </div>
        </div>
        <div className={`text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap bg-white/[0.02] rounded-lg p-4 border border-white/[0.04] max-h-[600px] overflow-y-auto ${format === 'markdown' ? 'font-mono' : 'font-sans'}`}>
          {showFull ? activeBody : bodyPreview}
        </div>
        {hasMore && !showFull && (
          <button onClick={() => setShowFull(true)} className="mt-3 text-[11px] text-red-400 hover:text-red-300 transition">
            Read full article...
          </button>
        )}
        {showFull && (
          <button onClick={() => setShowFull(false)} className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition">
            Collapse
          </button>
        )}
      </div>

      {/* Sources section */}
      {article.sources && article.sources.length > 0 && (
        <div className="p-5">
          <button
            onClick={() => setShowSources(!showSources)}
            className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1 hover:text-zinc-300 transition w-full"
          >
            <svg className={`w-3 h-3 transition-transform ${showSources ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Sources ({article.sources.length})
          </button>
          {showSources && (
            <div className="mt-3 space-y-1.5">
              {article.sources.map((src, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                    src.source === 'reddit' ? 'bg-orange-500/15 text-orange-400 border-orange-500/20' :
                    src.source === 'hn' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                    src.source === 'twitter' ? 'bg-sky-500/15 text-sky-400 border-sky-500/20' :
                    src.source === 'tavily' ? 'bg-purple-500/15 text-purple-400 border-purple-500/20' :
                    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {sourceLabel(src.source)}
                  </span>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition truncate">
                      {src.title}
                    </a>
                  ) : (
                    <span className="text-zinc-500 truncate">{src.title}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
