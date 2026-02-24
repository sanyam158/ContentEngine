/**
 * =============================================================================
 * Noise2Article — RSS Scraper
 * =============================================================================
 *
 * Fetches items from RSS feeds and normalizes them to RawPost.
 * Intended as additional "fresh news" raw material for article generation.
 * =============================================================================
 */

import Parser from 'rss-parser';
import { RawPost } from './types.js';

type RssItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  author?: string;
};

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [RSS] ${msg}`);
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '...';
}

function pickDate(item: RssItem): string {
  const d = item.isoDate || item.pubDate;
  if (d) {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export async function scrapeRss(feeds: string[], itemsPerFeed: number): Promise<RawPost[]> {
  const parser = new Parser({
    timeout: 15000,
    headers: {
      'User-Agent': 'Noise2Article/1.0 (+RSS)',
      Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
  });

  log(`Scraping ${feeds.length} RSS feeds (${itemsPerFeed} items each)...`);

  const all: RawPost[] = [];
  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const feedName = feed.title || feedUrl;
      const items = (feed.items || []) as unknown as RssItem[];

      const slice = items.slice(0, Math.max(0, itemsPerFeed));
      log(`  ${truncate(feedName, 40)}: ${slice.length} items`);

      for (const item of slice) {
        const title = (item.title || '').trim();
        const link = (item.link || '').trim();
        const snippet = (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').trim();
        if (!title) continue;

        all.push({
          id: `rss_${Buffer.from(`${feedUrl}::${title}`).toString('base64').slice(0, 24)}`,
          source: 'rss',
          title: truncate(title, 200),
          body: truncate(snippet, 500),
          url: link || undefined,
          author: (item.creator || item.author || feedName || 'rss').toString(),
          score: 0,
          commentCount: 0,
          createdAt: pickDate(item),
          feedName: feedName.toString(),
          hasLink: !!link,
          hasNumbers: /\$[\d,]+|\d+%|\d+x|\d+ (?:hours?|mins?)|\d+k\b/i.test(`${title} ${snippet}`),
        });
      }
    } catch (err: any) {
      log(`  Feed error (${feedUrl}): ${err.message}`);
    }
  }

  log(`RSS scraping done: ${all.length} total posts`);
  return all;
}

