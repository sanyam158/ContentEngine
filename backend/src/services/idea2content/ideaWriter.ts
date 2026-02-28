/**
 * =============================================================================
 * Idea2Content — Idea Writer
 * =============================================================================
 *
 * Writes a full article from a user idea + research brief.
 * Unlike the noise2article writer which synthesizes scraped posts,
 * this writer is prompt-driven: the user's idea is the starting point
 * and the research brief provides supporting facts.
 *
 * Output: GeneratedArticle (same shape as noise2article — fully compatible
 * with ArticleCard, SavedArticles, repurposeFromArticle, etc.)
 * =============================================================================
 */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { GeneratedArticle, NicheContext } from '../noise2article/types.js';
import type { ResearchResult } from './researcher.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [IdeaWriter] ${msg}`);
}

function currentDateContext(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function enforceTweetLimit(text: string, maxChars = 280): string {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  return trimmed.length <= maxChars ? trimmed : trimmed.slice(0, maxChars - 1).trimEnd() + '…';
}

function stripTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

function parseJsonResponse(text: string): any {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  cleaned = stripTrailingCommas(cleaned);
  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(stripTrailingCommas(objMatch[0])); } catch { /* fall through */ }
  }

  // Repair truncated JSON
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

// ─── Prompts ─────────────────────────────────────────────────────────────────

function buildSystemPrompt(brandVoice: string, bangerDefinition: string): string {
  return `You are a writer for a ${brandVoice} who sounds like a real person, not an AI. Today is {DATE}.

The best content in this niche: ${bangerDefinition}.

You write the way people actually talk - direct, specific, opinionated when appropriate, and always grounded in real details. You adapt your voice to whatever fits the topic best.

VOICE (adapt to fit the article):
- Second person tutorial works great for how-tos: "you can set this up by...", "if you're doing X, try this"
- Third person neutral works for news/analysis: "teams are finding that...", "the consensus seems to be..."
- Mix them naturally. Don't lock into one voice for the whole piece
- Always use contractions: don't, won't, it's, you're, they're. Never "do not" or "it is"
- Vary sentence length. Short fragments hit hard. Then you can follow up with something that explains the point in more detail and gives context

SOURCING (how to reference the research):
- Reference sources naturally in the text: "recent research shows", "according to recent data", "analysts found that"
- Do NOT cite URLs or domain names inline — work the insight into the sentence
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

function buildUserPrompt(prompt: string, researchBrief: string): string {
  const hasResearch = researchBrief.trim().length > 0;

  return `Write an article about the idea below. Make it sound like a real person wrote it.

IDEA/TOPIC: ${prompt}

${hasResearch ? `RESEARCH NOTES (ground the article in these real facts — cite naturally):
${researchBrief}` : 'No external research available — write from knowledge, be specific and concrete.'}

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

SOURCING IN THE TEXT:
- Weave research findings in naturally: "recent data shows", "according to analysts", "a recent study found"
- Do NOT include URLs or domain names inline
- The system will attach a sources section automatically

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
}

// ─── Main Writer ──────────────────────────────────────────────────────────────

export async function writeArticleFromIdea(
  gemini: GoogleGenAI,
  prompt: string,
  research: ResearchResult,
  nicheContext: NicheContext,
): Promise<GeneratedArticle | null> {
  log(`Writing article for: "${prompt.slice(0, 60)}..." (${research.sources.length} research sources)`);

  const systemPrompt = buildSystemPrompt(nicheContext.brandVoice, nicheContext.bangerDefinition)
    .replace('{DATE}', currentDateContext());
  const userPrompt = buildUserPrompt(prompt, research.brief);

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] }],
      config: { temperature: 0.8, maxOutputTokens: 8192 },
    });

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!rawText) {
      log('ERROR: Empty response from LLM');
      return null;
    }

    const parsed = parseJsonResponse(rawText);

    if (!parsed || !parsed.title || !(parsed.x_text || parsed.markdown)) {
      log(`ERROR: Invalid article JSON. Raw (first 400): ${rawText.substring(0, 400)}`);
      // Fallback: use raw text as markdown body
      if (rawText.length > 100) {
        log('Falling back to raw text as article body');
        const lines = rawText.split('\n');
        const title = lines[0]?.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '') || prompt;
        return buildArticle({ title, rawText, prompt, research, nicheContext });
      }
      return null;
    }

    return buildArticle({ parsed, prompt, research, nicheContext });
  } catch (err: any) {
    log(`ERROR writing article: ${err.message}`);
    return null;
  }
}

// ─── Article Builder ──────────────────────────────────────────────────────────

function buildArticle({
  parsed,
  rawText,
  prompt,
  research,
  nicheContext,
}: {
  parsed?: any;
  rawText?: string;
  prompt: string;
  research: ResearchResult;
  nicheContext: NicheContext;
}): GeneratedArticle {
  const themeId = crypto.randomUUID();
  const themeName = prompt.length > 60 ? prompt.slice(0, 60).trimEnd() + '...' : prompt;

  // Sources from research (Tavily)
  const sources: GeneratedArticle['sources'] = research.sources
    .filter(s => s.url)
    .map(s => ({ source: 'tavily' as const, title: s.title, url: s.url }));

  if (parsed) {
    const title = String(parsed.title || '').replace(/\u2014/g, ' - ');
    const hook  = String(parsed.hook  || '').replace(/\u2014/g, ' - ');
    const rawX  = String(parsed.x_text || '').replace(/\u2014/g, ' - ').trim();
    const md    = String(parsed.markdown || parsed.body || '').replace(/\u2014/g, ' - ');

    // Prepend title to x_text if not already there
    const xText = (() => {
      if (!rawX) return `${title}\n\n${md.trim()}`.trim();
      const a = rawX.toLowerCase().replace(/\s+/g, ' ').trim();
      const b = title.toLowerCase().replace(/\s+/g, ' ').trim();
      return (b && a.startsWith(b.slice(0, Math.min(30, b.length)))) ? rawX : `${title}\n\n${rawX}`.trim();
    })();

    const article: GeneratedArticle = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title,
      hook,
      xText,
      markdown: md,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      estimatedReadTime: parsed.estimated_read_time ||
        `${Math.ceil(md.split(/\s+/).length / 200)} min read`,
      threadTweets: Array.isArray(parsed.thread_tweets)
        ? parsed.thread_tweets.map((t: string) => enforceTweetLimit(String(t).replace(/\u2014/g, ' - ')))
        : [],
      sources,
      themeId,
      themeName,
      niche: nicheContext.id,
    };

    const wordCount = article.markdown.split(/\s+/).length;
    log(`Article generated: "${article.title}" (${wordCount} words, ${article.threadTweets.length} tweets)`);
    return article;
  }

  // Fallback path (raw text)
  const lines = (rawText || '').split('\n');
  const title = lines[0]?.replace(/^#+\s*/, '').replace(/^["']|["']$/g, '') || prompt;
  const body = rawText || '';

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title,
    hook: lines.slice(1, 3).join(' ').substring(0, 280),
    xText: `${title}\n\n${body}`.trim(),
    markdown: body,
    tags: [],
    estimatedReadTime: `${Math.ceil(body.split(/\s+/).length / 200)} min read`,
    threadTweets: [],
    sources,
    themeId,
    themeName,
    niche: nicheContext.id,
  };
}
