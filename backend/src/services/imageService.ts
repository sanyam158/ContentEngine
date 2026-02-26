import { GoogleGenAI } from '@google/genai';

interface GenerateImageResult {
  base64: string;
  mimeType: string;
  prompt: string;
  thoughtSignatures?: string[];
  conversationHistory?: any[];
}

// ─── Aspect ratio → pixel dimensions for Pollinations.ai ────────────────────

function aspectRatioToDimensions(ratio: string): [number, number] {
  const map: Record<string, [number, number]> = {
    '16:9':  [1920, 1080],
    '9:16':  [1080, 1920],
    '1:1':   [1024, 1024],
    '4:3':   [1024,  768],
    '3:4':   [ 768, 1024],
    '3:2':   [1536, 1024],
    '2:3':   [1024, 1536],
    '21:9':  [2048,  880],
    '4:5':   [ 820, 1024],
    '5:4':   [1024,  820],
  };
  return map[ratio] ?? [1920, 1080];
}

class ImageService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate an image from a text prompt using Pollinations.ai (free, no quota).
   * referenceImages and conversationHistory are accepted for API compatibility
   * but are not used — Pollinations.ai does not support multi-turn editing.
   */
  async generateImage(
    prompt: string,
    referenceImages?: { base64: string; mimeType: string }[],
    conversationHistory?: any[],
    aspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  ): Promise<GenerateImageResult> {
    if (referenceImages?.length) {
      console.log('[ImageService] Note: referenceImages not supported — ignored');
    }
    if (conversationHistory?.length) {
      console.log('[ImageService] Note: conversationHistory not supported — ignored');
    }

    const [w, h] = aspectRatioToDimensions(aspectRatio ?? '16:9');

    // ── Primary: HuggingFace FLUX.1-schnell (free, just needs HF_TOKEN) ──────
    const hfToken = process.env.HF_TOKEN;
    if (hfToken) {
      return this.generateImageHuggingFace(prompt, w, h, hfToken);
    }

    // ── Fallback: Pollinations.ai ────────────────────────────────────────────
    return this.generateImagePollinations(prompt, w, h);
  }

  private async generateImageHuggingFace(
    prompt: string,
    w: number,
    h: number,
    token: string
  ): Promise<GenerateImageResult> {
    const HF_MODEL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
    const MAX_ATTEMPTS = 4; // extra attempt to absorb cold-start
    const TIMEOUT_MS = 120_000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        console.log(`[ImageService] HuggingFace attempt ${attempt}/${MAX_ATTEMPTS} (${w}×${h})...`);
        const res = await fetch(HF_MODEL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt.slice(0, 1000),
            parameters: { width: w, height: h, num_inference_steps: 4 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        // 503 = model is loading — wait the suggested time then retry
        if (res.status === 503) {
          const err = await res.json().catch(() => ({}) as any);
          const waitSec = Math.min(Math.ceil(err.estimated_time ?? 20), 40);
          console.log(`[ImageService] HuggingFace model loading — waiting ${waitSec}s...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue; // don't count as a failed attempt
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HuggingFace HTTP ${res.status}: ${body.slice(0, 200)}`);
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          const body = await res.text().catch(() => '');
          throw new Error(`HuggingFace returned non-image type "${contentType}": ${body.slice(0, 200)}`);
        }

        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        console.log('[ImageService] Image generated successfully via HuggingFace');
        return { base64, mimeType: contentType, prompt };

      } catch (err: any) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        lastError = isAbort ? new Error(`HuggingFace timed out after ${TIMEOUT_MS / 1000}s`) : err;
        console.warn(`[ImageService] HuggingFace attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 5_000));
        }
      }
    }
    throw lastError ?? new Error('HuggingFace image generation failed after all attempts');
  }

  private async generateImagePollinations(
    prompt: string,
    w: number,
    h: number
  ): Promise<GenerateImageResult> {
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 1500));
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${w}&height=${h}&model=flux&nologo=true&private=true&seed=${seed}`;

    const MAX_ATTEMPTS = 3;
    const TIMEOUT_MS = 90_000;
    const RETRY_DELAY_MS = 16_000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        console.log(`[ImageService] Pollinations.ai attempt ${attempt}/${MAX_ATTEMPTS} (${w}×${h})...`);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Pollinations.ai HTTP ${response.status}: ${body.slice(0, 200)}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          const body = await response.text().catch(() => '');
          throw new Error(`Pollinations.ai returned non-image content-type "${contentType}": ${body.slice(0, 200)}`);
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        console.log('[ImageService] Image generated successfully via Pollinations.ai');
        return { base64, mimeType: contentType, prompt };

      } catch (err: any) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        lastError = isAbort ? new Error(`Pollinations.ai timed out after ${TIMEOUT_MS / 1000}s`) : err;
        console.warn(`[ImageService] Pollinations attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    throw lastError ?? new Error('Pollinations.ai image generation failed');
  }

  /**
   * Auto-generate a cover image for a tweet thread.
   * Uses an AI art director (via the same Gemini client) to analyze the topic
   * and craft a unique, fitting visual direction — then generates the image.
   */
  async generateCoverImage(
    firstTweetText: string,
    threadContext: string
  ): Promise<GenerateImageResult> {
    const artDirectedPrompt = await this.artDirectCoverImage(firstTweetText, threadContext);
    return this.generateImage(artDirectedPrompt, undefined, undefined, '16:9');
  }

  /**
   * AI art director for Twitter/X cover images.
   * Analyzes the tweet topic and generates a unique visual concept each time.
   */
  private async artDirectCoverImage(
    tweetText: string,
    threadContext: string
  ): Promise<string> {
    const COVER_ART_DIRECTOR = `You are an elite visual art director specializing in social media imagery. Your job: analyze a Twitter/X thread topic and write a highly specific, unique image generation prompt.

PROCESS:
1. Read the tweet topic carefully
2. Identify the core concept, emotion, or tension
3. Choose a visual metaphor that captures the essence (NOT a literal depiction)
4. Pick a distinctive art style from the palette below
5. Write a detailed, concrete prompt with specific colors, composition, textures

STYLE PALETTE — pick ONE and commit fully:
- Isometric tech diorama: 3D isometric scene, miniature world, detailed objects, warm lighting, tilt-shift depth
- Paper cut layered art: Multi-layered paper cutout effect, sharp shadows between layers, matte textures, craft aesthetic
- Risograph editorial: Misregistered halftone dots, limited 2-3 color palette, grainy texture, zine aesthetic, bold shapes
- Neon noir: Deep black background, selective neon glow (pick 1-2 colors), cinematic lighting, moody atmosphere
- Retro computing: CRT scan lines, pixel-adjacent art, terminal green or amber phosphor, command-line aesthetic
- Botanical tech fusion: Organic plant forms growing through or merging with circuit boards/tech, nature meets machine
- Geometric data viz: Abstract data visualization as art, flowing particles, connected nodes, information as beauty
- Woodblock print: Bold black outlines, limited flat color fills, Japanese ukiyo-e inspired but with tech subjects
- Blueprint schematic: Technical drawing aesthetic, white lines on deep blue, annotations, measurements, engineering beauty
- Bauhaus poster: Strong geometric shapes, primary colors plus black, asymmetric layout, modernist typography influence
- Glitch art: Databent visuals, RGB channel splitting, scan line corruption, digital decay as aesthetic
- Ink wash painting: Chinese/Japanese brush painting style, flowing ink gradients, negative space, minimalist but expressive

ABSOLUTE RULES:
- NO text, words, letters, numbers, or typography in the image
- NO realistic human faces or photorealistic people
- NO generic dark gradient with floating shapes — that is banned
- NO purple-on-black with glowing orbs — that is the default AI slop, never do it
- NO generic "futuristic" with random hexagons and particles
- Every prompt must be visually DISTINCT from any other topic
- Name specific hex colors or color names, not vague descriptions
- Describe exactly what objects/shapes appear and where in the frame
- The image must feel like it was commissioned by a top-tier design studio

OUTPUT: One image prompt only. No explanation, no preamble, no markdown.`;

    const styleRotation = [
      'Use an isometric or paper-cut style this time.',
      'Use a risograph or woodblock print style this time.',
      'Use a neon noir or glitch art style this time.',
      'Use a botanical tech fusion or ink wash style this time.',
      'Use a blueprint schematic or retro computing style this time.',
      'Use a Bauhaus poster or geometric data viz style this time.',
    ];
    const hint = styleRotation[Math.floor(Math.random() * styleRotation.length)];

    const userMessage = `Tweet thread topic: ${tweetText.substring(0, 250)}

Context: ${threadContext.substring(0, 350)}

${hint}

Write the image prompt. Remember: NO text/words in the image, NO generic AI slop. Make it visually unique to this specific topic.`;

    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ role: 'user', parts: [{ text: `${COVER_ART_DIRECTOR}\n\n${userMessage}` }] }],
        config: { temperature: 0.9, maxOutputTokens: 600 },
      });

      const generated = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (generated && generated.length > 50) {
        console.log(`[ImageService] Art director generated prompt: "${generated.substring(0, 120)}..."`);
        return `${generated}\n\nCritical: Do NOT include any text, words, letters, or typography in the image. Widescreen 16:9 composition.`;
      }
    } catch (err: any) {
      console.warn(`[ImageService] Art director failed, using fallback: ${err.message}`);
    }

    return this.buildFallbackCoverPrompt(tweetText, threadContext);
  }

  /**
   * Fallback prompt builder if the art director call fails.
   * Still much better than the old static template — uses topic analysis.
   */
  private buildFallbackCoverPrompt(tweetText: string, threadContext: string): string {
    const palettes = [
      'deep teal (#0D4F4F), warm coral (#FF6B6B), and cream (#FFF5E1)',
      'midnight blue (#1A1A40), electric amber (#FFB627), and cool grey (#8B8B8B)',
      'forest green (#2D5016), burnt orange (#CC5500), and off-white (#F5F0E8)',
      'deep crimson (#8B0000), steel blue (#4682B4), and warm beige (#D4C5A9)',
      'rich indigo (#3F00FF), golden yellow (#FFD700), and charcoal (#333333)',
      'slate (#708090), rose (#FF007F), and ivory (#FFFFF0)',
    ];
    const styles = [
      'isometric miniature diorama with tiny detailed objects and warm directional lighting',
      'layered paper cutout with sharp shadows between layers and a handcrafted feel',
      'bold risograph print with halftone dots, grain texture, and misregistered color layers',
      'neon elements glowing against a deep matte black background, cinematic and moody',
      'technical blueprint schematic with white lines on deep blue, engineering aesthetic',
      'flowing ink wash painting with expressive brush strokes and deliberate negative space',
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const style = styles[Math.floor(Math.random() * styles.length)];

    return `Create an image in the style of ${style}.

The visual concept should abstractly represent this topic: ${tweetText.substring(0, 200)}

Color palette: ${palette}. Widescreen 16:9 composition.

Important: Do NOT include any text, words, letters, or typography in the image. No realistic human faces. The image should feel like a premium editorial illustration from a top design studio.`;
  }

  /**
   * Regenerate an image with a custom user prompt, optionally using reference images.
   * If the user gives a detailed prompt, we respect it. If it's short/vague, we enhance it.
   */
  async regenerateImage(
    customPrompt: string,
    referenceImages?: { base64: string; mimeType: string }[]
  ): Promise<GenerateImageResult> {
    const isDetailedPrompt = customPrompt.length > 100 || customPrompt.includes(',');

    let finalPrompt: string;
    if (isDetailedPrompt) {
      finalPrompt = `${customPrompt}\n\nCreate a high-quality, visually striking image suitable for social media. Widescreen 16:9 composition. No text or typography in the image.`;
    } else {
      try {
        const response = await this.client.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [{ role: 'user', parts: [{ text: `You are a visual art director. The user wants an image for social media with this brief: "${customPrompt}"

Write a detailed, specific image generation prompt that brings this to life. Include:
- A specific art style (e.g., isometric, risograph, ink wash, neon noir, paper cut, etc.)
- Exact colors (use names or hex codes)
- Composition details (what goes where)
- Mood and lighting

Rules: NO text/typography in the image. NO generic glowing orbs on dark backgrounds. Make it unique and premium-feeling.

Output only the prompt, nothing else.` }] }],
          config: { temperature: 0.85, maxOutputTokens: 400 },
        });

        const enhanced = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (enhanced && enhanced.length > 50) {
          finalPrompt = `${enhanced}\n\nDo NOT include any text, words, or typography in the image.`;
        } else {
          finalPrompt = `${customPrompt}. Style: Premium editorial illustration, visually striking, unique composition. No text in the image.`;
        }
      } catch {
        finalPrompt = `${customPrompt}. Style: Premium editorial illustration, visually striking, unique composition. No text in the image.`;
      }
    }

    return this.generateImage(finalPrompt, referenceImages);
  }

  /**
   * Edit an existing image using conversation history with thought signatures.
   * This enables multi-turn image editing where the model maintains context.
   * 
   * @param editPrompt - The new prompt describing the edit (e.g., "Make it daytime")
   * @param previousResult - The result from a previous generateImage call, containing conversationHistory
   * @param referenceImages - Optional new reference images for this edit
   */
  async editImage(
    editPrompt: string,
    previousResult: GenerateImageResult,
    referenceImages?: { base64: string; mimeType: string }[]
  ): Promise<GenerateImageResult> {
    if (!previousResult.conversationHistory) {
      throw new Error('Previous result must include conversationHistory for editing. Use generateImage first.');
    }

    console.log(`[ImageService] Editing image with prompt: "${editPrompt}"`);

    // Use the conversation history from previous result
    return this.generateImage(editPrompt, referenceImages, previousResult.conversationHistory);
  }
}

export default ImageService;
export type { GenerateImageResult };
