/**
 * =============================================================================
 * Noise2Article — Hacker News Scraper (via Algolia API)
 * =============================================================================
 *
 * Uses the free HN Algolia API: https://hn.algolia.com/api
 * No authentication needed. Rate limit: 10,000 req/hour per IP.
 *
 * Searches for Show HN / Ask HN posts about AI, workflows, tools
 * with points > 50 and comments > 10.
 * =============================================================================
 */

import axios from 'axios';
import { RawPost } from './types.js';

const HN_API_BASE = 'https://hn.algolia.com/api/v1';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [HN] ${msg}`);
}

function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut) + '...';
}

function hasLink(text: string): boolean {
  return /https?:\/\/\S+/i.test(text) || /github\.com|gitlab\.com|bitbucket\.org/i.test(text);
}

function hasNumbers(text: string): boolean {
  return /\$[\d,]+|\d+%|\d+x|\d+ hours?|\d+ mins?|MRR|ARR|revenue|\d+k\b/i.test(text);
}

// ─── Scraper ────────────────────────────────────────────────────────────────

export async function scrapeHackerNews(
  queries: string[],
  maxResultsPerQuery: number,
  frontPagePattern?: string,
): Promise<RawPost[]> {
  log(`Searching HN with ${queries.length} queries (max ${maxResultsPerQuery} per query)...`);
  const allPosts: RawPost[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    try {
      log(`  Query: "${query}"`);

      // Use search_by_date for recency, with relaxed thresholds
      // (points>50 + time filter was too strict and returned 0)
      const resp = await axios.get(`${HN_API_BASE}/search_by_date`, {
        params: {
          query,
          tags: 'story',
          numericFilters: 'points>10',
          hitsPerPage: String(maxResultsPerQuery),
        },
        timeout: 15000,
      });
      const hits = resp.data?.hits || [];

      log(`  Found ${hits.length} stories`);

      for (const hit of hits) {
        const id = `hn_${hit.objectID}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const title = (hit.title || '').trim();
        const storyText = (hit.story_text || '').trim();
        const storyUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const fullText = `${title} ${storyText} ${storyUrl}`;

        allPosts.push({
          id,
          source: 'hn',
          title: truncate(title, 200),
          body: truncate(storyText, 500),
          url: storyUrl,
          author: hit.author || 'unknown',
          score: hit.points || 0,
          commentCount: hit.num_comments || 0,
          createdAt: hit.created_at || new Date().toISOString(),
          hasLink: hasLink(fullText),
          hasNumbers: hasNumbers(fullText),
        });
      }
    } catch (err: any) {
      log(`  Query "${query}" ERROR: ${err.message}`);
    }
  }

  // Also search front_page for high-signal current content
  try {
    log('  Fetching current front page stories...');

    const fpResp = await axios.get(`${HN_API_BASE}/search`, {
      params: { tags: 'front_page', hitsPerPage: 30 },
      timeout: 15000,
    });
    const fpHits = fpResp.data?.hits || [];

    // Only keep niche-relevant front page posts
    const patternStr = frontPagePattern ?? '\\bai\\b|llm|gpt|claude|gemini|agent|workflow|startup|saas|open.?source|docker|kubernetes|api|automation';
    const techKeywords = new RegExp(patternStr, 'i');

    for (const hit of fpHits) {
      const id = `hn_${hit.objectID}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const title = (hit.title || '').trim();
      const storyText = (hit.story_text || '').trim();
      const fullText = `${title} ${storyText}`;

      if (!techKeywords.test(fullText)) continue;

      allPosts.push({
        id,
        source: 'hn',
        title: truncate(title, 200),
        body: truncate(storyText, 500),
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        author: hit.author || 'unknown',
        score: hit.points || 0,
        commentCount: hit.num_comments || 0,
        createdAt: hit.created_at || new Date().toISOString(),
        hasLink: hasLink(fullText),
        hasNumbers: hasNumbers(fullText),
      });
    }

    log(`  Front page: ${fpHits.length} fetched, ${allPosts.filter(p => p.source === 'hn').length} kept total`);
  } catch (err: any) {
    log(`  Front page ERROR: ${err.message}`);
  }

  log(`HN scraping done: ${allPosts.length} total posts`);
  return allPosts;
}
