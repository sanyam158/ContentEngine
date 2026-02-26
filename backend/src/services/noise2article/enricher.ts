/**
 * =============================================================================
 * Noise2Article — Context Enricher (Brain/Router + Tavily)
 * =============================================================================
 *
 * Reuses the agentic Router-Receiver pattern from the Fast React pipeline:
 *
 *   1. Brain (Gemini LLM) analyzes each theme and decides whether
 *      external search is needed, generating 1-3 optimized queries.
 *   2. Tavily Search is called conditionally for each query.
 *   3. Results are deduplicated and attached to the theme.
 *
 * Only the top N themes get enriched to save Tavily credits.
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { Theme, TavilyContextItem, NicheContext, DEFAULT_NICHE_CONTEXT } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Enricher] ${msg}`);
}

function currentDateContext(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface BrainAnalysis {
  needs_search: boolean;
  search_queries: string[];
  reasoning: string;
}

function parseJsonResponse(text: string): any {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  // Attempt repair
  const openIdx = cleaned.indexOf('{');
  if (openIdx >= 0) {
    let jsonStr = cleaned.substring(openIdx);
    const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) jsonStr += '"';
    const ob = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    const oc = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
    jsonStr += ']'.repeat(Math.max(0, ob));
    jsonStr += '}'.repeat(Math.max(0, oc));
    try { return JSON.parse(jsonStr); } catch { /* fall through */ }
  }

  return null;
}

// ─── Brain: Analyze theme and decide if search is needed ────────────────────

function buildBrainPrompt(platformDescriptor: string): string {
  return `You are a Search Intelligence Agent for a ${platformDescriptor}. Today is {DATE}.

Analyze a content theme and decide whether external web search is needed to enrich an article about it with up-to-date facts, context, or verification.

RULES:
- needs_search = TRUE when the theme involves: product launches, funding, research papers, technical claims, model comparisons, industry trends, or any factual assertion that benefits from verification.
- needs_search = FALSE when the theme is: purely opinion-based, motivational, personal workflow with no external claims, or too broad to search effectively.

QUERY GENERATION (only when needs_search = TRUE):
1. Generate 1-3 search queries, each targeting a DIFFERENT angle.
2. Strip ALL conversational fluff.
3. Extract ENTITIES: product names, models, companies, people, institutions.
4. Identify the ACTION: "raised" → "funding round", "shipped" → "released", etc.
5. Each query: 3-8 words, optimized for Google/news search. Include year if news-related.
6. Think: "What would a journalist Google to write about this?"

OUTPUT ONLY valid JSON:
{"needs_search": boolean, "search_queries": string[], "reasoning": "one line"}`;
}

async function analyzeTheme(
  gemini: GoogleGenAI,
  theme: Theme,
  brainPrompt: string,
): Promise<BrainAnalysis> {
  // Compact theme summary for the Brain
  const themeSummary = [
    `Theme: ${theme.name}`,
    `Description: ${theme.description}`,
    `Posts (${theme.posts.length}):`,
    ...theme.posts.map(p => `  - [${p.source}] ${p.title}`),
  ].join('\n');

  const prompt = brainPrompt.replace('{DATE}', currentDateContext());

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{
        role: 'user',
        parts: [{ text: `${prompt}\n\nANALYZE THEME:\n${themeSummary}\n\nJSON:` }],
      }],
      config: { temperature: 0.15, maxOutputTokens: 1024 },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const parsed = parseJsonResponse(text);

    if (parsed) {
      return {
        needs_search: parsed.needs_search === true,
        search_queries: Array.isArray(parsed.search_queries)
          ? parsed.search_queries.map((q: string) => String(q).substring(0, 120))
          : [],
        reasoning: parsed.reasoning || '',
      };
    }
  } catch (err: any) {
    log(`Brain error for "${theme.name}": ${err.message}`);
  }

  // Fallback: search using theme name
  return {
    needs_search: true,
    search_queries: [theme.name],
    reasoning: 'Fallback: brain call failed',
  };
}

// ─── Tavily Search ──────────────────────────────────────────────────────────

async function runTavilySearch(
  apiKey: string,
  query: string,
): Promise<TavilyContextItem[]> {
  try {
    const resp = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
        chunks_per_source: 3,
        include_answer: false,
        topic: 'news',
        time_range: 'week',
        exclude_domains: ['twitter.com', 'x.com', 'reddit.com'],
      },
      { timeout: 20000 },
    );

    const results = resp.data?.results || [];
    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.content || '').substring(0, 300),
      score: r.score || 0,
    }));
  } catch (err: any) {
    log(`Tavily search error for "${query}": ${err.message}`);
    return [];
  }
}

// ─── Main Enricher ──────────────────────────────────────────────────────────

export async function enrichThemes(
  gemini: GoogleGenAI,
  tavilyApiKey: string,
  themes: Theme[],
  topN: number,
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<Theme[]> {
  log(`Enriching top ${topN} themes with Tavily context...`);

  const enriched: Theme[] = [...themes];

  // Build the brain prompt once for the entire run
  const brainPrompt = buildBrainPrompt(nicheContext.platformDescriptor);

  // Only enrich the top N themes
  const toEnrich = enriched.slice(0, topN);

  for (const theme of toEnrich) {
    log(`  Theme: "${theme.name}" (rank #${theme.overallRank})`);

    // Step 1: Brain decides if search is needed
    const analysis = await analyzeTheme(gemini, theme, brainPrompt);
    log(`    Brain: needs_search=${analysis.needs_search}, queries=${analysis.search_queries.length}`);
    log(`    Reasoning: ${analysis.reasoning}`);

    if (!analysis.needs_search || analysis.search_queries.length === 0) {
      log(`    Skipping Tavily (no search needed)`);
      continue;
    }

    // Step 2: Run Tavily for each query
    const allResults: TavilyContextItem[] = [];
    const seenUrls = new Set<string>();

    for (const query of analysis.search_queries) {
      log(`    Tavily: "${query}"`);
      const results = await runTavilySearch(tavilyApiKey, query);

      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }

    // Keep top 5 unique results by score
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    theme.tavilyContext = allResults.slice(0, 5);

    log(`    Got ${theme.tavilyContext.length} unique sources`);
  }

  log(`Enrichment complete`);
  return enriched;
}
