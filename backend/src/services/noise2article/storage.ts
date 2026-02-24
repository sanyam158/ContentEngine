/**
 * =============================================================================
 * Noise2Article — Storage for generated articles
 * =============================================================================
 *
 * - Local: JSON file at <backend>/data/n2a-articles.json
 * - GCP: GCS bucket when GCS_BUCKET env var is set (for Cloud Run)
 * =============================================================================
 */

import fs from 'fs/promises';
import path from 'path';
import { GeneratedArticle } from './types.js';

export type SavedArticleMeta = Pick<
  GeneratedArticle,
  'id' | 'createdAt' | 'title' | 'themeId' | 'themeName' | 'estimatedReadTime' | 'tags'
>;

const STORAGE_KEY = 'n2a-articles.json';

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
  if (process.env.GCS_BUCKET) return readFromGCS();
  return readFromLocal();
}

async function writeAll(items: GeneratedArticle[]): Promise<void> {
  if (process.env.GCS_BUCKET) return writeToGCS(items);
  return writeToLocal(items);
}

export async function saveGeneratedArticles(articles: GeneratedArticle[]): Promise<number> {
  if (!articles.length) return 0;
  const existing = await readAll();
  const byId = new Map(existing.map(a => [a.id, a]));
  for (const a of articles) {
    byId.set(a.id, a);
  }
  const merged = Array.from(byId.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  await writeAll(merged);
  return articles.length;
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

export async function updateArticleImage(id: string, image: { base64: string; mimeType: string; prompt: string }): Promise<GeneratedArticle | null> {
  const existing = await readAll();
  const idx = existing.findIndex(a => a.id === id);
  if (idx < 0) return null;
  existing[idx] = { ...existing[idx], image };
  await writeAll(existing);
  return existing[idx];
}
