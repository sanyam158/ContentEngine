/**
 * =============================================================================
 * Noise2Article â€” API Routes
 * =============================================================================
 *
 * POST /api/n2a/discover â€” Run the full Noise2Article pipeline
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { Composio } from '@composio/core';
import { GoogleGenAI } from '@google/genai';
import { GeminiKeyRotator, parseGeminiApiKeys } from '../services/geminiKeyRotator.js';
import { runPipeline, DEFAULT_CONFIG, NICHE_PRESETS, getNichePreset, DEFAULT_NICHE_CONTEXT } from '../services/noise2article/index.js';
import type { PipelineConfig, RepurposedPlatform } from '../services/noise2article/index.js';
import { listSavedArticles, getSavedArticle, deleteSavedArticle, updateArticleImage, updateArticleNiche, updateArticleRepurposed } from '../services/noise2article/storage.js';
import { repurposeFromArticle } from '../services/noise2article/stages/writer.js';
import { buildMasterPrompt, generateCreativePrompt, type ImagePromptStrategy } from '../services/noise2article/stages/imagePrompts.js';
import ImageService from '../services/imageService.js';

const router = Router();

// Lazy-init clients (initialized on first request after dotenv is loaded)
let composio: Composio | null = null;
let gemini: GeminiKeyRotator | null = null;

function getComposio(): Composio {
  if (!composio) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error('COMPOSIO_API_KEY not set');
    composio = new Composio({ apiKey });
  }
  return composio;
}

function getGemini(): GeminiKeyRotator {
  if (!gemini) {
    const keys = parseGeminiApiKeys();
    if (!keys.length) throw new Error('GEMINI_API_KEY or GEMINI_API_KEYS not set');
    gemini = new GeminiKeyRotator(keys);
  }
  return gemini;
}

/** Resolves the first available Gemini API key string (for ImageService constructor). */
function getFirstGeminiKey(): string {
  const keys = parseGeminiApiKeys();
  if (!keys.length) throw new Error('GEMINI_API_KEY or GEMINI_API_KEYS not set');
  return keys[0];
}

// â”€â”€â”€ POST /discover â€” Run the full pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/discover', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey) {
      return res.status(500).json({ error: 'TAVILY_API_KEY not set' });
    }

    const headerUserId = Array.isArray(req.headers['x-user-id'])
      ? req.headers['x-user-id'][0]
      : req.headers['x-user-id'];

    const userId = headerUserId
      || req.body?.userId
      || process.env.DEFAULT_USER_ID
      || 'default-user';

    // Layer 1: start with the default config
    let config: PipelineConfig = { ...DEFAULT_CONFIG };

    // Layer 2: apply niche preset if provided
    const nicheId = req.body?.niche as string | undefined;
    if (nicheId) {
      const preset = getNichePreset(nicheId);
      if (!preset) {
        return res.status(400).json({
          success: false,
          error: `Unknown niche "${nicheId}". Valid niches: ${Object.keys(NICHE_PRESETS).join(', ')}`,
        });
      }
      config = { ...config, ...preset.configOverrides, nicheContext: preset.context };
      console.log(`\n[N2A] Niche preset applied: ${nicheId}`);
    } else {
      config.nicheContext = DEFAULT_NICHE_CONTEXT;
    }

    // Layer 3: per-request overrides (take priority over preset)
    if (req.body?.topThemesToEnrich) {
      config.topThemesToEnrich = req.body.topThemesToEnrich;
    }
    if (req.body?.twitterAccounts && Array.isArray(req.body.twitterAccounts)) {
      config.twitterAccounts = req.body.twitterAccounts;
    }
    if (req.body?.platforms && Array.isArray(req.body.platforms)) {
      config.platforms = req.body.platforms as RepurposedPlatform[];
    }

    console.log(`\n[N2A] Starting Noise2Article pipeline for user ${userId}...`);

    const result = await runPipeline(
      getComposio(),
      getGemini() as unknown as GoogleGenAI,
      tavilyApiKey,
      String(userId),
      config,
    );

    return res.json({
      success: true,
      data: result,
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error('[N2A] Pipeline error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Pipeline failed',
      durationMs: Date.now() - startTime,
    });
  }
});

// â”€â”€â”€ GET /articles â€” list saved generated articles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/articles', async (_req: Request, res: Response) => {
  try {
    const items = await listSavedArticles();
    return res.json({ success: true, data: items });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list articles' });
  }
});

// â”€â”€â”€ GET /articles/:id â€” fetch a saved article â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/articles/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const item = await getSavedArticle(id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: item });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to load article' });
  }
});

// â”€â”€â”€ DELETE /articles/:id â€” delete a saved article â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/articles/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const deleted = await deleteSavedArticle(id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete article' });
  }
});

// â”€â”€â”€ PATCH /articles/:id â€” update article metadata (e.g. niche) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/articles/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const niche = req.body?.niche as string | undefined;
    if (!niche?.trim()) return res.status(400).json({ success: false, error: 'niche is required' });
    const updated = await updateArticleNiche(id, niche.trim());
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update article' });
  }
});

// â”€â”€â”€ POST /articles/:id/regenerate-image â€” regenerate article header image â”€
router.post('/articles/:id/regenerate-image', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const article = await getSavedArticle(id);
    if (!article) return res.status(404).json({ success: false, error: 'Not found' });

    const customPrompt = req.body?.prompt as string | undefined;
    const refB64 = req.body?.referenceImageBase64 as string | undefined;
    const refMime = req.body?.referenceImageMimeType as string | undefined;

    const imageService = new ImageService(getFirstGeminiKey());

    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else {
      // Use AI art director (auto mode) for better, unique images
      prompt = await generateCreativePrompt(getGemini() as unknown as GoogleGenAI, article.title, article.hook);
    }

    const refImages = refB64 && refMime ? [{ base64: refB64, mimeType: refMime }] : undefined;
    const result = await imageService.generateImage(prompt, refImages, undefined, '16:9');

    const updated = await updateArticleImage(id, {
      base64: result.base64,
      mimeType: result.mimeType,
      prompt: result.prompt,
    });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Image generation failed' });
  }
});

// â”€â”€â”€ POST /articles/:id/edit-image â€” edit article image with conversation history â”€
router.post('/articles/:id/edit-image', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const article = await getSavedArticle(id);
    if (!article) return res.status(404).json({ success: false, error: 'Not found' });

    const editPrompt = req.body?.editPrompt as string;
    const conversationHistory = req.body?.conversationHistory as any[];

    if (!editPrompt?.trim()) return res.status(400).json({ success: false, error: 'editPrompt is required' });
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ success: false, error: 'conversationHistory is required' });
    }

    const imageService = new ImageService(getFirstGeminiKey());
    const result = await imageService.editImage(editPrompt, {
      base64: '',
      mimeType: '',
      prompt: '',
      conversationHistory,
    });

    const updated = await updateArticleImage(id, {
      base64: result.base64,
      mimeType: result.mimeType,
      prompt: result.prompt,
    });

    return res.json({
      success: true,
      data: updated,
      conversationHistory: result.conversationHistory,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Image editing failed' });
  }
});

// â”€â”€â”€ POST /test-image â€” test master prompts with sample titles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ─── POST /articles/:id/repurpose ─── generate platform content on-demand ────
router.post('/articles/:id/repurpose', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const platforms = req.body?.platforms as RepurposedPlatform[] | undefined;

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ success: false, error: 'platforms array is required' });
    }

    const article = await getSavedArticle(id);
    if (!article) return res.status(404).json({ success: false, error: 'Not found' });

    const repurposed = await repurposeFromArticle(
      getGemini() as unknown as GoogleGenAI,
      article,
      platforms,
    );

    const updated = await updateArticleRepurposed(id, repurposed);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[N2A] Repurpose error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Repurpose failed' });
  }
});

router.post('/test-image', async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title || '').trim();
    const strategy = (req.body?.promptStrategy as ImagePromptStrategy) || 'auto';
    const refB64 = req.body?.referenceImageBase64 as string | undefined;
    const refMime = req.body?.referenceImageMimeType as string | undefined;

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const prompt = strategy === 'auto'
      ? await generateCreativePrompt(getGemini() as unknown as GoogleGenAI, title)
      : buildMasterPrompt(title, strategy);
    const refImages = refB64 && refMime ? [{ base64: refB64, mimeType: refMime }] : undefined;

    const imageService = new ImageService(getFirstGeminiKey());
    const result = await imageService.generateImage(prompt, refImages, undefined, '16:9');

    return res.json({
      success: true,
      data: {
        base64: result.base64,
        mimeType: result.mimeType,
        prompt: result.prompt,
        strategy,
        title,
      },
    });
  } catch (err: any) {
    console.error('[N2A] Test image error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Image generation failed' });
  }
});

export default router;
