/**
 * =============================================================================
 * Noise2Article — Reddit Scraper (Composio + public API fallback)
 * =============================================================================
 *
 * Primary: REDDIT_RETRIEVE_REDDIT_POST (Composio) — requires Reddit OAuth
 * Fallback: Reddit public JSON API — no auth, for read-only public subreddits
 * =============================================================================
 */

import { Composio } from '@composio/core';
import { RawPost, SubredditConfig } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Reddit] ${msg}`);
}

/** Reddit public JSON API fallback (no OAuth). Requires User-Agent. */
async function fetchRedditPublic(subreddit: string, limit: number): Promise<any> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${Math.min(limit, 100)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ContentEngine/1.0 (Noise2Article pipeline; read-only)',
    },
  });
  if (!res.ok) throw new Error(`Reddit API ${res.status}: ${res.statusText}`);
  return res.json();
}

/** Check if text contains a link (GitHub, repo, etc.) */
function hasLink(text: string): boolean {
  return /https?:\/\/\S+/i.test(text) || /github\.com|gitlab\.com|bitbucket\.org/i.test(text);
}

/** Check if text mentions specific numbers/metrics */
function hasNumbers(text: string): boolean {
  return /\$[\d,]+|\d+%|\d+x|\d+ hours?|\d+ mins?|MRR|ARR|revenue|\d+k\b/i.test(text);
}

/** Truncate text to maxLen, preserving word boundaries */
function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut) + '...';
}

// ─── Scraper ────────────────────────────────────────────────────────────────

export async function scrapeReddit(
  composio: Composio,
  userId: string,
  subreddits: SubredditConfig[],
  postsPerSub: number,
): Promise<RawPost[]> {
  log(`Scraping ${subreddits.length} subreddits (${postsPerSub} posts each)...`);
  const allPosts: RawPost[] = [];
  let hardFailure: string | null = null;

  for (const sub of subreddits) {
    if (hardFailure) {
      log(`  Skipping r/${sub.name} because previous subreddit failed with: ${hardFailure}`);
      continue;
    }

    // Optimized delay to avoid Reddit rate limits (1.5–2.5s between subreddits)
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.floor(Math.random() * 1000)));
    let posts: any[] = [];
    let usedFallback = false;

    try {
      log(`  r/${sub.name} (tier ${sub.tier})...`);

      // 1. Try Composio first (requires Reddit OAuth connected for userId)
      try {
        const result = await composio.tools.execute('REDDIT_RETRIEVE_REDDIT_POST', {
          userId,
          arguments: {
            subreddit: sub.name,
            size: Math.min(Math.max(0, postsPerSub), 100),
          },
          dangerouslySkipVersionCheck: true,
        });
        const data = result?.data as any;
        if (Array.isArray(data)) posts = data;
        else if (Array.isArray(data?.data?.children)) posts = data.data.children;
        else if (Array.isArray(data?.children)) posts = data.children;
        else if (Array.isArray(data?.data)) posts = data.data;
      } catch (composioErr: any) {
        const msg = composioErr?.message || String(composioErr);
        log(`  r/${sub.name}: Composio failed (${msg}), trying public API...`);
        // 2. Fallback: Reddit public JSON API (no OAuth)
        const json = await fetchRedditPublic(sub.name, Math.min(postsPerSub, 100));
        if (Array.isArray(json?.data?.children)) {
          posts = json.data.children;
          usedFallback = true;
        } else {
          throw composioErr;
        }
      }

      if (posts.length === 0 && !usedFallback) {
        log(`  r/${sub.name}: No posts in response`);
        continue;
      }

      let count = 0;
      for (const raw of posts) {
        // Each child has { kind: "t3", data: { title, selftext, ... } }
        const p = raw?.data || raw;

        const title = (p.title || '').trim();
        const body = (p.selftext || p.body || p.text || '').trim();
        const score = p.score ?? p.ups ?? 0;
        const numComments = p.num_comments ?? p.commentCount ?? 0;
        const author = p.author || p.author_fullname || 'unknown';
        const permalink = p.permalink ? `https://reddit.com${p.permalink}` : p.url;
        const created = p.created_utc
          ? new Date(p.created_utc * 1000).toISOString()
          : (p.created_at || new Date().toISOString());

        // Skip if below subreddit tier thresholds
        if (score < sub.minScore) continue;
        if (sub.tier === 3 && numComments < sub.minComments) continue;

        const fullText = `${title} ${body}`;

        allPosts.push({
          id: `reddit_${sub.name}_${p.id || p.name || crypto.randomUUID?.() || Math.random().toString(36)}`,
          source: 'reddit',
          title: truncate(title, 200),
          body: truncate(body, 500),
          url: permalink,
          author,
          score,
          commentCount: numComments,
          createdAt: created,
          subreddit: sub.name,
          hasLink: hasLink(fullText),
          hasNumbers: hasNumbers(fullText),
        });
        count++;
      }

      log(`  r/${sub.name}: ${count} posts kept${usedFallback ? ' (via public API)' : ''}`);
    } catch (err: any) {
      const message = err?.message || String(err);
      log(`  r/${sub.name}: ERROR — ${message}`);
      // Only hard-fail on rate limit (429) — don't cascade skip for auth/Composio errors
      if (/rate limit|Too Many Requests|429/i.test(message)) {
        hardFailure = message;
      }
    }
  }

  log(`Reddit scraping done: ${allPosts.length} total posts`);
  return allPosts;
}
