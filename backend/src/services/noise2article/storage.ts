/**
 * =============================================================================
 * Noise2Article — Storage for generated articles
 * =============================================================================
 *
 * Priority (first match wins):
 * 1. GitHub Gist  — GIST_ID + GITHUB_TOKEN env vars (Render / any host)
 * 2. GCS bucket   — GCS_BUCKET env var (Cloud Run)
 * 3. Local file   — <backend>/data/n2a-articles.json (dev)
 * =============================================================================
 */

import fs from 'fs/promises';
import path from 'path';
import { GeneratedArticle } from './types.js';

export type SavedArticleMeta = Pick<
  GeneratedArticle,
  'id' | 'createdAt' | 'title' | 'themeId' | 'themeName' | 'estimatedReadTime' | 'tags' | 'niche'
>;

const STORAGE_KEY = 'n2a-articles.json';

// --- GitHub Gist storage (Render / any host) ---
async function readFromGist(): Promise<GeneratedArticle[]> {
  const gistId = process.env.GIST_ID;
  const token = process.env.GITHUB_TOKEN;
  if (!gistId || !token) return [];

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      console.warn(`[Storage] Gist read failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const gist = await res.json() as { files: Record<string, { content: string }> };
    const file = gist.files[STORAGE_KEY];
    if (!file?.content) return [];
    const parsed = JSON.parse(file.content);
    return Array.isArray(parsed) ? (parsed as GeneratedArticle[]) : [];
  } catch (err) {
    console.warn('[Storage] Gist read error:', err);
    return [];
  }
}

/** Upload a base64 image to ImgBB and return the permanent URL, or null on failure. */
async function uploadToImgBB(base64: string): Promise<string | null> {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return null;
  try {
    const form = new URLSearchParams();
    form.set('key', apiKey);
    form.set('image', base64);
    const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = await res.json() as { success: boolean; data?: { url: string } };
    return data.success && data.data?.url ? data.data.url : null;
  } catch {
    return null;
  }
}

/**
 * For each article that has a raw base64 image:
 *  - If IMGBB_API_KEY is set: upload to ImgBB → store permanent URL → strip base64
 *  - If already has imageUrl: just strip base64 (skip re-upload)
 *  - If no IMGBB_API_KEY: keep base64 as-is
 * Runs for ALL storage backends so local, GCS, and Gist behave the same.
 */
async function processImages(items: GeneratedArticle[]): Promise<GeneratedArticle[]> {
  if (!process.env.IMGBB_API_KEY) return items;
  return Promise.all(items.map(async a => {
    if (!a.image?.base64) return a;
    if (a.imageUrl) {
      const { base64: _dropped, ...imageMeta } = a.image;
      return { ...a, image: imageMeta };
    }
    const url = await uploadToImgBB(a.image.base64);
    const { base64: _dropped, ...imageMeta } = a.image;
    return url ? { ...a, image: imageMeta, imageUrl: url } : { ...a, image: imageMeta };
  }));
}

async function writeToGist(items: GeneratedArticle[]): Promise<void> {
  const gistId = process.env.GIST_ID;
  const token = process.env.GITHUB_TOKEN;
  if (!gistId || !token) return;

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [STORAGE_KEY]: { content: JSON.stringify(items, null, 2) } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Storage] Gist write failed: ${res.status} — ${body}`);
  }
}

// --- GCS storage (Cloud Run) ---
async function readFromGCS(): Promise<GeneratedArticle[]> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) return [];

  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(STORAGE_KEY);

  try {
    const [contents] = await file.download();
    const parsed = JSON.parse(contents.toString('utf8'));
    if (Array.isArray(parsed)) return parsed as GeneratedArticle[];
    return [];
  } catch {
    return [];
  }
}

async function writeToGCS(items: GeneratedArticle[]): Promise<void> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) return;

  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(STORAGE_KEY);
  await file.save(JSON.stringify(items, null, 2), { contentType: 'application/json' });
}

// --- Local file storage (dev) ---
function localStoragePath(): string {
  return path.join(process.cwd(), 'data', STORAGE_KEY);
}

async function ensureLocalDir(): Promise<void> {
  const dir = path.dirname(localStoragePath());
  await fs.mkdir(dir, { recursive: true });
}

async function readFromLocal(): Promise<GeneratedArticle[]> {
  try {
    const p = localStoragePath();
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as GeneratedArticle[];
    return [];
  } catch {
    return [];
  }
}

async function writeToLocal(items: GeneratedArticle[]): Promise<void> {
  await ensureLocalDir();
  const p = localStoragePath();
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

// --- Unified interface ---
async function readAll(): Promise<GeneratedArticle[]> {
  if (process.env.GIST_ID && process.env.GITHUB_TOKEN) return readFromGist();
  if (process.env.GCS_BUCKET) return readFromGCS();
  return readFromLocal();
}

async function writeAll(items: GeneratedArticle[]): Promise<void> {
  const processed = await processImages(items);
  if (process.env.GIST_ID && process.env.GITHUB_TOKEN) return writeToGist(processed);
  if (process.env.GCS_BUCKET) return writeToGCS(processed);
  return writeToLocal(processed);
}

export async function saveGeneratedArticles(articles: GeneratedArticle[]): Promise<number> {
  if (!articles.length) return 0;

  // Drop articles that failed to generate properly (no id, title, or body)
  const valid = articles.filter(a => {
    if (!a.id || !a.title?.trim() || !a.xText?.trim() || a.xText.trim().length < 100) {
      console.warn(`[Storage] Skipping malformed article (id=${a.id}, title="${a.title?.slice(0, 40)}")`);
      return false;
    }
    return true;
  });
  if (!valid.length) return 0;

  const existing = await readAll();
  const byId = new Map(existing.map(a => [a.id, a]));
  for (const a of valid) {
    byId.set(a.id, a);
  }
  const merged = Array.from(byId.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  await writeAll(merged);
  return valid.length;
}

export async function listSavedArticles(): Promise<SavedArticleMeta[]> {
  const all = await readAll();
  return all.map(a => ({
    id: a.id,
    createdAt: a.createdAt,
    title: a.title,
    themeId: a.themeId,
    themeName: a.themeName,
    estimatedReadTime: a.estimatedReadTime,
    tags: a.tags || [],
    niche: a.niche,
  }));
}

/** Normalize URL for deduplication (strip hash, query, trailing slash). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.href.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().trim();
  }
}

/** Returns normalized source URLs from all saved articles for deduplication. */
export async function listSavedArticleSourceUrls(): Promise<Set<string>> {
  const all = await readAll();
  const urls = new Set<string>();
  for (const a of all) {
    for (const s of a.sources || []) {
      if (s.url) urls.add(normalizeUrl(s.url));
    }
  }
  return urls;
}

export async function getSavedArticle(id: string): Promise<GeneratedArticle | null> {
  const all = await readAll();
  return all.find(a => a.id === id) || null;
}

export async function deleteSavedArticle(id: string): Promise<boolean> {
  const existing = await readAll();
  const filtered = existing.filter(a => a.id !== id);
  if (filtered.length === existing.length) return false;
  await writeAll(filtered);
  return true;
}

export async function updateArticleNiche(id: string, niche: string): Promise<GeneratedArticle | null> {
  const existing = await readAll();
  const idx = existing.findIndex(a => a.id === id);
  if (idx < 0) return null;
  existing[idx] = { ...existing[idx], niche };
  await writeAll(existing);
  return existing[idx];
}

export async function updateArticleRepurposed(
  id: string,
  repurposed: GeneratedArticle['repurposed'],
): Promise<GeneratedArticle | null> {
  const existing = await readAll();
  const idx = existing.findIndex(a => a.id === id);
  if (idx < 0) return null;
  existing[idx] = { ...existing[idx], repurposed: { ...existing[idx].repurposed, ...repurposed } };
  await writeAll(existing);
  return existing[idx];
}

export async function updateArticleImage(id: string, image: { base64: string; mimeType: string; prompt: string }): Promise<GeneratedArticle | null> {
  const existing = await readAll();
  const idx = existing.findIndex(a => a.id === id);
  if (idx < 0) return null;
  // Clear imageUrl so the next Gist write re-uploads the new image to ImgBB
  existing[idx] = { ...existing[idx], image, imageUrl: undefined };
  await writeAll(existing);
  return existing[idx];
}
