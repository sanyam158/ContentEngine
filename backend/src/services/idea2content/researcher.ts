/**
 * =============================================================================
 * Idea2Content — Deep Researcher (4 layers)
 * =============================================================================
 *
 * Comprehensive research pipeline that combines multiple search backends
 * to give the writer maximum context:
 *
 *   Layer 1  Gemini + Google Search grounding (FREE)
 *            → grounded synthesis + source URLs from groundingMetadata
 *
 *   Layer 2  Tavily /search — additional sources with AI answer
 *            → queries derived from Layer 1 grounding + LLM
 *
 *   Layer 3  Tavily /extract — full page content from top URLs
 *            → markdown extractions, up to 3000 chars each
 *
 *   Layer 4  Compile → comprehensive research brief (10-20K chars)
 *
 * Output: ResearchResult { brief, sources[], queries[] }
 * The brief is injected directly into the writer prompt.
 * =============================================================================
 */

import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { TavilyContextItem, NicheContext } from '../noise2article/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Researcher] ${msg}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResearchResult {
  /** Comprehensive research brief ready to inject into writer prompt */
  brief: string;
  /** All source items (for article.sources) */
  sources: TavilyContextItem[];
  /** All queries that were executed */
  queries: string[];
}

interface GroundedResult {
  synthesis: string;
  urls: Array<{ title: string; url: string }>;
  webSearchQueries: string[];
}

interface TavilySearchResult {
  items: TavilyContextItem[];
  answer: string;
  queries: string[];
}

interface ExtractedPage {
  url: string;
  title: string;
  content: string;
}

// ─── Layer 1: Gemini + Google Search Grounding ──────────────────────────────

async function groundedResearch(
  gemini: GoogleGenAI,
  prompt: string,
  nicheContext: NicheContext,
): Promise<GroundedResult> {
  log('Layer 1: Google Search grounded research...');

  const researchPrompt = `You are a research analyst for a ${nicheContext.platformDescriptor}.

Research the following topic thoroughly using web search. Provide a comprehensive research brief with:

1. KEY FACTS & DATA — specific numbers, statistics, dates, benchmarks. No vague claims.
2. RECENT DEVELOPMENTS — what has happened in the last 6 months related to this topic.
3. MAIN PERSPECTIVES — at least 2-3 different viewpoints, including contrarian or critical angles.
4. KEY PLAYERS — companies, people, tools, organizations, research papers involved.
5. OPEN QUESTIONS — what's debated, what's uncertain, what experts disagree on.

Be brutally specific. Every claim should have a number, name, or date to back it up.
Write like a reporter's research notes — dense with facts, no fluff.

TOPIC: ${prompt}`;

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: researchPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const synthesis = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const metadata = (response.candidates?.[0] as any)?.groundingMetadata;

    // Extract source URLs from grounding chunks
    const urls: GroundedResult['urls'] = [];
    const seenUrls = new Set<string>();
    const chunks = metadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const web = chunk?.web;
      if (web?.uri && !seenUrls.has(web.uri)) {
        seenUrls.add(web.uri);
        urls.push({ title: web.title || '', url: web.uri });
      }
    }

    // Extract web search queries that Gemini used
    const webSearchQueries: string[] = metadata?.webSearchQueries || [];

    log(`  Synthesis: ${synthesis.length} chars, ${urls.length} grounded URLs, ${webSearchQueries.length} search queries`);

    return { synthesis, urls, webSearchQueries };
  } catch (err: any) {
    log(`  Google Search grounding failed: ${err.message}`);
    // Graceful fallback — no grounding, continue with other layers
    return { synthesis: '', urls: [], webSearchQueries: [] };
  }
}

// ─── Layer 2: Tavily /search ─────────────────────────────────────────────────

async function searchTavily(
  apiKey: string,
  query: string,
): Promise<{ items: TavilyContextItem[]; answer: string }> {
  try {
    log(`  Tavily search: "${query}"`);
    const resp = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
        chunks_per_source: 3,
        include_answer: true,
        topic: 'general',
        exclude_domains: ['twitter.com', 'x.com', 'reddit.com'],
      },
      { timeout: 25000 },
    );

    const items: TavilyContextItem[] = (resp.data?.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || r.snippet || '',
      score: r.score || 0,
    }));

    const answer: string = resp.data?.answer || '';

    log(`    → ${items.length} results${answer ? `, AI answer: ${answer.length} chars` : ''}`);
    return { items, answer };
  } catch (err: any) {
    log(`    Tavily search error: ${err.message}`);
    return { items: [], answer: '' };
  }
}

/**
 * Derives search queries from Layer 1 grounding + the original prompt.
 * Prefers the queries Gemini used (they're already optimized), but
 * falls back to the prompt itself.
 */
function deriveQueries(grounded: GroundedResult, prompt: string): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  // Use Gemini's own web search queries first (usually the best)
  for (const q of grounded.webSearchQueries.slice(0, 3)) {
    const normalized = q.trim().toLowerCase();
    if (normalized.length > 3 && !seen.has(normalized)) {
      seen.add(normalized);
      queries.push(q.trim());
    }
  }

  // Always include the raw prompt as a query (different angle than Gemini's)
  const promptQuery = prompt.slice(0, 150).trim();
  const promptNorm = promptQuery.toLowerCase();
  if (!seen.has(promptNorm)) {
    queries.push(promptQuery);
  }

  return queries.slice(0, 4); // Max 4 Tavily queries
}

async function runTavilySearches(
  apiKey: string,
  queries: string[],
  excludeUrls: Set<string>,
): Promise<TavilySearchResult> {
  log(`Layer 2: Tavily search (${queries.length} queries)...`);

  const results = await Promise.all(queries.map(q => searchTavily(apiKey, q)));

  const items: TavilyContextItem[] = [];
  const seenUrls = new Set<string>(excludeUrls);
  let bestAnswer = '';

  for (const r of results) {
    if (r.answer && r.answer.length > bestAnswer.length) {
      bestAnswer = r.answer;
    }
    for (const item of r.items) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        items.push(item);
      }
    }
  }

  // Sort by relevance score
  items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  log(`  ${items.length} unique new sources (after dedup against grounding URLs)`);
  return { items, answer: bestAnswer, queries };
}

// ─── Layer 3: Tavily /extract — full page content ────────────────────────────

async function extractPages(
  apiKey: string,
  urls: string[],
): Promise<ExtractedPage[]> {
  if (!urls.length) return [];

  log(`Layer 3: Tavily extract (${urls.length} pages)...`);

  try {
    const resp = await axios.post(
      'https://api.tavily.com/extract',
      {
        api_key: apiKey,
        urls,
        include_images: false,
      },
      { timeout: 30000 },
    );

    const pages: ExtractedPage[] = (resp.data?.results || [])
      .filter((r: any) => r.raw_content && r.raw_content.length > 50)
      .map((r: any) => ({
        url: r.url || '',
        title: r.title || r.url || '',
        content: r.raw_content.substring(0, 3000),
      }));

    log(`  Extracted ${pages.length}/${urls.length} pages successfully`);
    for (const p of pages) {
      log(`    "${p.title.slice(0, 60)}" — ${p.content.length} chars`);
    }

    return pages;
  } catch (err: any) {
    log(`  Tavily extract failed: ${err.message}`);
    return [];
  }
}

// ─── Layer 4: Compile comprehensive brief ────────────────────────────────────

function compileBrief(
  grounded: GroundedResult,
  tavily: TavilySearchResult,
  extracted: ExtractedPage[],
): string {
  const sections: string[] = [];

  // Section 1: Gemini's grounded synthesis (it has already read real web pages)
  if (grounded.synthesis) {
    sections.push(`RESEARCH SYNTHESIS (from web search):\n${grounded.synthesis}`);
  }

  // Section 2: Full page extractions (deep context for the writer)
  if (extracted.length > 0) {
    const extractedSection = extracted
      .map((p, i) => `[${i + 1}] "${p.title}" — ${p.url}\n${p.content}`)
      .join('\n\n---\n\n');
    sections.push(`DETAILED SOURCE CONTENT:\n\n${extractedSection}`);
  }

  // Section 3: Tavily snippets for sources NOT extracted (breadth)
  const extractedUrls = new Set(extracted.map(p => p.url));
  const remainingSnippets = tavily.items
    .filter(item => !extractedUrls.has(item.url) && item.snippet.length > 50)
    .slice(0, 5);

  if (remainingSnippets.length > 0) {
    const snippetSection = remainingSnippets
      .map((s, i) => `[${i + 1}] "${s.title}" — ${s.url}\n${s.snippet}`)
      .join('\n\n');
    sections.push(`ADDITIONAL SOURCES:\n\n${snippetSection}`);
  }

  // Section 4: Tavily's AI answer (different model's perspective)
  if (tavily.answer) {
    sections.push(`TAVILY AI SUMMARY:\n${tavily.answer}`);
  }

  return sections.join('\n\n' + '='.repeat(60) + '\n\n');
}

// ─── Exported Orchestrator ───────────────────────────────────────────────────

/**
 * Deep research pipeline. Combines Google Search grounding (free),
 * Tavily search, and Tavily extract for comprehensive research.
 *
 * Returns the same ResearchResult shape — backward compatible with
 * the writer, pipeline, route, and frontend.
 */
export async function researchIdea(
  gemini: GoogleGenAI,
  tavilyApiKey: string,
  prompt: string,
  nicheContext: NicheContext,
): Promise<ResearchResult> {
  log(`═══ Deep research: "${prompt.slice(0, 80)}" ═══`);
  const start = Date.now();

  // Layer 1: Gemini + Google Search grounding (free)
  const grounded = await groundedResearch(gemini, prompt, nicheContext);

  // Layer 2: Tavily search for additional sources
  const groundedUrlSet = new Set(grounded.urls.map(u => u.url));
  const queries = deriveQueries(grounded, prompt);
  const tavily = await runTavilySearches(tavilyApiKey, queries, groundedUrlSet);

  // Collect all unique URLs for extraction (grounded first, then Tavily top)
  const allUrls: string[] = [];
  const seenExtract = new Set<string>();
  for (const u of grounded.urls) {
    if (!seenExtract.has(u.url)) { seenExtract.add(u.url); allUrls.push(u.url); }
  }
  for (const item of tavily.items) {
    if (item.url && !seenExtract.has(item.url)) { seenExtract.add(item.url); allUrls.push(item.url); }
  }

  // Layer 3: Extract full page content from top URLs
  const extracted = await extractPages(tavilyApiKey, allUrls.slice(0, 5));

  // Layer 4: Compile comprehensive brief
  const brief = compileBrief(grounded, tavily, extracted);

  // Merge all sources for the article (grounded + tavily, deduplicated)
  const sources: TavilyContextItem[] = [];
  const seenSource = new Set<string>();
  for (const u of grounded.urls) {
    if (!seenSource.has(u.url)) {
      seenSource.add(u.url);
      sources.push({ title: u.title, url: u.url, snippet: '', score: 1.0 });
    }
  }
  for (const item of tavily.items) {
    if (item.url && !seenSource.has(item.url)) {
      seenSource.add(item.url);
      sources.push(item);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`═══ Research complete: ${sources.length} sources, ${brief.length} chars brief, ${elapsed}s ═══`);

  return { brief, sources, queries };
}
