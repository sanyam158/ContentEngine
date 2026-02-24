/**
 * =============================================================================
 * Noise2Article — Article Writer (Content Engine)
 * =============================================================================
 *
 * Takes the top-ranked theme with its contributing posts + Tavily context
 * and generates a ready-to-post article in first-person developer voice.
 *
 * Output: A complete article with title, hook, body, and closing.
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import { Theme, GeneratedArticle, NicheContext, DEFAULT_NICHE_CONTEXT } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [Writer] ${msg}`);
}

function currentDateContext(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Prompts ────────────────────────────────────────────────────────────────

function buildWriterSystemPrompt(brandVoice: string, bangerDefinition: string): string {
  return `You are a writer for a ${brandVoice} who sounds like a real person, not an AI. Today is {DATE}.

The best content in this niche: ${bangerDefinition}.

You write the way people actually talk - direct, specific, opinionated when appropriate, and always grounded in real details. You adapt your voice to whatever fits the topic best.

VOICE (adapt to fit the article):
- Second person tutorial works great for how-tos: "you can set this up by...", "if you're doing X, try this"
- Third person neutral works for news/analysis: "teams are finding that...", "the consensus seems to be..."  
- Mix them naturally. Don't lock into one voice for the whole piece
- Always use contractions: don't, won't, it's, you're, they're. Never "do not" or "it is"
- Vary sentence length. Short fragments hit hard. Then you can follow up with something that explains the point in more detail and gives context

SOURCING (how to reference material):
- Reference sources naturally in the text: "spotted on Reddit", "from a HN discussion", "one dev shared", "according to a recent analysis"
- Do NOT include Reddit usernames, author handles, or "@mentions" in the article text
- Do NOT write formal citations. Work the attribution into the flow of the sentence
- If something came from a specific post, say what you learned from it - don't just link-dump
- The system will attach a formal sources list at the end automatically

WHAT MAKES GOOD WRITING:
- Short paragraphs. 1-3 lines max. White space is your friend
- Every sentence needs a concrete detail - a file name, a command, a number, a tool name. Kill vague sentences
- Be honest about limitations. "This doesn't work great for X" is more credible than pretending everything is perfect
- Use lists when they genuinely help (steps, options, comparisons). Don't force them
- Open with something that hooks - a surprising fact, a problem the reader recognizes, or a bold claim
- Close with something actionable. What should the reader do next?

ABSOLUTELY BANNED (instant disqualification):
- "In today's rapidly evolving..." or any variation
- "Let's dive in/into", "Without further ado", "Buckle up"  
- "Game-changing", "revolutionary", "paradigm shift", "groundbreaking"
- "Comprehensive guide", "definitive guide", "ultimate guide"
- "Leverage", "utilize", "harness the power"
- "It's worth noting that...", "Interestingly enough...", "Needless to say..."
- "At its core...", "The landscape of...", "In the world of..."
- "Whether you're a beginner or an expert..."
- "From X to Y, this covers everything"
- "Look no further", "Search no more"
- "Transformative potential", "unprecedented"
- "Robust", "seamless", "cutting-edge", "state-of-the-art"
- Any sentence that starts with "So," or "Now," as filler
- Claiming "I built/did/discovered X" unless clearly quoting a specific source
- "We" when you mean "the reader" - use "you" instead
- "This article will explore/examine/delve into..."

TITLE RULES:
- Titles must NOT start with "I", "My", or "We"
- Keep them specific and interesting: "How to set up agent memory that actually persists", "5 tools replacing your paid AI stack (that actually work)"
- Conversational English. No AI slop. No clickbait that doesn't deliver.`;
}

const WRITER_USER_PROMPT = `Write an article about the topic below. Make it sound like a real person wrote it.

TOPIC/THEME: {THEME_NAME}
THEME DESCRIPTION: {THEME_DESCRIPTION}

RAW MATERIAL (contributing posts from Reddit, HN, Twitter, RSS):
{RAW_MATERIALS}

ADDITIONAL CONTEXT (from web research):
{TAVILY_CONTEXT}

STYLE (match this energy - conversational, direct, specific):
"What you quickly learn about running multiple AI agents is that without structure, they're just expensive chaos. They will duplicate work, forget context, overwrite each other, make decisions that contradict previously agreed upon strategies. It was painfully annoying at first.

It's basically the same problems that dysfunctional human teams have."

Another example:
"Okay so last week was kind of wild. I was refreshing Hacker News and X trying to keep up. It was a mess. Here's the thing though - after spending the week actually using both of these, I have some thoughts."

Notice: short paragraphs, honest tone, concrete details, no marketing fluff. The em-dash character (—) is BANNED - use '-' or commas instead.

ARTICLE STRUCTURE (natural flow, don't over-header it):
1. TITLE: Specific hook. Formats that work: "How to <result> with <tool>", "<N> things that actually <work/matter>", "What <happened> and why it matters"
2. HOOK (2-3 sentences): Get the reader's attention immediately. No throat-clearing
3. BODY: The meat. Steps, insights, details, specifics. Use section headers sparingly and make them conversational ("What actually changed", "The part nobody talks about")
4. CLOSING: 1-2 sentences. What should the reader do? Keep it short

SOURCES IN THE TEXT:
- When referencing material from the raw posts, weave it in naturally: "spotted on Reddit", "from a HN thread", "one dev found that..."  
- Do NOT include @usernames, u/usernames, or author handles in the article body
- The system will attach a sources section automatically - you don't need to add one at the end

FORMATTING:
- Output TWO versions:
  (A) x_text: X-ready plain text (NO markdown headers, NO code fences). Short paragraphs, blank lines between ideas
  (B) markdown: Full markdown with headers and code blocks if relevant
- For x_text: use simple section labels like "What changed" or "The setup" (no ## or #)
- LENGTH: 1200-2000 words in markdown

SELF-CHECK (do this before outputting):
- Read every sentence. Does it sound like something a real person would say? If not, rewrite it
- Is there a single sentence that starts with "In today's..." or "Let's dive..."? Delete it
- Does every paragraph have at least one concrete detail? If not, add one or cut the paragraph
- Would you actually post this on X? If it feels like AI wrote it, it needs more work

OUTPUT FORMAT (strict JSON):
{
  "title": "The article title (NOT starting with I/My/We)",
  "hook": "First 2-3 sentences as standalone tweet. No em-dash. Conversational.",
  "x_text": "Full X-ready plain text article with title at top. No markdown.",
  "markdown": "Full article in markdown",
  "tags": ["tag1", "tag2", "tag3"],
  "estimated_read_time": "5 min read",
  "thread_tweets": [
    "Tweet 1 (hook - max 280 chars)",
    "Tweet 2 (key insight - max 280 chars)",
    "Tweet 3 (details - max 280 chars)",
    "Tweet 4 (surprising bit - max 280 chars)",
    "Tweet 5 (takeaway + CTA - max 280 chars)"
  ]
}

CRITICAL: Output ONLY the JSON object. No markdown fences, no explanation.`;

// ─── JSON Parser ────────────────────────────────────────────────────────────

function parseJsonResponse(text: string): any {
  // Strip markdown fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse
  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  // Try extracting JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  // Repair truncated JSON
  let jsonStr = cleaned;
  const openIdx = jsonStr.indexOf('{');
  if (openIdx >= 0) {
    jsonStr = jsonStr.substring(openIdx);
    // Close open strings
    const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) jsonStr += '"';
    // Close open arrays
    const openBrackets = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    jsonStr += ']'.repeat(Math.max(0, openBrackets));
    // Close open objects
    const openBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
    jsonStr += '}'.repeat(Math.max(0, openBraces));
    try { return JSON.parse(jsonStr); } catch { /* fall through */ }
  }

  return null;
}

function enforceTweetLimit(text: string, maxChars: number = 280): string {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

// ─── Writer ─────────────────────────────────────────────────────────────────

export async function writeArticle(
  gemini: GoogleGenAI,
  theme: Theme,
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<GeneratedArticle | null> {
  log(`Writing article for theme: "${theme.name}" (${theme.posts.length} posts)...`);

  // Build raw materials — cap to avoid frying the LLM (8 posts max, truncate body)
  const sources = theme.posts.slice(0, 8);
  const rawMaterials = sources
    .map((p, i) => {
      const src = p.source.toUpperCase();
      const sub = p.subreddit ? ` (r/${p.subreddit})` : '';
      const feed = p.feedName ? ` (feed: ${p.feedName})` : '';
      const link = p.url || '';
      const body = (p.body || '').slice(0, 300);
      return `[${i + 1}] [${src}${sub}${feed}] "${p.title}"
Score: ${p.score} | Banger: ${p.bangerScore}/10
${body}${body.length >= 300 ? '...' : ''}
${link ? `URL: ${link}` : ''}`;
    })
    .join('\n\n---\n\n');

  // Build Tavily context — keep concise (max 3 items, truncate snippets)
  const tavilyContext = theme.tavilyContext && theme.tavilyContext.length > 0
    ? theme.tavilyContext.slice(0, 5).map((ctx, i) =>
        `[${i + 1}] "${ctx.title}" - ${ctx.url}\n${(ctx.snippet || '').slice(0, 300)}`
      ).join('\n\n')
    : 'No additional context available.';

  // Build the prompt
  const userPrompt = WRITER_USER_PROMPT
    .replace('{THEME_NAME}', theme.name)
    .replace('{THEME_DESCRIPTION}', theme.description)
    .replace('{RAW_MATERIALS}', rawMaterials)
    .replace('{TAVILY_CONTEXT}', tavilyContext);

  const systemPrompt = buildWriterSystemPrompt(nicheContext.brandVoice, nicheContext.bangerDefinition).replace('{DATE}', currentDateContext());

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] },
      ],
      config: { temperature: 0.8, maxOutputTokens: 8192 },
    });

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!rawText) {
      log('ERROR: Empty response from LLM');
      return null;
    }

    const parsed = parseJsonResponse(rawText);

    if (!parsed || !parsed.title || !(parsed.x_text || parsed.markdown)) {
      log(`ERROR: Invalid article JSON. Raw (first 500): ${rawText.substring(0, 500)}`);
      // Fallback: treat the entire response as markdown body
      if (rawText.length > 100) {
        log('Falling back to raw text as article body');
        const lines = rawText.split('\n');
        const title = lines[0]?.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '') || theme.name;
        return {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          title,
          hook: lines.slice(0, 2).join(' ').substring(0, 280),
          xText: `${title}\n\n${rawText}`,
          markdown: rawText,
          tags: [],
          estimatedReadTime: `${Math.ceil(rawText.split(/\s+/).length / 200)} min read`,
          threadTweets: [],
          sources: [
            ...sources.map(p => ({ source: p.source as 'reddit' | 'hn' | 'twitter' | 'rss', title: p.title, url: p.url })),
            ...(theme.tavilyContext || []).filter(ctx => ctx.url).map(ctx => ({ source: 'rss' as const, title: ctx.title, url: ctx.url })),
          ],
          themeId: theme.id,
          themeName: theme.name,
        };
      }
      return null;
    }

    const article: GeneratedArticle = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: String(parsed.title || '').replace(/\u2014/g, ' - '),
      hook: String(parsed.hook || '').replace(/\u2014/g, ' - '),
      xText: (() => {
        const raw = String(parsed.x_text || '').replace(/\u2014/g, ' - ').trim();
        if (!raw) return `${parsed.title}\n\n${String(parsed.markdown || parsed.body || '').replace(/\u2014/g, ' - ').trim()}`.trim();
        const a = raw.toLowerCase().replace(/\s+/g, ' ').trim();
        const b = String(parsed.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (b && a.startsWith(b.slice(0, Math.min(30, b.length)))) return raw;
        return `${parsed.title}\n\n${raw}`.trim();
      })(),
      markdown: String(parsed.markdown || parsed.body || '').replace(/\u2014/g, ' - '),
      tags: parsed.tags || [],
      estimatedReadTime:
        parsed.estimated_read_time ||
        `${Math.ceil(String(parsed.markdown || parsed.body || '').split(/\s+/).length / 200)} min read`,
      threadTweets: Array.isArray(parsed.thread_tweets)
        ? parsed.thread_tweets.map((t: string) => enforceTweetLimit(String(t).replace(/\u2014/g, ' - ')))
        : [],
      sources: [
        ...sources.map(p => ({ source: p.source as 'reddit' | 'hn' | 'twitter' | 'rss', title: p.title, url: p.url })),
        ...(theme.tavilyContext || []).filter(ctx => ctx.url).map(ctx => ({ source: 'rss' as const, title: ctx.title, url: ctx.url })),
      ],
      themeId: theme.id,
      themeName: theme.name,
    };

    const wordCount = article.markdown.split(/\s+/).length;
    log(`Article generated: "${article.title}" (${wordCount} words, ${article.threadTweets.length} thread tweets)`);

    return article;
  } catch (err: any) {
    log(`ERROR writing article: ${err.message}`);
    return null;
  }
}

/**
 * Write articles for the top N themes
 */
export async function writeArticles(
  gemini: GoogleGenAI,
  themes: Theme[],
  count: number = 2,
  nicheContext: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<GeneratedArticle[]> {
  const articles: GeneratedArticle[] = [];
  const topThemes = themes.slice(0, count);

  for (const theme of topThemes) {
    const article = await writeArticle(gemini, theme, nicheContext);
    if (article) {
      articles.push(article);
    }
  }

  log(`Writing complete: ${articles.length} articles generated from ${topThemes.length} themes`);
  return articles;
}
