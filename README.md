# Mirror — The Job Seeker's Reality Check

Upload your CV. See exactly where you stand. Know what to fix next.

Mirror maps your skills against live job market demand, computes a personalised Mirror Score across 10 domains, and shows you the top 10 matching jobs with a clear explanation of why each one fits — or doesn't.

---

## Project Structure

```
mirror-app/
├── backend/          FastAPI API — scoring engine, CV parsing, job matching
├── frontend/         Next.js 14 — landing, onboarding, dashboard
├── database/         SQL schema and seed data
├── Market Data/      Job scraping engine (existing Python engine)
├── skill_taxonomy mapping/   63-skill taxonomy + human-in-loop review tools
├── spec doc/         Product, architecture, and business model documents
└── docs/             Phase trackers and reference guides
```

## Quick Start

### Backend
```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # fill in values
cd backend && uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local       # fill in values
npm run dev
```

## Environments

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | Vercel auto-deploy |
| `develop` | Staging (UAT) | Vercel preview URL |
| `feature/*` | Local only | localhost |

## Branch Rules

- **Never push directly to `main`** — always via PR from `develop`
- **Never push directly to `develop`** — always via PR from a feature branch
- CI must pass before any merge

## Deployment

- **Frontend:** Vercel (auto-deploys on push to `main`)
- **Backend:** Railway (auto-deploys from `backend/Dockerfile`)
- **Database:** Supabase (PostgreSQL, free tier)

Full deployment guide: `docs/DEPLOYMENT_GUIDE.md`
