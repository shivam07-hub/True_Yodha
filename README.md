# Mirror — Career Intelligence Platform

Upload your CV → skills extracted against Lightcast taxonomy → top job matches by skill overlap + LLM ranking → Mirror Score across 10 domains → 7-day action plan to close skill gaps.

---

## Project Structure

```
True_Yodha/
├── backend/                   FastAPI API — Railway hosting
│   ├── app/
│   │   ├── routers/           auth, cv, diary, jobs, scores, skills, users
│   │   ├── services/          cv_parser, scoring_engine, job_matcher, llm_ranker,
│   │   │                      skill_tagger, taxonomy_loader, diary_processor, csv_importer
│   │   ├── schemas/           Pydantic models per domain
│   │   ├── config.py          Settings (pydantic-settings, loads backend/.env)
│   │   ├── database.py        Supabase client factory (anon + admin)
│   │   └── main.py            FastAPI app, CORS, router registration
│   └── tests/                 pytest — cv_parser, scoring, job_matcher, health
├── frontend/                  Next.js 14 — Vercel hosting
│   ├── app/                   App Router pages
│   │   ├── cv/                CV upload + extracted skills + upload history
│   │   ├── dashboard/         Domain radar + Skill Intelligence (side-by-side) + skill upgrades
│   │   ├── tracker/           Jobs Tracker — top 5 matches + application status (nav: "Jobs")
│   │   ├── jobs/              Full job list with search (not in nav)
│   │   ├── market/            Market Intel panel
│   │   ├── diary/             Daily skill diary
│   │   ├── onboarding/        CV → role → score reveal flow
│   │   └── mission/           About / mission statement
│   └── components/            Shared React components (see frontend/README.md)
├── database/
│   ├── schema.sql             PostgreSQL schema v4.0 (apply in Supabase SQL Editor)
│   ├── seed_skills.sql        Seed data for skills table
│   └── migrations/            Incremental migration scripts
├── docs/
│   ├── TECH_STACK.md          Full architecture + service map
│   ├── SCORING_ALGORITHM.md   Mirror Score algorithm (cluster-coverage model)
│   └── DEPLOYMENT_GUIDE.md    Git → GitHub → Vercel/Railway deploy steps
├── lightcast_skills_taxonomy.json   35,108 skills (L1/L2/L3 hierarchy) — taxonomy source
└── lightcast_skills_flat.csv        Flat export of same taxonomy
```

---

## Quick Start

### Backend
```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
# edit backend/.env with Supabase keys + LLM config + REDIS_URL
cd backend && uvicorn app.main:app --reload
```

### Jobs Compute Worker
```bash
source .venv/bin/activate
cd backend
# requires REDIS_URL in backend/.env
python -m app.workers.jobs_compute_worker
```

### Frontend
```bash
cd frontend
npm install
# edit frontend/.env.local with NEXT_PUBLIC_API_URL
npm run dev
```

---

## Environments

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | Vercel auto-deploy |
| `develop` | Active development / staging | Vercel preview URL |
| `feature/*` | Local only | localhost |

## Branch Rules

- Never push directly to `main` — PR from `develop` only
- `main` = Vercel production. Treat as sacred.
- All work on `develop` branch

## Deployment

- **Frontend:** Vercel (auto-deploys on push to `main`)
- **Backend:** Railway (auto-deploys from `backend/` via Dockerfile)
- **Database:** Supabase (PostgreSQL, free tier, schema v4.0)

Full deployment guide: `docs/DEPLOYMENT_GUIDE.md`
