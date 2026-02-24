/**
 * =============================================================================
 * Noise2Article — API Routes
 * =============================================================================
 *
 * POST /api/n2a/discover — Run the full Noise2Article pipeline
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { Composio } from '@composio/core';
import { GoogleGenAI } from '@google/genai';
import { runPipeline, DEFAULT_CONFIG, NICHE_PRESETS, getNichePreset, DEFAULT_NICHE_CONTEXT } from '../services/noise2article/index.js';
import type { PipelineConfig } from '../services/noise2article/index.js';
import { listSavedArticles, getSavedArticle, deleteSavedArticle, updateArticleImage } from '../services/noise2article/storage.js';
import { buildMasterPrompt, generateCreativePrompt, type ImagePromptStrategy } from '../services/noise2article/imagePrompts.js';
import ImageService from '../services/imageService.js';

const router = Router();

// Lazy-init clients (initialized on first request after dotenv is loaded)
let composio: Composio | null = null;
let gemini: GoogleGenAI | null = null;

function getComposio(): Composio {
  if (!composio) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error('COMPOSIO_API_KEY not set');
    composio = new Composio({ apiKey });
  }
  return composio;
}

function getGemini(): GoogleGenAI {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    gemini = new GoogleGenAI({ apiKey });
  }
  return gemini;
}

// ─── POST /discover — Run the full pipeline ─────────────────────────────────

router.post('/discover', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey) {
      return res.status(500).json({ error: 'TAVILY_API_KEY not set' });
    }

    const userId = req.body?.userId
      || req.headers['x-user-id']
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

    console.log(`\n[N2A] Starting Noise2Article pipeline for user ${userId}...`);

    const result = await runPipeline(
      getComposio(),
      getGemini(),
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

// ─── GET /articles — list saved generated articles ──────────────────────────
router.get('/articles', async (_req: Request, res: Response) => {
  try {
    const items = await listSavedArticles();
    return res.json({ success: true, data: items });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to list articles' });
  }
});

// ─── GET /articles/:id — fetch a saved article ──────────────────────────────
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

// ─── DELETE /articles/:id — delete a saved article ─────────────────────────
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

// ─── POST /articles/:id/regenerate-image — regenerate article header image ─
router.post('/articles/:id/regenerate-image', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const article = await getSavedArticle(id);
    if (!article) return res.status(404).json({ success: false, error: 'Not found' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not set' });

    const customPrompt = req.body?.prompt as string | undefined;
    const refB64 = req.body?.referenceImageBase64 as string | undefined;
    const refMime = req.body?.referenceImageMimeType as string | undefined;

    const imageService = new ImageService(apiKey);

    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else {
      // Use AI art director (auto mode) for better, unique images
      prompt = await generateCreativePrompt(getGemini(), article.title, article.hook);
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

// ─── POST /articles/:id/edit-image — edit article image with conversation history ─
router.post('/articles/:id/edit-image', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const article = await getSavedArticle(id);
    if (!article) return res.status(404).json({ success: false, error: 'Not found' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not set' });

    const editPrompt = req.body?.editPrompt as string;
    const conversationHistory = req.body?.conversationHistory as any[];

    if (!editPrompt?.trim()) return res.status(400).json({ success: false, error: 'editPrompt is required' });
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ success: false, error: 'conversationHistory is required' });
    }

    const imageService = new ImageService(apiKey);
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

// ─── POST /test-image — test master prompts with sample titles ──────────────
router.post('/test-image', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not set' });

    const title = String(req.body?.title || '').trim();
    const strategy = (req.body?.promptStrategy as ImagePromptStrategy) || 'auto';
    const refB64 = req.body?.referenceImageBase64 as string | undefined;
    const refMime = req.body?.referenceImageMimeType as string | undefined;

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const prompt = strategy === 'auto'
      ? await generateCreativePrompt(getGemini(), title)
      : buildMasterPrompt(title, strategy);
    const refImages = refB64 && refMime ? [{ base64: refB64, mimeType: refMime }] : undefined;

    const imageService = new ImageService(apiKey);
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
