/**
 * =============================================================================
 * Gemini API Key Rotator  (with model-downgrade fallback)
 * =============================================================================
 *
 * Two-layer resilience strategy:
 *
 *   Layer 1 — Key rotation
 *     When a key hits its quota (HTTP 429 / "resource exhausted"), the rotator
 *     automatically switches to the next configured key and retries the same
 *     call.  Requires GEMINI_API_KEYS (comma-separated) in .env.
 *
 *   Layer 2 — Model downgrade
 *     If EVERY key is exhausted for the requested model, the rotator retries
 *     the call with the next model in the downgrade chain, cycling through all
 *     keys again at the lower tier.
 *
 *     Downgrade chain:
 *       gemini-2.5-pro  →  gemini-3-flash-preview  →  gemini-2.5-flash  →  gemini-2.5-flash-lite
 *       gemini-3-flash-preview  →  gemini-2.5-flash  (→ continues above)
 *       gemini-2.5-flash        →  gemini-2.5-flash-lite
 *       gemini-2.5-flash-lite   →  (no further fallback, throws)
 *
 * Usage in .env:
 *   GEMINI_API_KEYS=key1,key2,key3    ← preferred (multi-key)
 *   GEMINI_API_KEY=key1               ← also supported (single-key fallback)
 *
 * The GeminiKeyRotator exposes the same `models.generateContent()` interface
 * as GoogleGenAI, so it is a transparent drop-in replacement for all callers.
 * =============================================================================
 */

import { GoogleGenAI } from '@google/genai';

// ─── Model downgrade chain ───────────────────────────────────────────────────

/**
 * Maps each model to the next cheaper/lower model to try when all keys are
 * exhausted at the current tier.  Missing entry = no further fallback.
 */
const MODEL_FALLBACKS: Record<string, string> = {
  'gemini-2.5-pro':      'gemini-3-flash-preview',
  'gemini-3-flash-preview': 'gemini-2.5-flash',
  'gemini-2.5-flash':    'gemini-2.5-flash-lite',
};

// ─── Quota error detection ───────────────────────────────────────────────────

function isQuotaError(err: any): boolean {
  // HTTP 429 or gRPC RESOURCE_EXHAUSTED (code 8)
  const status = err?.status ?? err?.response?.status ?? err?.code;
  if (status === 429 || status === 8) return true;

  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('429')
  );
}

// ─── Rotator ─────────────────────────────────────────────────────────────────

/**
 * Wraps multiple GoogleGenAI clients and automatically:
 *   1. Rotates to the next API key on quota errors.
 *   2. Downgrades to a cheaper model if all keys are exhausted.
 *
 * Compatible with all pipeline stages typed as `GoogleGenAI` — cast with
 * `as unknown as GoogleGenAI` at the call site if TypeScript requires it.
 */
export class GeminiKeyRotator {
  private readonly clients: GoogleGenAI[];
  private readonly rawKeys: string[];
  private currentIndex = 0;

  constructor(apiKeys: string[]) {
    if (!apiKeys.length) {
      throw new Error('GeminiKeyRotator: at least one API key is required');
    }
    this.rawKeys = apiKeys;
    this.clients = apiKeys.map(key => new GoogleGenAI({ apiKey: key }));
    console.log(`[GeminiRotator] Initialized with ${apiKeys.length} Gemini key(s)`);
  }

  /** Number of keys configured. */
  get keyCount(): number {
    return this.clients.length;
  }

  /**
   * The first raw API key string — useful for constructors (e.g. ImageService)
   * that still accept a plain string rather than a GoogleGenAI instance.
   */
  get firstKey(): string {
    return this.rawKeys[0];
  }

  /**
   * Tries all keys for one model tier, rotating on quota errors.
   * Returns the response if any key succeeds, or throws the last quota error
   * if every key is exhausted.
   * Throws immediately on non-quota errors.
   */
  private async tryAllKeysForModel(params: any): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt < this.clients.length; attempt++) {
      const keyNum = this.currentIndex + 1;
      const client = this.clients[this.currentIndex];

      try {
        return await client.models.generateContent(params);
      } catch (err: any) {
        if (isQuotaError(err)) {
          this.currentIndex = (this.currentIndex + 1) % this.clients.length;
          console.warn(
            `[GeminiRotator] Key #${keyNum} hit quota — rotating to key #${this.currentIndex + 1} of ${this.clients.length}`
          );
          lastError = err;
        } else {
          // Non-quota error (bad request, invalid key, network, etc.) — surface immediately
          throw err;
        }
      }
    }

    // All keys exhausted at this model tier
    throw lastError;
  }

  /**
   * Drop-in replacement for `GoogleGenAI.models`.
   *
   * Retry strategy:
   *   1. Try every key with the requested model.
   *   2. If all fail with quota → downgrade to next model → try every key again.
   *   3. Repeat until the downgrade chain is exhausted, then throw.
   */
  readonly models = {
    generateContent: async (params: any): Promise<any> => {
      let currentModel: string = params.model;
      const triedModels = new Set<string>();

      while (true) {
        triedModels.add(currentModel);
        const currentParams = currentModel === params.model
          ? params
          : { ...params, model: currentModel };

        try {
          return await this.tryAllKeysForModel(currentParams);
        } catch (err: any) {
          if (!isQuotaError(err)) throw err; // Non-quota — don't continue

          // All keys exhausted at this tier — look for a cheaper model
          const fallbackModel = MODEL_FALLBACKS[currentModel];

          if (!fallbackModel || triedModels.has(fallbackModel)) {
            // No more fallbacks — give up with a descriptive error
            const chain = [...triedModels].join(' → ');
            throw new Error(
              `[GeminiRotator] All ${this.clients.length} key(s) exhausted across model chain: ${chain}. ` +
              `Add more keys to GEMINI_API_KEYS or wait for quota to reset. ` +
              `Last error: ${err.message}`
            );
          }

          console.warn(
            `[GeminiRotator] All keys exhausted for "${currentModel}" — downgrading to "${fallbackModel}"`
          );
          currentModel = fallbackModel;
        }
      }
    },
  };
}

// ─── Env helper ──────────────────────────────────────────────────────────────

/**
 * Reads Gemini API keys from environment variables.
 *
 * Priority:
 *   1. GEMINI_API_KEYS  — comma-separated list  (e.g. "key1,key2,key3")
 *   2. GEMINI_API_KEY   — single key fallback    (backwards-compatible)
 *
 * Returns an empty array if neither variable is set.
 */
export function parseGeminiApiKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    const keys = multi.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const single = process.env.GEMINI_API_KEY?.trim();
  if (single) return [single];
  return [];
}
