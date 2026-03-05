import { request as httpsRequest } from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, Request, Response } from 'express';

const router = Router();
const WORKFLOW_FILE = 'render.yml';
const BRANCH = 'main';

type TupleOption = [string, string];

interface VcgBiasRange {
  min: number;
  max: number;
  default: number;
  step: number;
}

interface VcgConfigFile {
  platforms: Array<{ key: string; label: string; bodyCharLimit: number }>;
  templates: Array<{ key: string; label: string }>;
  themes: TupleOption[];
  pace: TupleOption[];
  animationStyles: TupleOption[];
  fonts: TupleOption[];
  animationSpeeds: TupleOption[];
  defaultBodyTextColor: string;
  bodyFontSizeBiasRange: VcgBiasRange;
  textFontSizeBiasRange: VcgBiasRange;
}

const GH_HEADERS = () => ({
  Authorization: `Bearer ${process.env.VCG_GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
});

const REPO = () => process.env.VCG_GITHUB_REPO || '';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTupleOption = (value: unknown): value is TupleOption =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';

const isBiasRange = (value: unknown): value is VcgBiasRange => {
  if (!isObject(value)) return false;
  return ['min', 'max', 'default', 'step'].every((key) => typeof value[key] === 'number');
};

function parseAndValidateRenderConfig(raw: string): VcgConfigFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('render-config.json is not valid JSON');
  }

  if (!isObject(parsed)) throw new Error('render-config.json must be a JSON object');

  const requiredTupleKeys: Array<keyof Pick<VcgConfigFile, 'themes' | 'pace' | 'animationStyles' | 'fonts' | 'animationSpeeds'>> = [
    'themes',
    'pace',
    'animationStyles',
    'fonts',
    'animationSpeeds',
  ];

  const requiredArrayObjects: Array<keyof Pick<VcgConfigFile, 'platforms' | 'templates'>> = ['platforms', 'templates'];

  for (const key of requiredArrayObjects) {
    if (!Array.isArray(parsed[key])) throw new Error(`render-config.json field "${key}" must be an array`);
  }
  for (const key of requiredTupleKeys) {
    if (!Array.isArray(parsed[key]) || !(parsed[key] as unknown[]).every(isTupleOption)) {
      throw new Error(`render-config.json field "${key}" must be an array of [value, label] tuples`);
    }
  }

  if (!(parsed.platforms as unknown[]).every(p => isObject(p)
    && typeof p.key === 'string'
    && typeof p.label === 'string'
    && typeof p.bodyCharLimit === 'number')) {
    throw new Error('render-config.json field "platforms" has invalid entries');
  }

  if (!(parsed.templates as unknown[]).every(t => isObject(t)
    && typeof t.key === 'string'
    && typeof t.label === 'string')) {
    throw new Error('render-config.json field "templates" has invalid entries');
  }

  if (typeof parsed.defaultBodyTextColor !== 'string') {
    throw new Error('render-config.json field "defaultBodyTextColor" must be a string');
  }
  if (!isBiasRange(parsed.bodyFontSizeBiasRange)) {
    throw new Error('render-config.json field "bodyFontSizeBiasRange" is invalid');
  }
  if (!isBiasRange(parsed.textFontSizeBiasRange)) {
    throw new Error('render-config.json field "textFontSizeBiasRange" is invalid');
  }

  const config: VcgConfigFile = {
    platforms: parsed.platforms as VcgConfigFile['platforms'],
    templates: parsed.templates as VcgConfigFile['templates'],
    themes: parsed.themes as VcgConfigFile['themes'],
    pace: parsed.pace as VcgConfigFile['pace'],
    animationStyles: parsed.animationStyles as VcgConfigFile['animationStyles'],
    fonts: parsed.fonts as VcgConfigFile['fonts'],
    animationSpeeds: parsed.animationSpeeds as VcgConfigFile['animationSpeeds'],
    defaultBodyTextColor: parsed.defaultBodyTextColor as string,
    bodyFontSizeBiasRange: parsed.bodyFontSizeBiasRange as VcgBiasRange,
    textFontSizeBiasRange: parsed.textFontSizeBiasRange as VcgBiasRange,
  };

  return config;
}

function sanitizeDispatchInputs(body: unknown): Record<string, unknown> {
  if (!isObject(body) || !isObject(body.inputs)) {
    throw new Error('Invalid request body. Expected { inputs: { payload: string } }');
  }

  const inputs = { ...body.inputs } as Record<string, unknown>;
  const payloadRaw = inputs.payload;
  if (typeof payloadRaw !== 'string' || payloadRaw.trim().length === 0) {
    throw new Error('inputs.payload must be a JSON string');
  }

  let payloadParsed: unknown;
  try {
    payloadParsed = JSON.parse(payloadRaw);
  } catch {
    throw new Error('inputs.payload is not valid JSON');
  }

  if (!isObject(payloadParsed)) {
    throw new Error('inputs.payload must decode to an object');
  }

  if (typeof payloadParsed.template !== 'string' || payloadParsed.template.trim().length === 0) {
    throw new Error('payload.template is required');
  }
  if (!Array.isArray(payloadParsed.platforms)
    || payloadParsed.platforms.length === 0
    || payloadParsed.platforms.some(p => typeof p !== 'string' || p.trim().length === 0)) {
    throw new Error('payload.platforms must be a non-empty string array');
  }

  delete payloadParsed.contentGoal;

  if (payloadParsed.bodyTextColor !== undefined && typeof payloadParsed.bodyTextColor !== 'string') {
    throw new Error('payload.bodyTextColor must be a string when provided');
  }
  if (payloadParsed.bodyFontSizeBias !== undefined && typeof payloadParsed.bodyFontSizeBias !== 'number') {
    throw new Error('payload.bodyFontSizeBias must be a number when provided');
  }
  if (payloadParsed.textFontSizeBias !== undefined && typeof payloadParsed.textFontSizeBias !== 'number') {
    throw new Error('payload.textFontSizeBias must be a number when provided');
  }

  inputs.payload = JSON.stringify(payloadParsed);
  return inputs;
}

const checkConfig = (res: Response): boolean => {
  if (!process.env.VCG_GITHUB_TOKEN || !REPO()) {
    const missing = [!process.env.VCG_GITHUB_TOKEN && 'VCG_GITHUB_TOKEN', !REPO() && 'VCG_GITHUB_REPO'].filter(Boolean).join(', ');
    console.error(`[VCG] Missing env vars: ${missing}`);
    res.status(500).json({ error: `Missing env vars: ${missing}` });
    return false;
  }
  return true;
};

// POST /api/vcg/trigger — dispatch GitHub Actions workflow
router.post('/trigger', async (req: Request, res: Response) => {
  if (!checkConfig(res)) return;
  let safeInputs: Record<string, unknown>;
  try {
    safeInputs = sanitizeDispatchInputs(req.body);
  } catch (err) {
    return void res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      { method: 'POST', headers: GH_HEADERS(), body: JSON.stringify({ ref: BRANCH, inputs: safeInputs }) }
    );
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[VCG] trigger failed ${resp.status}:`, body);
      return void res.status(resp.status).json({ error: body });
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/vcg/runs?after=TIMESTAMP
router.get('/runs', async (req: Request, res: Response) => {
  if (!checkConfig(res)) return;
  try {
    const after = parseInt(req.query.after as string, 10) || 0;
    const resp = await fetch(
      `https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`,
      { headers: GH_HEADERS() }
    );
    if (!resp.ok) return void res.status(resp.status).json({ error: `GitHub API ${resp.status}` });
    const data = await resp.json() as { workflow_runs: Array<{ created_at: string }> };
    const run = data.workflow_runs.find(r => new Date(r.created_at).getTime() >= after - 5000) || null;
    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/vcg/run-status?id=RUN_ID
router.get('/run-status', async (req: Request, res: Response) => {
  if (!checkConfig(res)) return;
  try {
    const { id } = req.query;
    if (!id) return void res.status(400).json({ error: 'Missing id' });
    const resp = await fetch(
      `https://api.github.com/repos/${REPO()}/actions/runs/${id}`,
      { headers: GH_HEADERS() }
    );
    if (!resp.ok) return void res.status(resp.status).json({ error: `GitHub API ${resp.status}` });
    res.json(await resp.json());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/vcg/artifacts?runId=RUN_ID
router.get('/artifacts', async (req: Request, res: Response) => {
  if (!checkConfig(res)) return;
  try {
    const { runId } = req.query;
    if (!runId) return void res.status(400).json({ error: 'Missing runId' });
    const resp = await fetch(
      `https://api.github.com/repos/${REPO()}/actions/runs/${runId}/artifacts`,
      { headers: GH_HEADERS() }
    );
    if (!resp.ok) return void res.json({ artifacts: [] });
    const data = await resp.json() as { artifacts: unknown[] };
    res.json({ artifacts: data.artifacts || [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const LOCAL_RENDER_CONFIG_PATH = path.join(process.cwd(), 'config', 'render-config.json');

router.get('/config', async (req: Request, res: Response) => {
  try {
    const raw = await fs.readFile(LOCAL_RENDER_CONFIG_PATH, 'utf8');
    const config = parseAndValidateRenderConfig(raw);
    res.json(config);
  } catch (err) {
    console.error('[VCG] Invalid render config:', err);
    res.status(500).json({ error: 'Invalid render config. Please verify backend/config/render-config.json' });
  }
});

// Capture the Location header from a GitHub 302 redirect without following it.
// node:https is used instead of fetch() because fetch's redirect:'manual' returns
// an opaque response where headers are not accessible in Node.js.
function getGitHubRedirectUrl(url: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ContentEngine/1.0',
        },
      },
      (res) => {
        res.resume(); // discard body
        const location = res.headers['location'];
        if (location) {
          resolve(Array.isArray(location) ? location[0] : location);
        } else {
          reject(new Error(`Expected 302 redirect from GitHub, got ${res.statusCode}`));
        }
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// GET /api/vcg/download?artifactId=ID&name=NAME — streams ZIP directly to client
router.get('/download', async (req: Request, res: Response) => {
  if (!checkConfig(res)) return;
  try {
    const { artifactId, name } = req.query;
    if (!artifactId) return void res.status(400).json({ error: 'Missing artifactId' });

    // Step 1: resolve the S3 signed URL from GitHub's 302
    const s3Url = await getGitHubRedirectUrl(
      `https://api.github.com/repos/${REPO()}/actions/artifacts/${artifactId}/zip`,
      process.env.VCG_GITHUB_TOKEN!
    );

    // Step 2: stream from S3 directly to the client
    const filename = `${(name as string) || `artifact-${artifactId}`}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');

    await new Promise<void>((resolve, reject) => {
      const s3Req = httpsRequest(s3Url, { method: 'GET' }, (s3Res) => {
        if (s3Res.headers['content-length']) res.setHeader('Content-Length', s3Res.headers['content-length']);
        s3Res.pipe(res);
        s3Res.on('end', resolve);
        s3Res.on('error', reject);
      });
      s3Req.on('error', reject);
      s3Req.end();
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

export default router;

