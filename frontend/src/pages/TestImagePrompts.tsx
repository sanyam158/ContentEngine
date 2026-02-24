import { useState } from 'react';
import apiService from '../services/api';

const SAMPLE_TITLES = [
  'How you can rebuild your dev context with a knowledge graph',
  '5 tools that can actually replace your paid AI stack',
  'Claude diagnosed a rare condition doctors missed for years',
  'The Browser-Native Agent Era is here',
];

const CUSTOM_VALUE = '__custom__';

const STRATEGIES: { value: 'A' | 'B' | 'C' | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto (AI chooses best — unique each time)' },
  { value: 'A', label: 'Retro-Futurist Collage (deep dives)' },
  { value: 'B', label: 'Editorial Vector Illustration (hot takes)' },
  { value: 'C', label: 'Modern Minimalist & UI (tutorials)' },
];

export function TestImagePrompts() {
  const [selectedTitle, setSelectedTitle] = useState(SAMPLE_TITLES[0]);
  const [customTitle, setCustomTitle] = useState('');
  const title = selectedTitle === CUSTOM_VALUE ? customTitle.trim() : selectedTitle;
  const [strategy, setStrategy] = useState<'A' | 'B' | 'C' | 'auto'>('auto');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ base64: string; mimeType: string; prompt: string; strategy: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
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
        if (match) {
          refMime = match[1];
          refB64 = match[2];
        }
      }
      const resp = await apiService.testImagePrompt({
        title,
        promptStrategy: strategy,
        referenceImageBase64: refB64,
        referenceImageMimeType: refMime,
      });
      if (resp.success && resp.data) {
        setResult(resp.data);
      } else {
        setError(resp.error || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = `data:${result.mimeType};base64,${result.base64}`;
    link.download = `test-${strategy}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up">
      <h2 className="text-lg font-semibold text-white mb-2">Test Image Prompts</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Generate images using style-first master prompts. Pick a title, strategy, and optionally a reference image.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Title</label>
          <select
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          >
            {SAMPLE_TITLES.map((t) => (
              <option key={t} value={t} className="bg-zinc-900">
                {t}
              </option>
            ))}
            <option value={CUSTOM_VALUE} className="bg-zinc-900">
              Custom…
            </option>
          </select>
          {selectedTitle === CUSTOM_VALUE && (
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Enter your article title"
              className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-400"
            />
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Prompt Strategy</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as 'A' | 'B' | 'C' | 'auto')}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value} className="bg-zinc-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Reference Image (optional)</label>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleReferenceChange}
              className="text-sm text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-red-600/20 file:text-red-400"
            />
            {referencePreview && (
              <img
                src={referencePreview}
                alt="Reference"
                className="w-16 h-16 object-cover rounded border border-white/10"
              />
            )}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !title}
          className="btn-glass px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate Image'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-video">
            <img
              src={`data:${result.mimeType};base64,${result.base64}`}
              alt={result.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button
                onClick={downloadImage}
                className="text-[10px] px-2 py-1 rounded bg-black/70 text-zinc-200 hover:bg-black/90 hover:text-white transition"
              >
                Download
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Strategy: {result.strategy} · {result.title}
          </p>
        </div>
      )}
    </main>
  );
}
