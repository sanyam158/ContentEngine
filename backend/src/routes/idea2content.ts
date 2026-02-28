/**
 * =============================================================================
 * Idea2Content — API Routes
 * =============================================================================
 *
 * POST /api/i2c/generate — Run the Idea2Content pipeline
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { GeminiKeyRotator, parseGeminiApiKeys } from '../services/geminiKeyRotator.js';
import { runIdea2ContentPipeline } from '../services/idea2content/index.js';
import { getNichePreset, DEFAULT_NICHE_CONTEXT } from '../services/noise2article/types.js';
import type { RepurposedPlatform } from '../services/noise2article/types.js';

const router = Router();

// Lazy-init Gemini client
let gemini: GeminiKeyRotator | null = null;

function getGemini(): GeminiKeyRotator {
  if (!gemini) {
    const keys = parseGeminiApiKeys();
    if (!keys.length) throw new Error('GEMINI_API_KEY or GEMINI_API_KEYS not set');
    gemini = new GeminiKeyRotator(keys);
  }
  return gemini;
}

// ─── POST /generate ──────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey) {
      return res.status(500).json({ error: 'TAVILY_API_KEY not set' });
    }

    const { prompt, niche, platforms } = req.body as {
      prompt?: string;
      niche?: string;
      platforms?: RepurposedPlatform[];
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Resolve niche context
    let nicheContext = DEFAULT_NICHE_CONTEXT;
    if (niche) {
      const preset = getNichePreset(niche);
      if (!preset) {
        return res.status(400).json({ error: `Unknown niche: "${niche}"` });
      }
      nicheContext = preset.context;
    }

    // Validate platforms
    const validPlatforms: RepurposedPlatform[] = ['linkedin', 'instagram'];
    const selectedPlatforms: RepurposedPlatform[] = Array.isArray(platforms)
      ? platforms.filter((p): p is RepurposedPlatform => validPlatforms.includes(p))
      : [];

    console.log(`[Idea2Content] generate: niche=${nicheContext.id}, platforms=[${selectedPlatforms.join(', ')}], prompt="${prompt.slice(0, 60)}..."`);

    const result = await runIdea2ContentPipeline(
      getGemini(),
      tavilyApiKey,
      prompt.trim(),
      nicheContext,
      selectedPlatforms,
    );

    return res.json({
      success: true,
      data: {
        article: result.article,
        research: result.research,
        stages: result.stages,
        totalDurationMs: result.totalDurationMs,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (err: any) {
    console.error('[Idea2Content] generate error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
