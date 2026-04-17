# Mirror — A career Intelligence platform in the age of AI

Upload your CV. See top matching jobs based on the skills in your CV. Know your matching score for that CV. Know what to fix next in the next 7 days, with the ability to track the weekly progress. Mirror engine maps your skills against skills collected from live job market demand collected from the recruitment pages of top 100 companies in India to work for, computes a personalised Mirror Score across the skills that are matching and how they are matching, and shows you the top 5 matching jobs with a clear explanation of why each one fits — and a 7 day plan to improve your chances to improve your chances.

---

## Project Structure

```
mirror-app/
├── backend/          FastAPI API, railway — scoring engine, CV parsing, job matching
├── frontend/         Next.js 14, tailwindCSS, ShadeCN — landing, onboarding, dashboard
├── database/         Supabase : Postgre Scehma with relational database
├── Scraper/          Job scraping engine built in combination with Firecrawl (existing Python engine) - This folder is not in this project and the Json file is dropped directly from the output of the scraper.
├── skill_taxonomy mapping/   Master skill taxonomy loaded in the Scraper folder.
├── spec doc/         Product, architecture, and business model documents
└── docs/             reference guides
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
