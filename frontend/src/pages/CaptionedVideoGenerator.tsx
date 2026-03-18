import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiService, { SavedVcgRender, VcgBiasRange, VcgConfig, VcgPlatform } from '../services/api';
import PRESETS from '../config/vcg-presets.json';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_RUN_MS = 4000;
const POLL_INTERVAL_STATUS_MS = 8000;
const MAX_RUN_POLLS = 15;
const MAX_STATUS_POLLS = 90;

// ─── Types ────────────────────────────────────────────────────────────────────

type RenderPhase = 'idle' | 'triggering' | 'waiting-for-run' | 'rendering' | 'done' | 'error';
type VideoGenTab = 'current' | 'saved';

interface FormState {
  template: string;
  platforms: string[];
  // Reel fields
  pageName: string;
  title: string;
  hook: string;
  body: string;
  ctaText: string;
  hashtags: string;
  theme: string;
  pace: string;
  animationStyle: string;
  fontFamily: string;
  animationSpeed: string;
  accentColor: string;
  bodyTextColor: string;
  bodyFontSizeBias: number;
  showProgressBar: boolean;
  showPlatformBadge: boolean;
  showSafeZoneGuides: boolean;
  audioPath: string;
  audioVolume: number;
  // Minimal text fields
  heading: string;
  text: string;
  durationSeconds: number;
  headingColor: string;
  textColor: string;
  textFontSizeBias: number;
}

const DEFAULT_FORM: FormState = {
  template: 'reel',
  platforms: [],
  pageName: '',
  title: '',
  hook: '',
  body: '',
  ctaText: '',
  hashtags: '',
  theme: 'minimalBlack',
  pace: 'balanced',
  animationStyle: 'fadeUp',
  fontFamily: 'poppins',
  animationSpeed: 'normal',
  accentColor: '#ff2d2d',
  bodyTextColor: '#FFE500',
  bodyFontSizeBias: 0,
  showProgressBar: true,
  showPlatformBadge: true,
  showSafeZoneGuides: false,
  audioPath: '',
  audioVolume: 0.20,
  heading: '',
  text: '',
  durationSeconds: 4,
  headingColor: '#ff5a5a',
  textColor: '#ffffff',
  textFontSizeBias: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBodyLimit(keys: string[], platforms: VcgPlatform[]): number {
  if (keys.length === 0) return 360;
  return Math.min(...keys.map(k => platforms.find(p => p.key === k)?.bodyCharLimit ?? 360));
}

const DEFAULT_BIAS_RANGE: VcgBiasRange = { min: -6, max: 8, default: 0, step: 1 };

function coerceBiasRange(value: unknown): VcgBiasRange {
  if (!value || typeof value !== 'object') return DEFAULT_BIAS_RANGE;
  const candidate = value as Partial<VcgBiasRange>;
  if (
    typeof candidate.min !== 'number'
    || typeof candidate.max !== 'number'
    || typeof candidate.default !== 'number'
    || typeof candidate.step !== 'number'
  ) {
    return DEFAULT_BIAS_RANGE;
  }
  return candidate as VcgBiasRange;
}

function clampToRange(value: number, range: VcgBiasRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function getRenderTitle(form: FormState): string {
  if (form.template === 'reel') {
    return form.title.trim() || form.hook.trim() || 'Untitled reel render';
  }
  return form.heading.trim() || 'Untitled minimal text render';
}

function getRenderDescription(form: FormState): string | undefined {
  if (form.template === 'reel') {
    return form.hook.trim() || form.body.trim().slice(0, 160) || undefined;
  }
  return form.text.trim().slice(0, 160) || undefined;
}

function formatRenderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CaptionedVideoGenerator() {
  // Config loading
  const [vcgConfig, setVcgConfig] = useState<VcgConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [activeTab, setActiveTab] = useState<VideoGenTab>('current');
  const [savedRenders, setSavedRenders] = useState<SavedVcgRender[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    apiService.getVcgConfig()
      .then(cfg => {
        const bodyRange = coerceBiasRange((cfg as Partial<VcgConfig>).bodyFontSizeBiasRange);
        const textRange = coerceBiasRange((cfg as Partial<VcgConfig>).textFontSizeBiasRange);
        const defaultBodyTextColor = typeof (cfg as Partial<VcgConfig>).defaultBodyTextColor === 'string'
          ? (cfg as Partial<VcgConfig>).defaultBodyTextColor as string
          : '#FFE500';

        const normalizedCfg: VcgConfig = {
          ...cfg,
          defaultBodyTextColor,
          bodyFontSizeBiasRange: bodyRange,
          textFontSizeBiasRange: textRange,
        };

        setVcgConfig(normalizedCfg);
        // Pre-select the first platform once config is available
        setForm(prev => ({
          ...prev,
          platforms: prev.platforms.length === 0 && normalizedCfg.platforms.length > 0
            ? [normalizedCfg.platforms[0].key]
            : prev.platforms,
          bodyTextColor: defaultBodyTextColor,
          bodyFontSizeBias: clampToRange(bodyRange.default, bodyRange),
          textFontSizeBias: clampToRange(textRange.default, textRange),
        }));
      })
      .catch(() => setConfigError('Failed to load render config. Try refreshing.'));
  }, []);

  const loadSavedRenders = async () => {
    setSavedLoading(true);
    setSavedError('');
    try {
      const response = await apiService.listSavedVcgRenders();
      if (!response.success) {
        setSavedError(response.error || 'Failed to load saved renders.');
        return;
      }
      setSavedRenders(response.data || []);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Failed to load saved renders.');
    } finally {
      setSavedLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedRenders();
  }, []);

  // Preset state
  const [selectedPreset, setSelectedPreset] = useState('');

  const applyPreset = (key: string) => {
    setSelectedPreset(key);
    const preset = PRESETS.find(p => p.key === key);
    if (preset) setForm(prev => ({ ...prev, ...preset.values }));
  };

  // Form & polling state
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [phase, setPhase] = useState<RenderPhase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [runUrl, setRunUrl] = useState('');
  const [artifacts, setArtifacts] = useState<Array<{ id: number; name: string }>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitFailedRef = useRef(false);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ─── Prefill from navigation state (e.g. "Render Video" button in SavedArticles) ──
  const location = useLocation();
  const vcgNavigate = useNavigate();

  useEffect(() => {
    const prefill = (location.state as { prefill?: Partial<FormState> } | null)?.prefill;
    if (prefill && Object.keys(prefill).length > 0) {
      setForm(prev => ({ ...prev, ...prefill }));
      vcgNavigate('/video', { replace: true, state: {} });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyLimit = vcgConfig ? getBodyLimit(form.platforms, vcgConfig.platforms) : 360;
  const bodyLen = form.body.length;
  const bodyOverLimit = bodyLen > bodyLimit;

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const togglePlatform = (key: string) =>
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(key)
        ? prev.platforms.filter(x => x !== key)
        : [...prev.platforms, key],
    }));

  // ─── Submit / Polling ──────────────────────────────────────────────────────

  const fail = (msg: string) => {
    submitFailedRef.current = true;
    setPhase('error');
    setStatusMsg(msg);
  };

  const submitRender = async () => {
    if (phase !== 'idle') return;
    submitFailedRef.current = false;
    setArtifacts([]);
    setRunUrl('');
    setSaveNotice('');

    // Validate
    if (form.platforms.length === 0) return fail('Select at least one platform.');
    if (form.template === 'reel') {
      if (!form.title.trim()) return fail('Title is required.');
      if (!form.hook.trim()) return fail('Hook is required.');
      if (!form.body.trim()) return fail('Body is required.');
      if (bodyOverLimit) return fail(`Body exceeds ${bodyLimit} character limit for selected platforms.`);
    } else {
      if (!form.heading.trim()) return fail('Heading is required.');
      if (!form.text.trim()) return fail('Text is required.');
    }

    // Build payload
    let payload: Record<string, unknown>;

    if (form.template === 'reel') {
      const hashtags = form.hashtags
        .split(',')
        .map(h => h.trim())
        .filter(Boolean)
        .map(h => (h.startsWith('#') ? h : `#${h}`));

      payload = {
        template: 'reel',
        platforms: form.platforms,
        pageName: form.pageName,
        title: form.title,
        hook: form.hook,
        body: form.body,
        ctaText: form.ctaText,
        hashtags,
        theme: form.theme,
        pace: form.pace,
        animationStyle: form.animationStyle,
        fontFamily: form.fontFamily,
        animationSpeed: form.animationSpeed,
        accentColor: form.accentColor,
        bodyTextColor: form.bodyTextColor,
        bodyFontSizeBias: form.bodyFontSizeBias,
        showProgressBar: form.showProgressBar,
        showPlatformBadge: form.showPlatformBadge,
        showSafeZoneGuides: form.showSafeZoneGuides,
      };
      if (form.audioPath.trim()) {
        payload.audioPath = form.audioPath.trim();
        payload.audioVolume = form.audioVolume;
      }
    } else {
      payload = {
        template: 'minimalText',
        platforms: form.platforms,
        heading: form.heading,
        text: form.text,
        fontFamily: form.fontFamily,
        durationSeconds: form.durationSeconds,
        headingColor: form.headingColor,
        textColor: form.textColor,
        textFontSizeBias: form.textFontSizeBias,
      };
    }

    // 1. Trigger workflow
    setPhase('triggering');
    setStatusMsg('Dispatching render workflow…');
    const triggeredAt = Date.now();

    try {
      await apiService.triggerVcgRender(payload, {
        template: form.template,
        title: getRenderTitle(form),
        description: getRenderDescription(form),
        platforms: form.platforms,
      });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? `HTTP ${err.response?.status}`)
        : String(err);
      return fail(`Trigger failed: ${msg}`);
    }

    // 2. Wait for run to appear
    setPhase('waiting-for-run');
    setStatusMsg('Waiting for GitHub Actions runner to pick up the job…');

    let runId: number | null = null;
    let runPoll = 0;

    await new Promise<void>((resolve, reject) => {
      const pollRun = async () => {
        if (runPoll++ >= MAX_RUN_POLLS) return reject(new Error('Timed out waiting for GitHub Actions runner to pick up the job (60s).'));
        try {
          const { run } = await apiService.getVcgRuns(triggeredAt);
          if (run) {
            runId = run.id;
            setRunUrl(run.html_url);
            return resolve();
          }
        } catch (err) {
          const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? `HTTP ${err.response?.status}`) : String(err);
          console.warn('[VCG] getVcgRuns error:', msg);
        }
        timerRef.current = setTimeout(pollRun, POLL_INTERVAL_RUN_MS);
      };
      pollRun();
    }).catch(err => fail(String(err)));

    if (!runId) return;

    // 3. Poll for completion
    setPhase('rendering');
    setStatusMsg('Rendering videos… this takes 1–5 minutes.');

    let statusPoll = 0;

    await new Promise<void>((resolve, reject) => {
      const pollStatus = async () => {
        if (statusPoll++ >= MAX_STATUS_POLLS) return reject(new Error('Render timed out after 12 minutes.'));
        try {
          const run = await apiService.getVcgRunStatus(runId!);
          const elapsed = Math.round(statusPoll * POLL_INTERVAL_STATUS_MS / 1000);
          setStatusMsg(`Rendering… (${elapsed}s elapsed)`);

          if (run.status === 'completed') {
            if (run.conclusion === 'success') return resolve();
            return reject(new Error(`Workflow ended with conclusion: ${run.conclusion}. Check the run for details.`));
          }
        } catch { /* retry */ }
        timerRef.current = setTimeout(pollStatus, POLL_INTERVAL_STATUS_MS);
      };
      pollStatus();
    }).catch(err => fail(String(err)));

    if (submitFailedRef.current) return;

    // 4. Fetch artifacts
    setStatusMsg('Fetching download links…');
    try {
      const { artifacts: arts } = await apiService.getVcgArtifacts(runId!);
      setArtifacts(arts);
      setPhase('done');
      setStatusMsg('Render complete! Download your videos below.');
      setSaveNotice('Saving this render in the background. It will still appear in Saved even if you refresh this page.');
      setTimeout(() => {
        void loadSavedRenders();
      }, 1500);
    } catch {
      fail('Render succeeded but failed to fetch artifacts. Visit the GitHub Actions run to download manually.');
    }
  };

  // ─── Download handler ──────────────────────────────────────────────────────

  const handleDownload = async (artifactId: number, name: string) => {
    try {
      await apiService.downloadVcgArtifact(artifactId, name);
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? `HTTP ${err.response?.status}`)
        : String(err);
      alert(`Download failed: ${msg}`);
    }
  };

  const handleDeleteSavedRender = async (id: string) => {
    try {
      const response = await apiService.deleteSavedVcgRender(id);
      if (!response.success) {
        setSavedError(response.error || 'Failed to delete saved render.');
        return;
      }
      setSavedRenders((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Failed to delete saved render.');
    }
  };

  // ─── Phase styling ─────────────────────────────────────────────────────────

  const phaseClass =
    phase === 'done'
      ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400'
      : phase === 'error'
      ? 'bg-red-950/30 border-red-500/20 text-red-400'
      : 'bg-white/[0.02] border-white/[0.06] text-zinc-400';

  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  // ─── Shared select renderer ────────────────────────────────────────────────

  const renderSelect = (key: keyof FormState, label: string, options: [string, string][]) => (
    <div key={key}>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <select
        value={form[key] as string}
        onChange={e => setField(key, e.target.value as FormState[typeof key])}
        className="glass-input w-full text-sm px-3 py-2 rounded-lg"
      >
        {options.map(([val, display]) => (
          <option key={val} value={val}>{display}</option>
        ))}
      </select>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (!vcgConfig && !configError) {
    return (
      <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up flex items-center justify-center min-h-[200px]">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading render config…
        </div>
      </main>
    );
  }

  // Error state
  if (configError) {
    return (
      <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up">
        <div className="rounded-lg px-4 py-3 text-sm border bg-red-950/30 border-red-500/20 text-red-400">
          {configError}
        </div>
      </main>
    );
  }

  const cfg = vcgConfig!;

  return (
    <main className="glass rounded-2xl p-6 sm:p-8 animate-fade-in-up space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">CaptionedVideoGenerator</h2>
        <p className="text-xs text-zinc-500">
          Render captioned social videos via{' '}
          <a
            href="https://github.com/sanyam158/VideoCreater"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
          >
            VideoCreater
          </a>{' '}
          GitHub Actions.
        </p>
      </div>

      <div className="flex gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
        {(
          [
            { key: 'current', label: 'Current Render' },
            { key: 'saved', label: `Saved (${savedRenders.length})` },
          ] as Array<{ key: VideoGenTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-red-600/20 text-red-300 border border-red-500/20'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'current' && (
        <>

      {/* ── Preset ── */}
      <section>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Preset
        </label>
        <select
          value={selectedPreset}
          onChange={e => applyPreset(e.target.value)}
          className="glass-input w-full text-sm px-3 py-2 rounded-lg"
        >
          <option value="">— None —</option>
          {PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </section>

      {/* ── Template ── */}
      {cfg.templates.length > 1 && (
        <section>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Template
          </label>
          <div className="flex gap-2">
            {cfg.templates.map(t => (
              <button
                key={t.key}
                onClick={() => setField('template', t.key)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  form.template === t.key
                    ? 'bg-red-600/10 border-red-500/30 text-red-300'
                    : 'border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Platforms ── */}
      <section>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Target Platforms
        </label>
        <div className="grid grid-cols-2 gap-2">
          {cfg.platforms.map(p => (
            <label
              key={p.key}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                form.platforms.includes(p.key)
                  ? 'bg-red-600/10 border-red-500/30 text-red-300'
                  : 'border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300'
              }`}
            >
              <input
                type="checkbox"
                className="accent-red-500"
                checked={form.platforms.includes(p.key)}
                onChange={() => togglePlatform(p.key)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </section>

      {/* ── Content: Reel ── */}
      {form.template === 'reel' && (
        <section className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Content
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Page / Handle</label>
              <input type="text" placeholder="@brand" value={form.pageName}
                onChange={e => setField('pageName', e.target.value)}
                className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">CTA Text</label>
              <input type="text" placeholder="Follow for more" value={form.ctaText}
                onChange={e => setField('ctaText', e.target.value)}
                className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Title <span className="text-red-400">*</span></label>
            <input type="text" placeholder="Your video title" value={form.title}
              onChange={e => setField('title', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Hook <span className="text-red-400">*</span></label>
            <input type="text" placeholder="Opening line that grabs attention" value={form.hook}
              onChange={e => setField('hook', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-500">Body <span className="text-red-400">*</span></label>
              <span className={`text-[11px] font-mono ${bodyOverLimit ? 'text-red-400' : bodyLen > bodyLimit * 0.85 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {bodyLen} / {bodyLimit}
              </span>
            </div>
            <textarea rows={5} placeholder={`Main content (max ${bodyLimit} chars for selected platforms)`}
              value={form.body} onChange={e => setField('body', e.target.value)}
              className={`glass-input w-full text-sm px-3 py-2 rounded-lg resize-none ${bodyOverLimit ? 'border-red-500/40' : ''}`} />
            {bodyOverLimit && (
              <p className="text-xs text-red-400 mt-1">Exceeds {bodyLimit} char limit — reduce text or deselect restrictive platforms.</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Hashtags <span className="text-zinc-600">(comma-separated)</span></label>
            <input type="text" placeholder="ai, tech, startup" value={form.hashtags}
              onChange={e => setField('hashtags', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
          </div>
        </section>
      )}

      {/* ── Content: Minimal Text ── */}
      {form.template === 'minimalText' && (
        <section className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Content
          </label>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Heading <span className="text-red-400">*</span></label>
            <input type="text" placeholder="Main heading (max 140 chars)" value={form.heading}
              onChange={e => setField('heading', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Text <span className="text-red-400">*</span></label>
            <textarea rows={4} placeholder="Body text (max 900 chars)" value={form.text}
              onChange={e => setField('text', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg resize-none" />
          </div>
        </section>
      )}

      {/* ── Style: Reel ── */}
      {form.template === 'reel' && (
        <section className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">Style</label>
          <div className="grid grid-cols-2 gap-3">
            {renderSelect('theme', 'Theme', cfg.themes)}
            {renderSelect('pace', 'Pace', cfg.pace)}
            {renderSelect('animationStyle', 'Animation', cfg.animationStyles)}
            {renderSelect('fontFamily', 'Font', cfg.fonts)}
            {renderSelect('animationSpeed', 'Speed', cfg.animationSpeeds)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Accent Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.accentColor}
                  onChange={e => setField('accentColor', e.target.value)}
                  className="h-9 w-14 rounded-lg cursor-pointer bg-transparent border border-white/[0.06]" />
                <input type="text" value={form.accentColor} maxLength={7} placeholder="#ff2d2d"
                  onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setField('accentColor', v); }}
                  className="glass-input text-sm px-3 py-2 rounded-lg w-28 font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Body Text Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.bodyTextColor}
                  onChange={e => setField('bodyTextColor', e.target.value)}
                  className="h-9 w-14 rounded-lg cursor-pointer bg-transparent border border-white/[0.06]" />
                <input type="text" value={form.bodyTextColor} maxLength={7} placeholder={cfg.defaultBodyTextColor}
                  onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setField('bodyTextColor', v); }}
                  className="glass-input text-sm px-3 py-2 rounded-lg w-28 font-mono" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-500">Body Font Size Bias</label>
              <span className="text-xs text-zinc-500 font-mono">{form.bodyFontSizeBias}</span>
            </div>
            <input
              type="range"
              min={cfg.bodyFontSizeBiasRange.min}
              max={cfg.bodyFontSizeBiasRange.max}
              step={cfg.bodyFontSizeBiasRange.step}
              value={form.bodyFontSizeBias}
              onChange={e => setField('bodyFontSizeBias', clampToRange(Number(e.target.value), cfg.bodyFontSizeBiasRange))}
              className="w-full accent-red-500"
            />
          </div>
        </section>
      )}

      {/* ── Style: Minimal Text ── */}
      {form.template === 'minimalText' && (
        <section className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">Style</label>
          <div className="grid grid-cols-2 gap-3">
            {renderSelect('fontFamily', 'Font', cfg.fonts)}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Duration (seconds)</label>
              <input type="number" min={2} max={12} value={form.durationSeconds}
                onChange={e => setField('durationSeconds', parseInt(e.target.value, 10) || 4)}
                className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-500">Text Font Size Bias</label>
              <span className="text-xs text-zinc-500 font-mono">{form.textFontSizeBias}</span>
            </div>
            <input
              type="range"
              min={cfg.textFontSizeBiasRange.min}
              max={cfg.textFontSizeBiasRange.max}
              step={cfg.textFontSizeBiasRange.step}
              value={form.textFontSizeBias}
              onChange={e => setField('textFontSizeBias', clampToRange(Number(e.target.value), cfg.textFontSizeBiasRange))}
              className="w-full accent-red-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['headingColor', 'textColor'] as const).map(key => (
              <div key={key}>
                <label className="block text-xs text-zinc-500 mb-1">{key === 'headingColor' ? 'Heading Color' : 'Text Color'}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form[key]}
                    onChange={e => setField(key, e.target.value)}
                    className="h-9 w-14 rounded-lg cursor-pointer bg-transparent border border-white/[0.06]" />
                  <input type="text" value={form[key]} maxLength={7}
                    onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setField(key, v); }}
                    className="glass-input text-sm px-3 py-2 rounded-lg w-28 font-mono" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Options (reel only) ── */}
      {form.template === 'reel' && (
        <section>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Options</label>
          <div className="space-y-2">
            {(
              [
                { key: 'showProgressBar', label: 'Show progress bar' },
                { key: 'showPlatformBadge', label: 'Show platform badge' },
                { key: 'showSafeZoneGuides', label: 'Show safe zone guides' },
              ] as Array<{ key: keyof FormState; label: string }>
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer text-sm text-zinc-400 hover:text-zinc-300 transition-colors">
                <input type="checkbox" className="accent-red-500"
                  checked={form[key] as boolean}
                  onChange={e => setField(key, e.target.checked as FormState[typeof key])} />
                {label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Audio (reel only) ── */}
      {form.template === 'reel' && (
        <section className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Audio <span className="text-zinc-600 font-normal normal-case">(optional)</span>
          </label>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Audio URL</label>
            <input type="url" placeholder="https://example.com/music.mp3" value={form.audioPath}
              onChange={e => setField('audioPath', e.target.value)}
              className="glass-input w-full text-sm px-3 py-2 rounded-lg" />
          </div>
          {form.audioPath.trim() && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-500">Volume</label>
                <span className="text-xs text-zinc-500 font-mono">{Math.round(form.audioVolume * 100)}%</span>
              </div>
              <input type="range" min={0.05} max={0.40} step={0.01} value={form.audioVolume}
                onChange={e => setField('audioVolume', parseFloat(e.target.value))}
                className="w-full accent-red-500" />
            </div>
          )}
        </section>
      )}

      {/* ── Status ── */}
      {phase !== 'idle' && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${phaseClass}`}>
          <div className="flex items-center gap-2">
            {isActive && (
              <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            <span>{statusMsg}</span>
          </div>
          {runUrl && (
            <a href={runUrl} target="_blank" rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2">
              View GitHub Actions run →
            </a>
          )}
          {saveNotice && (
            <p className="mt-2 text-xs text-zinc-500">{saveNotice}</p>
          )}
        </div>
      )}

      {/* ── Artifacts ── */}
      {phase === 'done' && artifacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Downloads</p>
          {artifacts.map(a => (
            <button key={a.id} onClick={() => handleDownload(a.id, a.name)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 transition text-sm font-medium w-full text-left">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {a.name}.zip
            </button>
          ))}
        </div>
      )}

      {/* ── Submit ── */}
      <button onClick={submitRender} disabled={phase !== 'idle' && phase !== 'error'}
        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition">
        {isActive ? 'Rendering…' : phase === 'done' ? 'Render Again' : 'Render Videos'}
      </button>

      {phase === 'done' && (
        <button
          onClick={() => { setPhase('idle'); setArtifacts([]); setRunUrl(''); setStatusMsg(''); setSaveNotice(''); }}
          className="btn-glass w-full py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 transition">
          Reset
        </button>
      )}
        </>
      )}

      {activeTab === 'saved' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Saved Downloads</h3>
              <p className="text-xs text-zinc-500">Completed renders saved across deployments.</p>
            </div>
            <button
              onClick={() => void loadSavedRenders()}
              className="btn-glass px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              Refresh
            </button>
          </div>

          {savedError && (
            <div className="rounded-lg px-4 py-3 text-sm border bg-red-950/30 border-red-500/20 text-red-400">
              {savedError}
            </div>
          )}

          {savedLoading ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-sm text-zinc-500">
              Loading saved renders...
            </div>
          ) : savedRenders.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-sm text-zinc-500">
              No saved video renders yet. Finish one in the Current Render tab and it will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {savedRenders.map((render) => (
                <article
                  key={render.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1">
                          {render.template}
                        </span>
                        <span className="text-[10px] text-zinc-600">{formatRenderDate(render.createdAt)}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-white truncate">{render.title}</h4>
                      {render.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{render.description}</p>
                      )}
                      <p className="text-[11px] text-zinc-600 mt-2">
                        Platforms: {render.platforms.join(', ')}
                      </p>
                    </div>

                    <button
                      onClick={() => void handleDeleteSavedRender(render.id)}
                      className="text-xs text-zinc-500 hover:text-red-300 transition"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={render.runUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-glass px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition"
                    >
                      View GitHub Run
                    </a>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Downloads</p>
                    {render.artifacts.map((artifact) => (
                      <button
                        key={`${render.id}-${artifact.id}`}
                        onClick={() => void handleDownload(artifact.id, artifact.name)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 transition text-sm font-medium w-full text-left"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {artifact.name}.zip
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
