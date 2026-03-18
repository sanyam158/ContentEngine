import fs from 'fs/promises';
import path from 'path';

export interface SavedVcgArtifact {
  id: number;
  name: string;
  downloadPath: string;
}

export interface SavedVcgRenderInput {
  runId: number;
  runUrl: string;
  template: string;
  title: string;
  description?: string;
  platforms: string[];
  artifacts: SavedVcgArtifact[];
}

export interface SavedVcgRender extends SavedVcgRenderInput {
  id: string;
  createdAt: string;
}

const STORAGE_KEY = 'vcg-renders.json';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface RenderCache {
  data: SavedVcgRender[];
  expiresAt: number;
}

let renderCache: RenderCache | null = null;

function getCached(): SavedVcgRender[] | null {
  if (!renderCache || Date.now() > renderCache.expiresAt) {
    renderCache = null;
    return null;
  }
  return renderCache.data;
}

function setCache(data: SavedVcgRender[]): void {
  renderCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

function invalidateCache(): void {
  renderCache = null;
}

async function readFromGist(): Promise<SavedVcgRender[]> {
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
    if (!res.ok) return [];
    const gist = await res.json() as { files: Record<string, { content: string }> };
    const file = gist.files[STORAGE_KEY];
    if (!file?.content) return [];
    const parsed = JSON.parse(file.content);
    return Array.isArray(parsed) ? parsed as SavedVcgRender[] : [];
  } catch {
    return [];
  }
}

async function writeToGist(items: SavedVcgRender[]): Promise<void> {
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
      files: {
        [STORAGE_KEY]: {
          content: JSON.stringify(items, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[VCG Storage] Gist write failed: ${res.status} - ${body}`);
  }
}

async function readFromGCS(): Promise<SavedVcgRender[]> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) return [];

  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(STORAGE_KEY);

  try {
    const [contents] = await file.download();
    const parsed = JSON.parse(contents.toString('utf8'));
    return Array.isArray(parsed) ? parsed as SavedVcgRender[] : [];
  } catch {
    return [];
  }
}

async function writeToGCS(items: SavedVcgRender[]): Promise<void> {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) return;

  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(STORAGE_KEY);
  await file.save(JSON.stringify(items, null, 2), { contentType: 'application/json' });
}

function localStoragePath(): string {
  return path.join(process.cwd(), 'data', STORAGE_KEY);
}

async function ensureLocalDir(): Promise<void> {
  await fs.mkdir(path.dirname(localStoragePath()), { recursive: true });
}

async function readFromLocal(): Promise<SavedVcgRender[]> {
  try {
    const raw = await fs.readFile(localStoragePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as SavedVcgRender[] : [];
  } catch {
    return [];
  }
}

async function writeToLocal(items: SavedVcgRender[]): Promise<void> {
  await ensureLocalDir();
  const target = localStoragePath();
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(temp, target);
}

async function readAll(): Promise<SavedVcgRender[]> {
  if (process.env.GIST_ID && process.env.GITHUB_TOKEN) return readFromGist();
  if (process.env.GCS_BUCKET) return readFromGCS();
  return readFromLocal();
}

async function readAllCached(): Promise<SavedVcgRender[]> {
  const hit = getCached();
  if (hit) return hit;
  const fresh = await readAll();
  setCache(fresh);
  return fresh;
}

async function writeAll(items: SavedVcgRender[]): Promise<void> {
  if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
    await writeToGist(items);
    return;
  }
  if (process.env.GCS_BUCKET) {
    await writeToGCS(items);
    return;
  }
  await writeToLocal(items);
}

export async function listSavedVcgRenders(): Promise<SavedVcgRender[]> {
  return readAllCached();
}

export async function saveVcgRender(input: SavedVcgRenderInput): Promise<SavedVcgRender> {
  const existing = await readAllCached();
  const item: SavedVcgRender = {
    ...input,
    id: `run-${input.runId}`,
    createdAt: new Date().toISOString(),
  };

  const filtered = existing.filter((entry) => entry.runId !== input.runId);
  const merged = [item, ...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeAll(merged);
  invalidateCache();
  return item;
}

export async function deleteSavedVcgRender(id: string): Promise<boolean> {
  const existing = await readAllCached();
  const filtered = existing.filter((entry) => entry.id !== id);
  if (filtered.length === existing.length) return false;
  await writeAll(filtered);
  invalidateCache();
  return true;
}
