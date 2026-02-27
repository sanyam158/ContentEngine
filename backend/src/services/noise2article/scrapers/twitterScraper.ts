/**
 * =============================================================================
 * Noise2Article — Twitter Scraper (via Composio)
 * =============================================================================
 *
 * Reuses the TWITTER_RECENT_SEARCH pattern from the Fast React pipeline.
 * Fetches the latest tweet per monitored account.
 * =============================================================================
 */

import { Composio } from '@composio/core';
import axios from 'axios';
import { RawPost } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Twitter] ${msg}`);
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

/** Check if Twitter connection is active */
async function checkTwitterConnection(userId: string, composioApiKey: string): Promise<boolean> {
  try {
    const resp = await axios.get(
      `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${encodeURIComponent(userId)}`,
      { headers: { 'X-API-Key': composioApiKey }, timeout: 10000 },
    );
    const items = resp.data?.items || resp.data || [];
    const twitterAccounts = Array.isArray(items)
      ? items.filter((a: any) =>
          (a.appName || '').toLowerCase() === 'twitter' ||
          (a.appUniqueId || '').toLowerCase() === 'twitter'
        )
      : [];

    if (twitterAccounts.length === 0) {
      log('No Twitter connection found.');
      log(`  Connect at: https://connect.composio.dev/?entityId=${encodeURIComponent(userId)}&integrationId=twitter`);
      return false;
    }

    const status = (twitterAccounts[0].status || '').toUpperCase();
    log(`Twitter connection status: ${status}`);

    if (status === 'ACTIVE' || status === 'CONNECTED') {
      return true;
    }

    log(`Twitter connection is ${status}. Re-authenticate at:`);
    log(`  https://connect.composio.dev/?entityId=${encodeURIComponent(userId)}&integrationId=twitter`);
    return false;
  } catch (err: any) {
    log(`Connection check failed: ${err.message}. Skipping Twitter.`);
    return false;
  }
}

export async function scrapeTwitter(
  composio: Composio,
  userId: string,
  accounts: string[],
  tweetsPerAccount: number,
): Promise<RawPost[]> {
  log(`Scraping ${accounts.length} Twitter accounts (${tweetsPerAccount} tweet each)...`);
  const allPosts: RawPost[] = [];

  // Pre-flight check: is the Twitter connection active?
  const composioApiKey = process.env.COMPOSIO_API_KEY || '';
  const connected = await checkTwitterConnection(userId, composioApiKey);
  if (!connected) {
    log('Skipping Twitter scraping (connection expired or missing)');
    return allPosts;
  }

  let consecutiveErrors = 0;

  for (const account of accounts) {
    // Fail-fast: if 2 accounts in a row error, the connection is probably broken
    if (consecutiveErrors >= 2) {
      log(`  Skipping remaining accounts (${consecutiveErrors} consecutive errors — likely auth issue)`);
      break;
    }

    try {
      log(`  @${account}...`);

      // Twitter API requires max_results >= 10
      const result = await composio.tools.execute('TWITTER_RECENT_SEARCH', {
        userId,
        arguments: {
          query: `from:${account} -is:retweet -is:reply`,
          max_results: Math.max(tweetsPerAccount, 10),
          sort_order: 'recency',
          tweet__fields: ['created_at', 'public_metrics', 'author_id', 'text', 'conversation_id', 'attachments'],
          expansions: ['author_id', 'attachments.media_keys'],
          user__fields: ['username', 'name'],
          media__fields: ['url', 'type'],
        },
        dangerouslySkipVersionCheck: true,
      });

      const data = result?.data as any;
      const tweets = data?.data || [];

      if (tweets.length === 0) {
        log(`  @${account}: No recent tweets`);
        continue;
      }

      // Only take the latest tweet
      const tweet = tweets[0];
      const metrics = tweet.public_metrics || {};
      const text = (tweet.text || '').trim();

      // If this is a thread, try to fetch the rest
      let fullText = text;
      const conversationId = tweet.conversation_id || tweet.id;
      if (conversationId) {
        try {
          const threadResult = await composio.tools.execute('TWITTER_RECENT_SEARCH', {
            userId,
            arguments: {
              query: `conversation_id:${conversationId} from:${account}`,
              max_results: 10,
              sort_order: 'recency',
              tweet__fields: ['created_at', 'text', 'author_id'],
            },
            dangerouslySkipVersionCheck: true,
          });
          const threadData = threadResult?.data as any;
          const threadTweets = threadData?.data || [];
          if (threadTweets.length > 1) {
            // Sort by created_at ascending and join
            const sorted = threadTweets
              .sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
            fullText = sorted.map((t: any) => (t.text || '').trim()).join('\n\n');
            log(`  @${account}: Thread with ${threadTweets.length} tweets`);
          }
        } catch {
          // Thread fetch failed — use single tweet text
        }
      }

      allPosts.push({
        id: `twitter_${tweet.id}`,
        source: 'twitter',
        title: truncate(text, 200),
        body: truncate(fullText, 500),
        url: `https://x.com/${account}/status/${tweet.id}`,
        author: account,
        score: metrics.like_count || 0,
        commentCount: metrics.reply_count || 0,
        createdAt: tweet.created_at || new Date().toISOString(),
        hasLink: hasLink(fullText),
        hasNumbers: hasNumbers(fullText),
      });

      consecutiveErrors = 0; // reset on success
      log(`  @${account}: 1 tweet (${metrics.like_count || 0} likes)`);
    } catch (err: any) {
      consecutiveErrors++;
      log(`  @${account}: ERROR — ${err.message}`);
    }
  }

  log(`Twitter scraping done: ${allPosts.length} total posts`);
  return allPosts;
}
