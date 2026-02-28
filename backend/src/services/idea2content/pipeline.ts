/**
 * =============================================================================
 * Idea2Content — Pipeline Orchestrator
 * =============================================================================
 *
 * Purpose-built pipeline for idea-driven content generation.
 * Replaces the previous approach (which shoehorned a user prompt into the
 * noise2article enricher with an empty posts[] Theme).
 *
 * Stages:
 *   1. Research   — Gemini Flash generates queries → Tavily advanced search
 *   2. Write      — Gemini Pro writes article from idea + research brief
 *   3. Repurpose  — (optional) LinkedIn / Instagram via repurposeFromArticle()
 *   4. Save       — saveGeneratedArticles() (multi-backend storage)
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { GeneratedArticle, NicheContext, DEFAULT_NICHE_CONTEXT, RepurposedPlatform } from '../noise2article/types.js';
import { repurposeFromArticle } from '../noise2article/stages/writer.js';
import { saveGeneratedArticles } from '../noise2article/storage.js';
import { researchIdea, ResearchResult } from './researcher.js';
import { writeArticleFromIdea } from './ideaWriter.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Idea2Content] ${msg}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Idea2ContentResult {
  article: GeneratedArticle | null;
  research: ResearchResult;
  stages: Array<{ stage: string; durationMs: number; detail: string }>;
  totalDurationMs: number;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export async function runIdea2ContentPipeline(
  gemini: GoogleGenAI,
  tavilyApiKey: string,
  prompt: string,
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
  platforms: RepurposedPlatform[] = [],
  onProgress?: (stage: string, detail: string) => void,
): Promise<Idea2ContentResult> {
  const start = Date.now();
  const stages: Idea2ContentResult['stages'] = [];

  const report = (stage: string, detail: string) => {
    log(`${stage}: ${detail}`);
    onProgress?.(stage, detail);
  };

  // ─── Stage 1: Research ────────────────────────────────────────────────────
  report('research', `Searching for context on: "${prompt.slice(0, 60)}"`);
  const researchStart = Date.now();

  const research = await researchIdea(gemini, tavilyApiKey, prompt, nicheContext);

  stages.push({
    stage: 'research',
    durationMs: Date.now() - researchStart,
    detail: research.sources.length > 0
      ? `${research.sources.length} sources via [${research.queries.join(', ')}]`
      : 'No Tavily results - writing from model knowledge',
  });
  report('research', `Done: ${research.sources.length} sources found`);

  // ─── Stage 2: Write article + repurpose in parallel ──────────────────────
  const writeLabel = platforms.length
    ? `Writing article + ${platforms.join(', ')} content`
    : 'Writing article';
  report('writing', writeLabel + '...');
  const writeStart = Date.now();

  const article = await writeArticleFromIdea(gemini, prompt, research, nicheContext);

  // Repurpose from the finished article (reuses noise2article repurpose path B)
  let repurposed: GeneratedArticle['repurposed'];
  if (article && platforms.length) {
    try {
      repurposed = await repurposeFromArticle(gemini, article, platforms);
    } catch (err: any) {
      log(`Repurpose failed (non-fatal): ${err.message}`);
    }
  }

  if (article) {
    if (repurposed && Object.keys(repurposed).length) {
      article.repurposed = repurposed;
    }
    try {
      await saveGeneratedArticles([article]);
      log(`Saved: "${article.title}"`);
    } catch (err: any) {
      log(`Save failed (non-fatal): ${err.message}`);
    }
  }

  stages.push({
    stage: 'writing',
    durationMs: Date.now() - writeStart,
    detail: article ? `"${article.title}"` : 'FAILED — no article generated',
  });
  report('writing', article ? `Done: "${article.title}"` : 'FAILED');

  return {
    article,
    research,
    stages,
    totalDurationMs: Date.now() - start,
  };
}
