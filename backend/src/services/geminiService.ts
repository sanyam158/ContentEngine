import { GoogleGenAI } from '@google/genai';

interface ThreadGenerationOptions {
  script: string;
  toneOfVoice?: string;
  targetAudience?: string;
  researchContext?: string;
}

interface GeneratedThread {
  tweets: string[];
  metadata: {
    totalCharacters: number;
    tweetCount: number;
    generatedAt: string;
  };
}

class GeminiService {
  private model = 'gemini-3-flash-preview';
  private apiKey: string;
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  private async callAPI(userPrompt: string, systemPrompt: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemPrompt}\n\n${userPrompt}`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.8,
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  }

  // Analyzes the script to extract key points and understanding
  async analyzeScript(script: string): Promise<string> {
    const systemPrompt = 'You are a script analyzer that extracts key insights.';
    const userPrompt = `Analyze this video script and extract the key insights, main ideas, and unique perspectives. Keep it concise:

${script}

Provide a brief analysis that captures the essence of the content for Twitter audience.`;

    return this.callAPI(userPrompt, systemPrompt);
  }

  // Generates an authentic thread that matches the creator's voice
  async generateThread(options: ThreadGenerationOptions): Promise<GeneratedThread> {
    const systemPrompt = this.buildSystemPrompt(options.toneOfVoice);

    const userPrompt = `Turn this script into a Twitter thread. Make every tweet count.

Rules:
1. Hook tweet: start with the most interesting/surprising point. No "I want to talk about..." intros
2. Each tweet under 280 characters
3. Keep it conversational - contractions, casual language, real talk
4. Include specific details from the script (numbers, tools, examples)
5. End with something actionable or a strong takeaway
6. Format: numbered list only (1. 2. 3.)
7. Before finalizing, re-read each tweet. If it sounds like AI wrote it, rewrite it

${options.researchContext ? `Research context (use if relevant): ${options.researchContext}` : ''}

Script:
${options.script}

Target audience: ${options.targetAudience || 'Tech-savvy creators and builders'}

Generate the thread:`;

    const threadText = await this.callAPI(userPrompt, systemPrompt);

    // Parse numbered list format (1. tweet, 2. tweet, etc)
    const lines = threadText.split('\n').filter(line => line.trim());
    const tweets = lines
      .map((line) => {
        // Remove numbering (1. 2. 3. etc)
        return line.replace(/^[\d.]\s+/, '').trim();
      })
      .filter((tweet) => tweet.length > 0)
      .map((tweet) => this.cleanTweet(tweet));

    return {
      tweets,
      metadata: {
        totalCharacters: tweets.reduce((sum, t) => sum + t.length, 0),
        tweetCount: tweets.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // Generates multiple variations for A/B testing
  async generateVariations(
    options: ThreadGenerationOptions,
    count: number = 3,
  ): Promise<GeneratedThread[]> {
    const variations: GeneratedThread[] = [];

    for (let i = 0; i < count; i++) {
      const tone = [
        'casual and conversational',
        'professional but witty',
        'storytelling focused',
      ][i % 3];

      const thread = await this.generateThread({
        ...options,
        toneOfVoice: tone,
      });

      variations.push(thread);
    }

    return variations;
  }

  // Builds a system prompt that helps maintain authentic voice
  private buildSystemPrompt(toneRequest?: string): string {
    return `You are helping a creator turn their script into a Twitter thread. The tweets need to sound like a real person typed them on their phone - not like AI generated content.

Rules:
- Each tweet should feel like something you'd actually post. Casual, direct, specific
- Use contractions naturally (don't, won't, it's, can't). Never write "do not" or "cannot"
- Mix short punchy tweets with slightly longer ones for rhythm
- No corporate speak, no marketing language, no AI filler phrases
- Never use: "game-changing", "revolutionary", "leverage", "let's dive in", "buckle up", "it's worth noting"
- Include real details from the script - numbers, names, specifics
- The hook tweet should stop someone mid-scroll. Lead with the most interesting or surprising point

Tone: ${toneRequest || 'Natural and conversational - like texting a smart friend about something cool you found'}

The goal: someone reading this thread should have no idea an AI helped create it.`;
  }

  // Cleans and validates tweet text
  private cleanTweet(tweet: string): string {
    return tweet
      .replace(/^[\d.]+\s*[.)]/g, '') // Remove numbered lists
      .replace(/^[-*]\s+/, '') // Remove bullet points
      .replace(/—/g, '-') // Convert em dashes to regular dashes
      .replace(/–/g, '-') // Convert en dashes to regular dashes
      .trim()
      .split('\n')[0]; // Take first line only
  }
}

export default GeminiService;
export type { ThreadGenerationOptions, GeneratedThread };
