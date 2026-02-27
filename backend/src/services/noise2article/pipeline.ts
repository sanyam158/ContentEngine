/**
 * =============================================================================
 * Noise2Article — Pipeline Orchestrator
 * =============================================================================
 *
 * Chains all stages:
 *   1. Scrape (Reddit + HN + Twitter in parallel)
 *   2. Pre-filter (rule-based, no LLM)
 *   3. Gatekeeper (LLM batch classifier)
 *   4. Synthesize + Rank (LLM groups into themes)
 *   5. Deduplicate (filter out themes we've already covered - BEFORE enrichment)
 *   6. Enrich (Brain + Tavily for top CANDIDATE themes only)
 *   7. Write (Generate articles)
 *
 * Returns PipelineResult with ranked themes AND generated articles.
 * =============================================================================
 */

import { Composio } from '@composio/core';
import { GoogleGenAI } from '@google/genai';
import { PipelineConfig, PipelineResult, PipelineStageResult, RawPost, GeneratedArticle, DEFAULT_CONFIG, DEFAULT_NICHE_CONTEXT } from './types.js';
import { scrapeReddit } from './scrapers/redditScraper.js';
import { scrapeHackerNews } from './scrapers/hnScraper.js';
import { scrapeTwitter } from './scrapers/twitterScraper.js';
import { scrapeRss } from './scrapers/rssScraper.js';
import { preFilter, llmGatekeeper } from './stages/gatekeeper.js';
import { synthesizeAndRank } from './stages/synthesizer.js';
import { enrichThemes } from './stages/enricher.js';
import { writeArticles } from './stages/writer.js';
import { saveGeneratedArticles, listSavedArticleSourceUrls, normalizeUrl } from './storage.js';
import { generateCreativePrompt } from './stages/imagePrompts.js';
import ImageService from '../imageService.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Pipeline] ${msg}`);
}

function separator(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70) + '\n');
}

// Hard cap on how many posts we ever send through the LLM gatekeeper.
// This keeps the slowest, most expensive stage bounded even on very noisy days.
const MAX_GATEKEEPER_POSTS = 50;

/** Top 2–3 post URLs from theme (by banger score) for source-based deduplication. */
function themePrimaryUrls(theme: { posts: Array<{ url?: string; bangerScore?: number }> }): string[] {
  const sorted = [...theme.posts]
    .sort((a, b) => (b.bangerScore ?? 0) - (a.bangerScore ?? 0))
    .filter(p => p.url);
  return sorted.slice(0, 3).map(p => p.url!);
}

async function attachArticleImages(
  gemini: GoogleGenAI,
  articles: GeneratedArticle[],
): Promise<GeneratedArticle[]> {
  if (!articles.length) return articles;
  // Resolve a Gemini key for ImageService (supports both GEMINI_API_KEYS and GEMINI_API_KEY)
  const apiKey =
    process.env.GEMINI_API_KEYS?.split(',')[0]?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    log('Image: No Gemini API key set (GEMINI_API_KEY / GEMINI_API_KEYS), skipping article images');
    return articles;
  }

  const imageService = new ImageService(apiKey);
  const results: GeneratedArticle[] = [];

  for (const article of articles) {
    try {
      const prompt = await generateCreativePrompt(gemini, article.title, article.hook);
      const img = await imageService.generateImage(prompt, undefined, undefined, '16:9');
      results.push({
        ...article,
        image: {
          base64: img.base64,
          mimeType: img.mimeType,
          prompt: img.prompt,
        },
      });
    } catch (err: any) {
      log(`Image: FAILED for "${article.title}": ${err.message}`);
      console.error('[Pipeline] Image generation error (full):', err);
      results.push(article);
    }
  }

  return results;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export async function runPipeline(
  composio: Composio,
  gemini: GoogleGenAI,
  tavilyApiKey: string,
  userId: string,
  config: PipelineConfig = DEFAULT_CONFIG,
  /** Optional callback to report progress to the caller */
  onProgress?: (stage: string, detail: string) => void,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const stages: PipelineStageResult[] = [];
  const nicheContext = config.nicheContext ?? DEFAULT_NICHE_CONTEXT;
  log(`Niche: ${nicheContext.id} (${nicheContext.displayName})`);
  const report = (stage: string, detail: string) => {
    log(`${stage}: ${detail}`);
    onProgress?.(stage, detail);
  };

  // ─── STAGE 1: Scrape all sources in parallel ───────────────────────────

  separator('STAGE 1: Scraping Sources (Reddit + HN + Twitter + RSS)');
  report('scraping', 'Starting scrapers for Reddit, HN, Twitter, and RSS...');

  const scrapeStart = Date.now();

  const redditUserId = process.env.REDDIT_USER_ID || userId;

  const [redditPosts, hnPosts, twitterPosts, rssPosts] = await Promise.all([
    scrapeReddit(composio, redditUserId, config.subreddits, config.redditPostsPerSub)
      .catch(err => {
        log(`Reddit scraper failed: ${err.message}`);
        return [] as RawPost[];
      }),
    scrapeHackerNews(config.hnQueries, config.hnMaxResults, nicheContext.hnFrontPagePattern)
      .catch(err => {
        log(`HN scraper failed: ${err.message}`);
        return [] as RawPost[];
      }),
    scrapeTwitter(composio, userId, config.twitterAccounts, config.tweetsPerAccount)
      .catch(err => {
        log(`Twitter scraper failed: ${err.message}`);
        return [] as RawPost[];
      }),
    scrapeRss(config.rssFeeds, config.rssItemsPerFeed)
      .catch(err => {
        log(`RSS scraper failed: ${err.message}`);
        return [] as RawPost[];
      }),
  ]);

  const allRawPosts = [...redditPosts, ...hnPosts, ...twitterPosts, ...rssPosts];
  stages.push({ stage: 'scraping', count: allRawPosts.length, durationMs: Date.now() - scrapeStart });
  report('scraping', `Done: ${redditPosts.length} Reddit + ${hnPosts.length} HN + ${twitterPosts.length} Twitter + ${rssPosts.length} RSS = ${allRawPosts.length} total`);

  if (allRawPosts.length === 0) {
    log('No posts scraped from any source. Pipeline ending early.');
    return {
      themes: [],
      articles: [],
      stages,
      totalDurationMs: Date.now() - pipelineStart,
      rawPostCount: 0,
      filteredPostCount: 0,
      themeCount: 0,
      articleCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── STAGE 2: Pre-filter (rule-based) ─────────────────────────────────

  separator('STAGE 2: Pre-filtering (Rule-based)');
  report('pre-filter', `Filtering ${allRawPosts.length} posts...`);

  const preFilterStart = Date.now();
  const preFiltered = preFilter(allRawPosts);
  stages.push({ stage: 'pre-filter', count: preFiltered.length, durationMs: Date.now() - preFilterStart });
  report('pre-filter', `Done: ${allRawPosts.length} → ${preFiltered.length} posts`);

  // Cap posts going into the LLM gatekeeper so we don't blow past timeouts
  // when Reddit/HN/RSS are extra noisy on a given day.
  const gatekeeperInput = [...preFiltered]
    .sort((a, b) => b.score - a.score) // prioritise higher-score posts
    .slice(0, MAX_GATEKEEPER_POSTS);
  if (gatekeeperInput.length < preFiltered.length) {
    report(
      'pre-filter',
      `Capped gatekeeper input at ${gatekeeperInput.length} highest-score posts (from ${preFiltered.length})`,
    );
  }

  // ─── STAGE 3: LLM Gatekeeper ─────────────────────────────────────────

  separator('STAGE 3: LLM Gatekeeper (Banger Classification)');
  report('gatekeeper', `Classifying ${gatekeeperInput.length} posts...`);

  const gatekeeperStart = Date.now();
  const filtered = await llmGatekeeper(gemini, gatekeeperInput, config.gatekeeperBatchSize, nicheContext);
  stages.push({ stage: 'gatekeeper', count: filtered.length, durationMs: Date.now() - gatekeeperStart });
  report('gatekeeper', `Done: ${gatekeeperInput.length} → ${filtered.length} bangers`);

  if (filtered.length === 0) {
    log('No posts passed the gatekeeper. Pipeline ending early.');
    return {
      themes: [],
      articles: [],
      stages,
      totalDurationMs: Date.now() - pipelineStart,
      rawPostCount: allRawPosts.length,
      filteredPostCount: 0,
      themeCount: 0,
      articleCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── STAGE 4: Synthesize + Rank ───────────────────────────────────────

  separator('STAGE 4: Theme Synthesis + Ranking');
  report('synthesis', `Grouping ${filtered.length} posts into themes...`);

  const synthStart = Date.now();
  const themes = await synthesizeAndRank(gemini, filtered, nicheContext);
  stages.push({ stage: 'synthesis', count: themes.length, durationMs: Date.now() - synthStart });
  report('synthesis', `Done: ${themes.length} themes created`);

  // ─── STAGE 5: Source-URL Deduplication (before enrichment) ────────────────
  // Skip only when we've already written an article using the same primary source posts.
  // Different URLs = different story = allow.

  separator('STAGE 5: Source-URL Deduplication (before enrichment)');
  const existingUrls = await listSavedArticleSourceUrls();

  const candidateThemes = themes.filter(t => {
    const primaryUrls = themePrimaryUrls(t);
    if (primaryUrls.length === 0) return true; // no URLs to check → allow
    const overlap = primaryUrls.filter(u => existingUrls.has(normalizeUrl(u))).length;
    const threshold = primaryUrls.length === 1 ? 1 : 2;
    return overlap < threshold;
  });

  const skipped = themes.length - candidateThemes.length;
  if (skipped > 0) {
    const skippedThemes = themes.filter(t => {
      const primaryUrls = themePrimaryUrls(t);
      if (primaryUrls.length === 0) return false;
      const overlap = primaryUrls.filter(u => existingUrls.has(normalizeUrl(u))).length;
      const threshold = primaryUrls.length === 1 ? 1 : 2;
      return overlap >= threshold;
    });
    for (const t of skippedThemes) {
      report('dedupe', `  Skipped: "${t.name}" (2+ primary sources already used in existing article)`);
    }
  }
  report('dedupe', `Candidates for enrichment: ${candidateThemes.length} of ${themes.length}`);
  stages.push({ stage: 'dedupe', count: candidateThemes.length, durationMs: 0 });

  if (candidateThemes.length === 0) {
    log('No new themes to enrich. Pipeline ending (all top themes already have articles from same sources).');
    return {
      themes,
      articles: [],
      stages,
      totalDurationMs: Date.now() - pipelineStart,
      rawPostCount: allRawPosts.length,
      filteredPostCount: filtered.length,
      themeCount: themes.length,
      articleCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── STAGE 6: Enrich top CANDIDATE themes with Tavily ───────────────────

  separator('STAGE 6: Context Enrichment (Brain + Tavily)');
  const toEnrich = Math.min(config.topThemesToEnrich, candidateThemes.length);
  report('enrichment', `Enriching top ${toEnrich} candidate themes (of ${candidateThemes.length} new ideas)...`);

  const enrichStart = Date.now();
  const enrichedThemes = await enrichThemes(gemini, tavilyApiKey, candidateThemes, toEnrich, nicheContext);
  stages.push({ stage: 'enrichment', count: toEnrich, durationMs: Date.now() - enrichStart });
  report('enrichment', `Done`);

  // ─── STAGE 7: Write articles ───────────────────────────────────────────

  separator('STAGE 7: Article Generation (Content Engine)');
  const articlesToGenerate = toEnrich; // Write only for themes we enriched

  const writeStart = Date.now();
  let articles: GeneratedArticle[] = [];
  if (articlesToGenerate > 0) {
    const textArticles = await writeArticles(gemini, enrichedThemes, articlesToGenerate, nicheContext, config.platforms ?? []);
    articles = await attachArticleImages(gemini, textArticles);
  }
  try {
    await saveGeneratedArticles(articles);
  } catch (err: any) {
    log(`Warning: failed to save articles: ${err.message}`);
  }
  stages.push({ stage: 'writing', count: articles.length, durationMs: Date.now() - writeStart });
  report('writing', `Done: ${articles.length} articles generated`);

  // ─── Summary ──────────────────────────────────────────────────────────

  const totalDurationMs = Date.now() - pipelineStart;

  separator('PIPELINE COMPLETE');
  log(`Total time: ${(totalDurationMs / 1000).toFixed(1)}s`);
  log(`Raw posts: ${allRawPosts.length}`);
  log(`Filtered posts: ${filtered.length}`);
  log(`Themes: ${enrichedThemes.length}`);
  log(`Articles: ${articles.length}`);

  for (const t of enrichedThemes) {
    const ctx = t.tavilyContext?.length ? ` (+${t.tavilyContext.length} sources)` : '';
    console.log('');
    log(`━━━ #${t.overallRank} "${t.name}" ━━━`);
    log(`  Scores: virality=${t.viralityScore} · unique=${t.uniquenessScore} · timely=${t.timelinessScore}${ctx}`);
    if (t.description) {
      log(`  Summary: ${t.description}`);
    }
    log(`  Top contributing posts (${t.posts.length} total):`);
    const topPosts = t.posts.slice(0, 5);
    for (const p of topPosts) {
      const src = p.source.toUpperCase().padEnd(7);
      const title = p.title.length > 100 ? p.title.substring(0, 100) + '...' : p.title;
      const link = p.url ? ` → ${p.url}` : '';
      log(`    [${src}] ${title}${link}`);
    }
    if (t.posts.length > 5) {
      log(`    ... and ${t.posts.length - 5} more`);
    }
  }

  // Print generated articles
  for (const article of articles) {
    console.log('');
    log(`━━━ ARTICLE: "${article.title}" ━━━`);
    log(`  Theme: ${article.themeName}`);
    log(`  Read time: ${article.estimatedReadTime}`);
    log(`  Tags: ${article.tags.join(', ')}`);
    if (article.threadTweets.length > 0) {
      log(`  Thread tweets (${article.threadTweets.length}):`);
      for (let i = 0; i < article.threadTweets.length; i++) {
        log(`    [${i + 1}] ${article.threadTweets[i].substring(0, 100)}...`);
      }
    }
    log(`  Hook: ${article.hook.substring(0, 200)}...`);
  }

  return {
    themes: enrichedThemes,
    articles,
    stages,
    totalDurationMs,
    rawPostCount: allRawPosts.length,
    filteredPostCount: filtered.length,
    themeCount: enrichedThemes.length,
    articleCount: articles.length,
    timestamp: new Date().toISOString(),
  };
}
