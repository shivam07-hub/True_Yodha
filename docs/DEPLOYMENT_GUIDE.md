# Deployment Guide — Local → Git → GitHub → Auto-Deploy

---

## How Code Travels to Production

```
Your machine (Local / Virtual env)
    ↓  git add + git commit
Local Git repository (your machine, .git folder)
    ↓  git push origin feature/my-branch
GitHub (remote repository — cloud)
    ↓  Pull Request opened: feature/my-branch → develop
GitHub Actions CI (automated tests run)
    ↓  Tests pass → merge to develop
develop branch (staging — Vercel auto-deploys a preview URL)
    ↓  Pull Request opened: develop → main (when ready for production)
main branch
    ↓  Vercel detects push to main → builds Next.js → deploys
Production URL (e.g. mirror.app)
```

---

## Step-by-Step: First Time Setup

### 1. Initialise Git locally

```bash
cd /Users/incognito/True_Yodha
git init
git branch -M main
```

### 2. Create GitHub repository

1. Go to github.com → Name: `True_Yodha` | Visibility: **Private** | No README (you already have files)
3. Click **Create repository**
4. Copy the remote URL shown

### 3. Connect local repo to GitHub

```bash
git remote add origin
git add .
git commit -m "chore: initial project scaffold"
git push -u origin main
```

### 4. Create the develop branch

```bash
git checkout -b develop
git push -u origin develop
```

### 5. Protect the main branch (on GitHub.com)

Settings → Branches → Add branch protection rule → Branch name: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging (add backend-ci, frontend-ci)
- ✅ Do not allow bypassing the above settings

---

## Daily Workflow

```bash
# Always start from develop, always pull first
git checkout develop
git pull origin develop

# Create a feature branch
git checkout -b feature/scoring-engine

# Work. Commit often with specific files.
git add backend/app/services/scoring_engine.py
git commit -m "feat: implement mirror score XP computation"

# Push and open a PR on GitHub
git push origin feature/scoring-engine
# → GitHub → Pull requests → New pull request → base: develop, compare: feature/scoring-engine
```

---

## How Auto-Deploy Works

| Branch | What Happens |
|--------|-------------|
| Any feature branch pushed | Nothing automatic |
| PR opened to `develop` | GitHub Actions runs CI (tests + lint) |
| Merged to `develop` | Vercel creates a **preview URL** (staging) |
| Merged to `main` | Vercel builds and deploys to **production URL** |

You never deploy manually. Every merge to `main` is a production release.

---

## Connecting Vercel

1. vercel.com → Add New Project → Import from GitHub → select `mirror-app`
2. Framework preset: **Next.js**
3. Need to add TailCSS and ShadeCN - Do it when working on frontend.
3. Root directory: **`frontend`** (important — not the repo root)
4. Add environment variables (from your `.env.local`)
5. Deploy → Vercel gives you a URL like `mirror-app.vercel.app`
6. Vercel auto-watches `main` — every push to main = auto-deploy

---

## Connecting Railway (Backend)

1. railway.app → New Project → Deploy from GitHub → select `True_Yodha`
2. Root directory: `backend`
3. Railway detects the `Dockerfile` automatically
4. Add environment variables (from your `backend/.env`)
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Deploy → test with: `curl https://YOUR-RAILWAY-URL/health`