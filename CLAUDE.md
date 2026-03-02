# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`/backend`)
```bash
npm run dev       # tsx watch — hot reload during development
npm run build     # tsc → dist/
npm start         # node dist/index.js (production)
```

### Frontend (`/frontend`)
```bash
npm run dev        # Vite dev server on port 3000
npm run build      # tsc && vite build → dist/
npm run type-check # tsc --noEmit
npm run preview    # Local production preview
```

### Running locally
Start both independently. The Vite dev server proxies `/api/*` to `http://localhost:5000`, so no CORS config is needed in dev.

## Architecture Overview

Full-stack monorepo: `backend/` (Express + TypeScript) + `frontend/` (React 18 + Vite + TypeScript). Both use ES modules (`"type": "module"`) and strict TypeScript.

### Pipelines (core product)

**Noise2Article** — Automated niche article discovery pipeline:
1. Scrape (Reddit, HN, Twitter, RSS in parallel)
2. Pre-filter (rule-based)
3. Gatekeeper (LLM batch filtering)
4. Synthesize & Rank (LLM groups posts into themes)
5. Deduplicate (check against stored articles)
6. Enrich (Tavily web research)
7. Write (full article + LinkedIn/Instagram repurposing in one Gemini call)
8. Images (Gemini image generation → ImgBB upload)

**Script2Thread** — Paste a script/text, generate Twitter threads with Gemini.

**Idea2Content** — Generate full articles from a topic idea.

### Niche System
Defined in `backend/src/services/noise2article/types.ts` as `NICHE_PRESETS`. Active niches: `ai-tech`, `personal-finance`, `health-wellness`, `travel`, `geopolitics`, `hinduism`, `indian-politics`, `stock-market`. To add a niche: add to `NICHE_PRESETS` and add a dropdown option in the frontend. No other code changes needed.

### Storage
No SQL database — JSON-based storage only. Priority order:
1. **GitHub Gist** (if `GIST_ID` + `GITHUB_TOKEN` set)
2. **GCS bucket** (if `GCS_BUCKET` set)
3. **Local file** — `backend/data/n2a-articles.json`

Abstraction layer in `backend/src/services/noise2article/storage.ts`.

### Authentication
Stateless Bearer tokens (HMAC-SHA256, 12-hour TTL). Credentials in `backend/src/config/authUsers.ts`. The `requireAuth` middleware attaches `authUser` to the request. Frontend stores token in localStorage; Axios interceptors auto-attach it and broadcast a logout event on 401.

### Gemini Key Rotation
`backend/src/services/geminiKeyRotator.ts` parses `GEMINI_API_KEYS` (comma-separated) and rotates on quota exhaustion. Model downgrade chain on failure: `gemini-2.5-pro → gemini-3-flash-preview → gemini-2.5-flash → gemini-2.5-flash-lite`.

### Repurposed Content (LinkedIn + Instagram)
One Gemini call produces both platforms as JSON `{ linkedin, instagram_hook, instagram_caption }`. Two paths:
- **Path A** — inline with article writing (`writeArticles()` in the pipeline)
- **Path B** — on-demand via `POST /api/n2a/articles/:id/repurpose`

Storage merges platforms without overwriting existing ones.

### Service Initialization Pattern
Backend services use lazy initialization to avoid premature loading before `.env`:
```typescript
let service: MyService | null = null;
const getService = () => { if (!service) service = new MyService(...); return service; };
```

### Frontend API Client
`frontend/src/services/api.ts` — Axios instance with base URL `VITE_API_URL || http://localhost:5000/api`. Interceptors handle auth header injection and 401 logout.

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Required:
- `GEMINI_API_KEYS` — comma-separated keys (or `GEMINI_API_KEY` for single key)
- `TAVILY_API_KEY`
- `COMPOSIO_API_KEY`
- `FRONTEND_URL` — used for CORS (`http://localhost:3000` in dev)

Optional:
- `GIST_ID` + `GITHUB_TOKEN` — GitHub Gist storage
- `GCS_BUCKET` — Google Cloud Storage
- `IMGBB_API_KEY` — image hosting (base64 stripped after upload)
- `REDDIT_USER_ID` — Composio entity ID
- `AUTH_TOKEN_TTL_HOURS` — token lifetime (default: 12)

## Deployment
- **Frontend**: Vercel, root directory `frontend/`
- **Backend**: Render, root directory `backend/`
- **Cron**: GitHub Actions (`.github/workflows/n2a-cron.yml`) runs every 12 hours, warms Render via `/api/health`, authenticates, then runs Noise2Article sequentially for all niches with `platforms=["instagram","linkedin"]` and a 5-minute gap between niches
- **Cron secrets**: `N2A_BACKEND_URL`, `N2A_CRON_USERNAME`, `N2A_CRON_PASSWORD`
