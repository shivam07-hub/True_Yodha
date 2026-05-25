# True_Yodha

True_Yodha is the codebase behind a career-intelligence product (Myro; earlier iterations used the name "Mirror") that helps job seekers understand what skills companies are hiring for in the age of AI.

At a high level it:
1. Ingests a user's CV.
2. Extracts skills against a large skills taxonomy.
3. Finds job matches via skill overlap and ranking.
4. Computes a score and breakdowns that make the gaps actionable.

This repository exists because the hiring market changes fast, and "what to learn next" is only useful if it is grounded in real job demand and a consistent skill taxonomy.

## What’s In This Repo

This is a monorepo:

- `backend/`: FastAPI API (Supabase/Postgres for storage, background worker for compute)
- `frontend/`: Next.js 14 web app (Tailwind + shadcn/ui)
- `database/`: schema and migration scripts for Supabase
- `docs/`: architecture, scoring algorithm notes, deployment guide
- `lightcast_skills_taxonomy.json`, `lightcast_skills_flat.csv`: skills taxonomy artifacts used by the system

## Quick Start (Local Dev)

### Backend API
```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
# create backend/.env (do not commit) with Supabase keys + LLM config + REDIS_URL
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
# create frontend/.env.local (do not commit) with NEXT_PUBLIC_API_URL
npm run dev
```

## How To Use

This repo is primarily designed to be run as a web app (local or deployed).

1. Start the backend API.
2. Start the frontend.
3. Use the frontend flow to upload a CV, view extracted skills, see matches, and explore skill intelligence.

For deeper detail, start here:
- `docs/TECH_STACK.md`
- `docs/SCORING_ALGORITHM.md`
- `docs/DEPLOYMENT_GUIDE.md`

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` for:
- dev setup and checks
- code style and conventions
- PR process and what makes a change reviewable

## License

MIT. See `LICENSE`.
