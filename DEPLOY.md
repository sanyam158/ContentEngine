# Deployment Guide

## Architecture

| Part | Service | Cost | Auto-deploy |
|------|---------|------|-------------|
| Backend (Node/Express) | Render | Free | ✅ on every push to `main` |
| Frontend (React/Vite) | Vercel | Free | ✅ on every push to `main` |

After the one-time setup below, deploying new changes is just:
```bash
git add .
git commit -m "your changes"
git push
```
Both services redeploy automatically.

---

## One-time Setup

### Step 1 — Push your code to GitHub

Make sure your repo is on GitHub and `.env` is **never committed** (it's already in `.gitignore`).

```bash
git add .
git commit -m "deploy setup"
git push origin main
```

---

### Step 2 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → sign up free with GitHub

2. Click **New +** → **Web Service**

3. Click **Connect a repository** → select your GitHub repo

4. Fill in the settings:

   | Field | Value |
   |-------|-------|
   | **Name** | `contentengine-backend` (or anything) |
   | **Root Directory** | `backend` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm ci && npm run build` |
   | **Start Command** | `node dist/index.js` |
   | **Branch** | `main` |
   | **Auto-Deploy** | `Yes` |

5. Scroll down to **Environment Variables** and add these:

   | Key | Value |
   |-----|-------|
   | `GEMINI_API_KEYS` | `key1,key2,key3` (comma-separated; use `GEMINI_API_KEY` if you only have one) |
   | `TAVILY_API_KEY` | your Tavily key |
   | `COMPOSIO_API_KEY` | your Composio key |
   | `REDDIT_USER_ID` | your Composio entity ID (e.g. `pg-test-xxx`) |
   | `NODE_ENV` | `production` |

   > `FRONTEND_URL` will be added in Step 4 once you have the Vercel URL.

6. Click **Create Web Service** — Render builds and deploys (takes ~2 min)

7. **Copy the Render URL** shown at the top (e.g. `https://contentengine-backend.onrender.com`)

---

### Step 3 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up free with GitHub

2. Click **Add New → Project**

3. Import your GitHub repository

4. Set **Root Directory** to `frontend`
   *(click "Edit" next to Root Directory before deploying)*

5. Under **Environment Variables** add:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://contentengine-backend.onrender.com/api` ← your Render URL + `/api` |

6. Click **Deploy** — takes ~1 min

7. **Copy the Vercel URL** (e.g. `https://contentengine-abc123.vercel.app`)

---

### Step 4 — Link backend to frontend (CORS)

1. Go back to [render.com](https://render.com) → your service → **Environment**
2. Add one more variable:

   | Key | Value |
   |-----|-------|
   | `FRONTEND_URL` | `https://contentengine-abc123.vercel.app` ← your Vercel URL |

3. Render redeploys automatically (or click **Manual Deploy**)

---

## Checklist

- [ ] Pushed to GitHub (no `.env` committed)
- [ ] Render: repo connected, `backend` root, build/start commands set
- [ ] Render: `GEMINI_API_KEYS`, `TAVILY_API_KEY`, `COMPOSIO_API_KEY`, `REDDIT_USER_ID`, `NODE_ENV` set
- [ ] Vercel: `frontend` root, `VITE_API_URL` pointing to Render URL
- [ ] Render: `FRONTEND_URL` set to Vercel URL
- [ ] Test: open Vercel URL in browser → trigger a pipeline run

---

## Updating the App (Future Deployments)

```bash
git add .
git commit -m "describe your change"
git push
```

- Render detects changes in `backend/` → rebuilds and redeploys backend
- Vercel detects changes in `frontend/` → rebuilds and redeploys frontend

No manual steps required.

---

## Adding / Updating Environment Variables

- **Render**: Dashboard → your service → **Environment** → edit → service redeploys
- **Vercel**: Dashboard → your project → **Settings → Environment Variables** → edit → redeploy

---

## Notes

### Free tier limits
- **Render free tier**: the service sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake up. This is fine for personal/low-traffic use.
- **Vercel free tier**: no sleeping, unlimited bandwidth for static sites.

### Gemini key rotation (`GEMINI_API_KEYS`)
Set multiple comma-separated keys to avoid hitting the free-tier daily quota:
```
GEMINI_API_KEYS=AIza...key1,AIza...key2,AIza...key3
```
When one key is exhausted, the pipeline automatically rotates to the next. If all keys are exhausted, it falls back to a cheaper model automatically (`gemini-3-pro-preview` → `gemini-3-flash-preview` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`).

### Custom domain on Vercel
Vercel lets you add a custom domain for free under Settings → Domains.

---

## Alternative: Google Cloud Run (Advanced)

The existing `cloudbuild.yaml` and `.github/workflows/deploy-backend.yml` support deploying to Cloud Run.
This requires a GCP account, a service account JSON key stored as a GitHub Secret (`GCP_SA_KEY`), and the following env vars set in the Cloud Run console:

`GEMINI_API_KEYS`, `TAVILY_API_KEY`, `COMPOSIO_API_KEY`, `REDDIT_USER_ID`, `FRONTEND_URL`

Cloud Run never sleeps (faster cold starts) but requires more initial GCP setup.
