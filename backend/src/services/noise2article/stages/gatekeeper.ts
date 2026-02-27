/**
 * =============================================================================
 * Noise2Article — Gatekeeper (Pre-filter + LLM Classifier)
 * =============================================================================
 *
 * Stage 1: Rule-based pre-filter (no LLM cost)
 *   - Score thresholds per source
 *   - Deduplication by title similarity
 *
 * Stage 2: LLM Gatekeeper (Gemini, batches of 10)
 *   - First-person check ("I built", "We used", "My workflow")
 *   - Specificity check (technical nouns, tool names)
 *   - Receipts check (links, numbers, concrete results)
 *   - Assigns banger_score 0-10 and reasoning
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { RawPost, FilteredPost, NicheContext, DEFAULT_NICHE_CONTEXT } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Gatekeeper] ${msg}`);
}

/** Simple word-overlap (Jaccard) for deduplication */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Parse JSON from LLM response (with robust fallback) */
function parseJsonResponse(text: string): any {
  // Strip markdown fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Some models emit newline-delimited objects inside [ ... ] without commas.
  // Heuristic: ensure there is a comma between } { pairs inside arrays.
  cleaned = cleaned.replace(/\}\s*\{/g, '},{');

  // Try extracting JSON array
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
  }

  // Try extracting JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  // Attempt to repair truncated JSON for arrays
  let jsonStr = cleaned;
  const openIdx = jsonStr.indexOf('[');
  if (openIdx >= 0) {
    jsonStr = jsonStr.substring(openIdx);
    // Repeat the } { -> },{ fix on this slice
    jsonStr = jsonStr.replace(/\}\s*\{/g, '},{');
    const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) jsonStr += '"';
    const ob = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    const oc = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
    jsonStr += '}'.repeat(Math.max(0, oc));
    jsonStr += ']'.repeat(Math.max(0, ob));
    try { return JSON.parse(jsonStr); } catch { /* fall through */ }
  }

  return null;
}

// ─── Stage 1: Rule-based Pre-filter ─────────────────────────────────────────

export function preFilter(posts: RawPost[]): RawPost[] {
  log(`Pre-filtering ${posts.length} posts (rule-based)...`);

  // 1. Deduplicate by title similarity
  const deduped: RawPost[] = [];
  for (const post of posts) {
    const isDupe = deduped.some(
      existing => jaccardSimilarity(existing.title, post.title) > 0.6
    );
    if (!isDupe) {
      deduped.push(post);
    }
  }
  const dupesRemoved = posts.length - deduped.length;
  if (dupesRemoved > 0) {
    log(`  Removed ${dupesRemoved} near-duplicates`);
  }

  // 2. Quick noise filter — remove spam, promo, unrelated, low-content
  const filtered = deduped.filter(post => {
    const text = `${post.title} ${post.body}`.toLowerCase();

    // Skip obvious spam / promo
    if (/\bcourse\b|\bnewsletter\b|\bsubscribe\b|\bcheck out my\b|\bfree ebook\b|\bdownload\b\s+(my|free)|dm\s+me\b/i.test(text)) {
      return false;
    }

    // Skip off-topic (politics, crypto pump, generic memes)
    if (/\belection\b|\btrump\b|\bbiden\b|\bhodl\b|\bto the moon\b|\bwagmi\b|\bnft\b\s+drop/i.test(text)) {
      return false;
    }

    // Skip very short posts with no substance
    if (post.title.length < 15 && post.body.length < 30) {
      return false;
    }

    return true;
  });

  log(`Pre-filter: ${posts.length} → ${filtered.length} posts (${posts.length - filtered.length} removed)`);
  return filtered;
}

// ─── Stage 2: LLM Gatekeeper ───────────────────────────────────────────────

function buildGatekeeperPrompt(platformDescriptor: string, specificityExamples: string): string {
  return `You are a Content Quality Classifier for a ${platformDescriptor}. Your job is to identify "banger" posts — content that could be turned into a viral, high-value article.

For each post, evaluate these THREE criteria:

1. FIRST-PERSON CHECK (Is it a personal story/experience?)
   - Contains "I built", "I used", "We switched to", "My workflow", "I automated", "Here's how I..."
   - First-person experience is usually best, BUT high-signal news can still be a banger if it has real technical details.

2. SPECIFICITY CHECK (Does it mention concrete tools/specifics?)
   - Named specifics: ${specificityExamples}, etc.
   - Specific versions, configs, numbers, or named entities
   - Generic buzzwords or vague claims = low score

3. RECEIPTS CHECK (Does it have proof/results?)
   - Links to GitHub, repos, demos
   - Specific numbers: "$500 MRR", "40% faster", "saved 10 hours"
   - Screenshots, benchmarks, comparisons

SCORING:
- 8-10: Strong banger. Has 2-3 checks. Clear article potential.
- 5-7: Decent. Has 1-2 checks. Could work with more context.
- 1-4: Noise. Generic, promotional, or vague. Skip.
- 0: Pure spam/noise.

NOTE: RSS/news posts can score 5-7 if they are concrete, specific, and timely (even if not first-person). Just don't keep fluff.

KEEP posts scoring >= 5. DISCARD below 5.

INPUT: A JSON array of posts.
OUTPUT: A JSON array of ONLY the kept posts (score >= 5), each with:
  {"id": "...", "banger_score": N, "reasoning": "one-line reason"}

CRITICAL FORMAT RULES:
- Output MUST start with [ and end with ]
- NO markdown fences, NO backticks, NO explanation text
- Each item is one line: {"id":"...","banger_score":N,"reasoning":"..."}
- Keep reasoning SHORT (max 15 words)`;
}

export async function llmGatekeeper(
  gemini: GoogleGenAI,
  posts: RawPost[],
  batchSize: number,
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<FilteredPost[]> {
  log(`LLM Gatekeeper: classifying ${posts.length} posts in batches of ${batchSize}...`);
  const allFiltered: FilteredPost[] = [];

  // Build prompt once for the entire run
  const gatekeeperPrompt = buildGatekeeperPrompt(
    nicheContext.platformDescriptor,
    nicheContext.specificityExamples,
  );

  // Process in batches
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(posts.length / batchSize);

    log(`  Batch ${batchNum}/${totalBatches} (${batch.length} posts)...`);

    // Format posts for LLM — keep it compact
    const postsForLLM = batch.map(p => ({
      id: p.id,
      source: p.source,
      title: p.title,
      body: p.body.substring(0, 300),
      score: p.score,
      comments: p.commentCount,
      has_link: p.hasLink,
      has_numbers: p.hasNumbers,
    }));

    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{
          role: 'user',
          parts: [{ text: `${gatekeeperPrompt}\n\nPOSTS:\n${JSON.stringify(postsForLLM)}\n\nJSON:` }],
        }],
        config: { temperature: 0.1, maxOutputTokens: 4096 },
      });

      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      const parsed = parseJsonResponse(rawText);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const originalPost = batch.find(p => p.id === item.id);
          if (originalPost && (item.banger_score ?? 0) >= 5) {
            allFiltered.push({
              ...originalPost,
              bangerScore: item.banger_score,
              reasoning: item.reasoning || '',
            });
          }
        }
        log(`  Batch ${batchNum}: ${parsed.length} kept out of ${batch.length}`);
      } else {
        // Debug: show what the LLM actually returned
        log(`  Batch ${batchNum}: JSON parse failed. Raw (first 300): ${rawText.substring(0, 300)}`);
        // Fallback: keep all with moderate score
        for (const p of batch) {
          allFiltered.push({ ...p, bangerScore: 5, reasoning: 'Fallback: LLM parse error' });
        }
      }
    } catch (err: any) {
      log(`  Batch ${batchNum}: ERROR — ${err.message}. Keeping all with default score.`);
      for (const p of batch) {
        allFiltered.push({ ...p, bangerScore: 5, reasoning: 'Fallback: LLM call failed' });
      }
    }
  }

  // Sort by banger score descending
  allFiltered.sort((a, b) => b.bangerScore - a.bangerScore);

  log(`LLM Gatekeeper done: ${allFiltered.length} posts kept (from ${posts.length})`);
  return allFiltered;
}
