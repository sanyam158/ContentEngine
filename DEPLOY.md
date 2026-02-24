# Deployment Guide

Repo: https://github.com/farizanjum/script2thread

Backend URL: `https://script2thread-backend-plkqgwpzoa-uc.a.run.app`

---

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial deploy setup"
git branch -M main
git remote add origin https://github.com/farizanjum/script2thread.git
git push -u origin main
```

**Important:** Never commit `backend/.env` — it contains secrets. `.gitignore` already excludes it.

---

## Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import `farizanjum/script2thread`
3. **Root Directory**: `frontend` (click Edit, set to `frontend`)
4. **Environment Variable**:
   - Name: `VITE_API_URL`
   - Value: `https://script2thread-backend-plkqgwpzoa-uc.a.run.app/api`
5. Deploy

---

## Step 3: Configure Backend (Cloud Run)

In [Cloud Run Console](https://console.cloud.google.com/run) → script2thread-backend → Edit → Variables & Secrets:

| Variable | Value |
|----------|-------|
| `GEMINI_API_KEY` | Your Gemini API key |
| `TAVILY_API_KEY` | Your Tavily API key |
| `REDDIT_USER_ID` | From Composio dashboard |
| `COMPOSIO_API_KEY` | Your Composio API key |
| `FRONTEND_URL` | Your Vercel URL (e.g. `https://script2thread-xxx.vercel.app`) |

`GCS_BUCKET` and `NODE_ENV` are already set by Cloud Build.

---

## Step 4: GitHub Secrets (for CI/CD + Cron)

Go to repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | JSON key of GCP service account (Cloud Build + Cloud Run permissions) |
| `N2A_BACKEND_URL` | `https://script2thread-backend-plkqgwpzoa-uc.a.run.app` |

---

## Checklist

- [ ] Pushed to GitHub (no `.env` committed)
- [ ] Vercel: imported repo, root `frontend`, `VITE_API_URL` set
- [ ] Cloud Run: GEMINI, TAVILY, REDDIT_USER_ID, COMPOSIO_API_KEY, FRONTEND_URL
- [ ] GitHub Secrets: `GCP_SA_KEY`, `N2A_BACKEND_URL`
- [ ] Rotate any exposed API keys (if `.env` was ever committed)
