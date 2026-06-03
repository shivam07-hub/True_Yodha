# Deployment Guide — Local → Git → GitHub → Auto-Deploy

---

## PRODUCTION ARCHITECTURE (canonical — verified 2026-06-03)

> Single source of truth for the live topology. If anything here disagrees with an
> older diagram below, **this section wins.** Mirrored in `CLAUDE.md` + `AGENTS.md`.

**ENV SPLIT POLICY: Supabase = 1 env (shared) · Railway = 2 (dev + prod) · Vercel = 2 (prod + preview/dev).**
Only the database is single — deliberate: <10k users, want all real user data in one place. Do NOT split Supabase until scale justifies it.

```
 Vercel project "truemirror" (2 envs)
   ├─ Production  → himyro.com (+www, +truemirror.vercel.app)  NEXT_PUBLIC_API_URL=https://api.himyro.com ─┐
   └─ Preview/Dev → vercel preview URLs                        NEXT_PUBLIC_API_URL=https://truemirror.up.railway.app ─┐
                                                                                                                     │
   PROD API  ◀───────────────────────────────────────────────────────────────────────────────────────────────────┘
   mirror-backend-prod · api.himyro.com · branch main                              DEV API ◀──────────────────────────┘
        │                                                                          mirror-backend-dev · truemirror.up.railway.app · branch Develop
        └──────────────┬──────────────────────────┬──────────────────────────────────────┘
                       ▼                           ▼                  (both backends share the worker + Redis + DB)
                  Supabase (ONE DB)            Redis (ONE)  ───▶  True_Yodha WORKER (2/2 replicas, branch Develop)
                gipvxuugajk… shared        shared queue + budget   python -m app.workers.jobs_compute_worker
```

**Railway** — project `clever-embrace` (`a15c0013-…`), ONE Railway env object `production` (`f6a22e25-…`). The two **logical environments (dev/prod) are the two backend services**, sharing one worker + one Redis:

| Service | ID | Role | Branch | Start command | Public URL |
|---|---|---|---|---|---|
| `mirror-backend-dev` | `149a7bdc` | **DEV API** — ACTIVE (Vercel preview/dev hits this) | `Develop` | `uvicorn app.main:app …` | `truemirror.up.railway.app` |
| `mirror-backend-prod` | `6f9d873b` | **PROD API** (live backend) | `main` | `uvicorn app.main:app --host 0.0.0.0 --port 8000` | `https://api.himyro.com` (+ `…up.railway.app`) |
| `True_Yodha` | `1b3dca5a` | **WORKER** (durable RQ runner, ADR-0008), **shared by dev+prod** | `Develop` | `python -m app.workers.jobs_compute_worker` | internal only |
| `Redis` | `7f3503cf` | RQ queue + provider budget (+`redis-volume`), **shared by dev+prod** | — | — | `redis.railway.internal:6379` |

All services = same repo `shivam07-hub/True_Yodha`, root `/backend`, builder RAILPACK; differ by branch + start command.

**Key facts (don't re-derive, don't get confused):**
- **ONE Supabase DB** `gipvxuugajkugntwkeiz`, shared by both dev+prod backends + worker. A dev-env test upload writes to prod Supabase. **Single by design** (policy above) — do not propose splitting.
- **Shared-infra couplings (known, accepted at this scale):** (a) dev + prod jobs share ONE Redis queue + ONE `llm:budget:slots` bucket; (b) worker runs `Develop` while prod API runs `main` → prod jobs processed by slightly-ahead worker code. Full per-env isolation (separate Redis + `api-dev.himyro.com`) is documented but **NOT built** — see `docs/runbooks/railway-dev-main-env-split.md`.
- **`ALLOWED_ORIGINS` env var is DEAD** — not read anywhere. CORS is hardcoded `allow_origins=["*"], allow_credentials=False` in `backend/app/main.py:41`. Safe because auth is bearer-token (no cookies). To lock origins, wire `main.py` (code change).
- **DNS on GoDaddy.** `api` → CNAME `rm336p0v.up.railway.app`. `_railway-verify.api` → TXT `railway-verify=<token>` (**single** `railway-verify=` prefix — doubling it blocks cert issuance; this cost real time on 2026-06-03). Railway custom-domain cert needs BOTH the CNAME and TXT verified or it serves the wildcard `*.up.railway.app` cert → TLS name mismatch → client gets `SSL: no alternative certificate subject name matches` / curl 000.
- **Manage Railway via MCP** (`mcp__railway__*`). `list_variables`/`get_service_config` read only the *linked* service unless you pass `service_id` (snake_case, not camelCase). `remove_service`'s confirm-boolean is broken over MCP → final hard-delete of a service needs a Railway dashboard click.
- **Cutover runbook** (changing the backend a domain points at): fix DNS → wait for Railway green check + cert (`curl https://api.himyro.com/health` → 200, not 000) → THEN flip `NEXT_PUBLIC_API_URL` in Vercel + redeploy → verify → only then retire the old service. Flipping Vercel before the cert is live = prod outage.

---

> ## ⚠️ EVERYTHING BELOW THIS LINE IS SUPERSEDED (historical first-time-setup, 2026-04)
>
> Kept only as a git-flow reference. The **PRODUCTION ARCHITECTURE** section above is canonical.
> The legacy sections below contain stale/wrong facts — corrections:
>
> | Legacy says (WRONG) | Reality (2026-06-03) |
> |---|---|
> | Production URL `mirror.app` | **`himyro.com`** (frontend) / **`api.himyro.com`** (backend API) |
> | Vercel URL `mirror-app.vercel.app` / project `mirror-app` | Vercel project **`truemirror`**, domain `himyro.com` |
> | Branch `develop` (lowercase) | Branch **`Develop`** (capital D) |
> | "Railway → select `True_Yodha`" = the backend | Backend API = **`mirror-backend-prod`**; `True_Yodha` is the **worker**. Both root `/backend`, same repo. |
> | Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | Prod API uses `--port 8000`; worker uses `python -m app.workers.jobs_compute_worker` |
> | "Railway detects the `Dockerfile`" | Builder = **RAILPACK**, not Dockerfile |
> | Set env from `backend/.env` / `.env.local` | Env lives in Railway (per-service) + Vercel; manage Railway via MCP |
>
> Git-flow itself (feature → Develop → main, CI gates, branch protection) is still accurate.

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
git remote add origin https://github.com/TrueMirror/True_Yodha.git
git add .
git commit -m "chore: initial project scaffold"
git push -u origin main
```

### 4. Develop branch (already exists — active branch)

```bash
git checkout develop   # already tracking origin/develop
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