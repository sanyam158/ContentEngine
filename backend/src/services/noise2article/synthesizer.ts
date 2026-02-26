/**
 * =============================================================================
 * Noise2Article — Theme Synthesizer + Ranker
 * =============================================================================
 *
 * Takes filtered "banger" posts and:
 *   1. Groups them into themes (e.g., "Claude Code workflows")
 *   2. Ranks themes by virality, uniqueness, timeliness
 *
 * Single LLM call handles both grouping and ranking to save tokens.
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { FilteredPost, Theme, NicheContext, DEFAULT_NICHE_CONTEXT } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Synthesizer] ${msg}`);
}

/** Parse JSON from LLM response */
function parseJsonResponse(text: string): any {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
  }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  // Attempt repair for truncated JSON
  let jsonStr = cleaned;
  const openIdx = jsonStr.indexOf('[');
  if (openIdx >= 0) {
    jsonStr = jsonStr.substring(openIdx);
    const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) jsonStr += '"';
    const oc = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
    const ob = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    jsonStr += '}'.repeat(Math.max(0, oc));
    jsonStr += ']'.repeat(Math.max(0, ob));
    try { return JSON.parse(jsonStr); } catch { /* fall through */ }
  }

  return null;
}

function currentDateContext(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Synthesize + Rank ──────────────────────────────────────────────────────

function buildSynthesizerPrompt(brandVoice: string): string {
  return `You are a Content Strategist for a ${brandVoice}. Today is {DATE}.

You are given a list of high-quality posts from Reddit, Hacker News, and Twitter.
Your job is to:

1. GROUP posts into THEMES (common topics people are discussing)
   - A theme groups 2+ posts from potentially different sources
   - If a post doesn't fit any theme, it can be its own single-post theme
   - Aim for 5-8 themes total

2. RANK each theme on three dimensions (each 1-10):
   - VIRALITY: How likely is this to go viral on X/Twitter? Controversial opinions, counter-intuitive takes, "you're doing it wrong" angles score highest.
   - UNIQUENESS: How novel/fresh is this? Everyone-knows-this = low. Hidden gem = high.
   - TIMELINESS: Is this trending RIGHT NOW? Breaking news/launches score highest.

3. Assign an OVERALL RANK (1 = best) based on the combination.

INPUT: JSON array of filtered posts with id, source, title, body, banger_score.

OUTPUT: A JSON array of themes, sorted by overall rank (best first):
[
  {
    "name": "Short catchy theme name",
    "description": "2-3 sentence description of the theme and why it's article-worthy",
    "post_ids": ["id1", "id2"],
    "virality_score": 8,
    "uniqueness_score": 7,
    "timeliness_score": 9,
    "overall_rank": 1
  }
]

CRITICAL FORMAT RULES:
- Every post_id MUST be a valid id from the input
- Aim for 5-8 themes
- Output MUST start with [ and end with ]
- NO markdown fences, NO backticks, NO explanation text
- Keep theme names SHORT (3-6 words)
- Keep descriptions to 1-2 sentences max`;
}

export async function synthesizeAndRank(
  gemini: GoogleGenAI,
  posts: FilteredPost[],
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<Theme[]> {
  log(`Synthesizing ${posts.length} filtered posts into themes...`);

  if (posts.length === 0) {
    log('No posts to synthesize');
    return [];
  }

  // Cap to top 25 posts by banger score to avoid overwhelming the LLM
  const MAX_POSTS_FOR_SYNTHESIS = 25;
  const topPosts = posts.length > MAX_POSTS_FOR_SYNTHESIS
    ? posts.slice(0, MAX_POSTS_FOR_SYNTHESIS)
    : posts;

  if (posts.length > MAX_POSTS_FOR_SYNTHESIS) {
    log(`  Capped from ${posts.length} to ${topPosts.length} posts (top by banger score)`);
  }

  // Format posts compactly for LLM — only title + source, no body (saves tokens)
  const postsForLLM = topPosts.map(p => ({
    id: p.id,
    source: p.source,
    title: p.title,
    score: p.bangerScore,
    sub: p.subreddit || undefined,
  }));

  const prompt = buildSynthesizerPrompt(nicheContext.brandVoice).replace('{DATE}', currentDateContext());

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{
        role: 'user',
        parts: [{ text: `${prompt}\n\nPOSTS (${topPosts.length}):\n${JSON.stringify(postsForLLM)}\n\nJSON:` }],
      }],
      config: { temperature: 0.3, maxOutputTokens: 8192 },
    });

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const parsed = parseJsonResponse(rawText);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      log(`LLM returned invalid response. Raw (first 500): ${rawText.substring(0, 500)}`);
      log('Creating default themes as fallback.');
      return createFallbackThemes(topPosts);
    }

    // Map LLM output to Theme objects
    const themes: Theme[] = [];
    for (const raw of parsed) {
      const postIds: string[] = raw.post_ids || [];
      const themePosts = postIds
        .map((id: string) => topPosts.find(p => p.id === id))
        .filter((p): p is FilteredPost => !!p);

      if (themePosts.length === 0) continue;

      themes.push({
        id: `theme_${themes.length + 1}`,
        name: raw.name || 'Unnamed Theme',
        description: raw.description || '',
        posts: themePosts,
        viralityScore: clamp(raw.virality_score ?? 5, 1, 10),
        uniquenessScore: clamp(raw.uniqueness_score ?? 5, 1, 10),
        timelinessScore: clamp(raw.timeliness_score ?? 5, 1, 10),
        overallRank: raw.overall_rank ?? (themes.length + 1),
      });
    }

    // Sort by overall rank
    themes.sort((a, b) => a.overallRank - b.overallRank);

    // Catch any orphaned posts (not assigned to any theme)
    const assignedIds = new Set(themes.flatMap(t => t.posts.map(p => p.id)));
    const orphans = topPosts.filter(p => !assignedIds.has(p.id));
    if (orphans.length > 0) {
      log(`  ${orphans.length} orphaned posts — creating misc theme`);
      themes.push({
        id: `theme_misc`,
        name: 'Other Notable Posts',
        description: 'Posts that did not clearly cluster into a main theme.',
        posts: orphans,
        viralityScore: 4,
        uniquenessScore: 4,
        timelinessScore: 4,
        overallRank: themes.length + 1,
      });
    }

    log(`Synthesis complete: ${themes.length} themes from ${topPosts.length} posts`);
    return themes;
  } catch (err: any) {
    log(`ERROR: ${err.message}. Creating fallback themes.`);
    return createFallbackThemes(topPosts);
  }
}

// ─── Fallback ───────────────────────────────────────────────────────────────

function createFallbackThemes(posts: FilteredPost[]): Theme[] {
  // Group by source as a simple fallback
  const bySource = new Map<string, FilteredPost[]>();
  for (const p of posts) {
    const key = p.source;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(p);
  }

  const themes: Theme[] = [];
  let rank = 1;
  for (const [source, sourcePosts] of bySource) {
    const sorted = sourcePosts.sort((a, b) => b.bangerScore - a.bangerScore);
    // Build a description from top post titles
    const topTitles = sorted.slice(0, 3).map(p => `"${p.title.substring(0, 80)}"`).join(', ');
    themes.push({
      id: `theme_fallback_${source}`,
      name: `Top ${source.charAt(0).toUpperCase() + source.slice(1)} Posts`,
      description: `Auto-grouped from ${source}. Top posts: ${topTitles}`,
      posts: sorted,
      viralityScore: 5,
      uniquenessScore: 5,
      timelinessScore: 5,
      overallRank: rank++,
    });
  }

  return themes;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
