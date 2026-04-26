# Mirror — Tech Stack & Architecture

> Last updated: 2026-04-26

---

## Service Map

```
User browser
    │
    ▼
Vercel (Next.js 14 frontend)
    │  HTTPS REST calls
    ▼
Railway (FastAPI backend)
    │  Supabase JS client
    ▼
Supabase (PostgreSQL + Auth)
    │
    └── Row Level Security on all user tables

LM Studio (local, dev only)           OpenRouter (prod fallback)
    └── CV extraction (llama-3.2-3b)      └── anthropic/claude-3.5-sonnet
    └── Job ranking   (deepseek-r1-8b)
    └── Skill tagging (qwen2.5-0.5b)
```

---

## Backend — FastAPI

**Runtime:** Python 3.11+, async/await throughout  
**Hosting:** Railway (auto-deploy from `backend/` on push to `main`)  
**Entry point:** `backend/app/main.py`

### Routers

| Router | Prefix | Key endpoints |
|--------|--------|--------------|
| `auth` | `/auth` | POST `/signup`, POST `/login` |
| `cv` | `/cv` | POST `/upload`, GET `/me` |
| `scores` | `/scores` | GET `/me` |
| `jobs` | `/jobs` | GET `/matches`, POST `/compute`, GET `/applications`, PATCH `/applications/:id` |
| `users` | `/users` | GET `/me`, GET `/me/skills` |
| `skills` | `/skills` | GET `/`, GET `/:taxonomy_key` |
| `diary` | `/diary` | GET `/today`, POST `/` |

### Repositories

Repository Modules own Supabase reads/writes for table families and expose a smaller interface to routers/services. This is Phase 2 of the modularity refactor: the Supabase query-chain implementation is kept local to adapters, while routers depend on Repository seams through FastAPI `Depends`.

Completed Repository Modules:

| Repository | Current callers | Notes |
|------------|-----------------|-------|
| `repositories/scores.py` | `routers/scores.py`, scoring persistence | Mirror Score reads, recompute inputs, market/aspiration skill rows, score writes/history |
| `repositories/skills.py` | `routers/skills.py` | Active Skill list + Domain list; normalizes missing taxonomy grouping to `General` |
| `repositories/users.py` | `routers/users.py` | Token-scoped profile adapter + admin User Skill adapter; preserves current policy |
| `repositories/diary.py` | `routers/diary.py` | Daily Logs, user milestones, diary score lookup, diary skill-upgrade rows |

Remaining Phase 2 Repository Modules:
- `repositories/cv.py` — next exact slice; should cover Baseline CV profile reads, CV History, evidence summary, draft generation, and rate-limit reads.
- `repositories/jobs.py` — largest slice; do after CV.
- Decide after `cv`/`jobs` whether `auth` and `feedback` stay direct auth/event adapters or get small Repository Modules.

### Services

| Service | Role |
|---------|------|
| `cv_parser.py` | PDF/DOCX text extraction → LLM skill extraction → Lightcast validation + fuzzy match |
| `scoring_engine.py` | Cluster-coverage Mirror Score (P1–P5) + gap analysis + 7-day plan |
| `job_matcher.py` | Skill overlap scoring against jobs table; top-N selection |
| `llm_ranker.py` | LLM re-ranks top 5 job matches → explains top 3 |
| `skill_tagger.py` | Tags diary entries → awards XP per skill |
| `taxonomy_loader.py` | Loads `lightcast_skills_taxonomy.json`; ensures skills exist in DB |
| `diary_processor.py` | Processes diary entry text → skill deltas via LLM |
| `csv_importer.py` | Imports scraped job JSON/CSV into `jobs` table |

### LLM Provider Priority

```
1. LM Studio (local, zero cost) — dev machine only
   LM_STUDIO_BASE_URL = http://localhost:1234/v1
   LM_STUDIO_EXTRACTOR_MODEL = llama-3.2-3b-instruct
   LM_STUDIO_RANKER_MODEL    = deepseek-r1-0528-qwen3-8b-mlx
   LM_STUDIO_TAGGER_MODEL    = qwen2.5-0.5b-instruct

2. OpenRouter (prod fallback)
   OPENROUTER_API_KEY — uses anthropic/claude-3.5-sonnet

3. Groq → Gemini → OpenAI (future fallback chain — GROQ_API_KEY, GOOGLE_API_KEY)
```

### Key Config (backend/.env)

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
LM_STUDIO_EXTRACTOR_MODEL=llama-3.2-3b-instruct
LM_STUDIO_RANKER_MODEL=deepseek-r1-0528-qwen3-8b-mlx
LM_STUDIO_TAGGER_MODEL=qwen2.5-0.5b-instruct
LM_STUDIO_BASE_URL=http://localhost:1234/v1
OPENROUTER_API_KEY=
RAILWAY_ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:3000
```

**Important:** `backend/.env` must be CWD when running backend. Settings use `pydantic-settings` with `env_file=".env"` — relative to working directory.

---

## Frontend — Next.js 14

**Hosting:** Vercel (auto-deploy on push to `main`)  
**Framework:** Next.js 14 App Router  
**Styling:** Tailwind CSS + shadcn/ui  
**State:** TanStack Query (server) · useState (local UI)  
**Auth:** Supabase Auth — JWT stored in localStorage

See `frontend/README.md` for full page map, component tree, and API layer.

### Key Config (frontend/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Reference Workspace

Reference codebases, design experiments, screenshots, and image exports live under `reference/`.
This folder is intentionally `.gitignored`: it is local context for designers and agents, not a production module.

Rules:
- Production code must not import from `reference/`.
- If a reference idea graduates into the app, copy the needed behaviour into `frontend/`, `backend/`, or `docs/` using project conventions.
- Graph/audit tools should treat `reference/` as out-of-scope unless the task is explicitly about design reference material.

Current local reference codebase:
- `reference/codebases/black-futurist-frontend/` — former `frontend/Black_futuristist_frontend/` prototype.

---

## Database — Supabase (PostgreSQL v4.0)

Schema file: `database/schema.sql`

### Tables

| Table | Purpose |
|-------|---------|
| `skills` | Lightcast taxonomy — 35,108 skills, L1 category + L2 subcategory |
| `user_profiles` | User account + CV text + onboarding state + target roles |
| `user_skills` | Per-user per-skill proficiency (matched_level 0–5, evidence_text) |
| `mirror_scores` | Current Mirror Score + domain_scores JSONB + gap_skills JSONB |
| `mirror_score_history` | Historical total_score per user (score trajectory) |
| `cv_history` | Per-upload: skills_count + mirror_score + uploaded_at |
| `jobs` | Scraped job postings — job_id, title, company, main_skills[], side_skills[] |
| `user_job_matches` | Top matches per user per week — overlap_score, llm_rank, action_plan JSONB |
| `job_applications` | Application tracking — status, applied_at, company_response |
| `daily_logs` | Diary entries — entry_text + skills_delta JSONB |

### Skill Demand Calculation

Skill demand is computed **live** from the `jobs` table:
- `main_skills` contributions weighted ×2
- `side_skills` contributions weighted ×1
- No pre-aggregated demand table (skill_demand_snapshots was dropped 2026-04-18)

### RLS Policy Summary

All user tables have RLS enabled. Users can only access their own rows.  
`skills` and `jobs` tables are publicly readable.  
Admin operations (scoring, job import) use `SUPABASE_SERVICE_KEY` (bypasses RLS).

---

## Skill Taxonomy — Lightcast

Source file: `lightcast_skills_taxonomy.json` (35,108 skills)

| Level | Name | Count | Example |
|-------|------|-------|---------|
| L1 (category) | Domain | 31 | "Information Technology" |
| L2 (subcategory) | Cluster | 442 | "Software Development" |
| L3 (leaf) | Individual Skill | 35,108 | "Python (Programming Language)" |

Loaded at startup by `taxonomy_loader.py`. Skills upserted into `skills` table on demand.

See `docs/SCORING_ALGORITHM.md` for the full Mirror Score algorithm.

---

## Data Pipeline — Job Ingestion

```
Firecrawl_Supabase crawler (external operational codebase)
    │  writes canonical job JSON
    ▼
backend/app/services/job_feed/
    │  normalizes crawler rows to public.jobs
    ▼
Supabase upsert adapter
    │  upserts into public.jobs
    ▼
jobs table (Supabase)
    │
    ▼
job_matcher.py  →  skill overlap scores  →  user_job_matches
    │
    ▼
llm_ranker.py   →  LLM re-rank top 5    →  llm_rank + llm_explanation
```

The crawler currently lives at `/Users/incognito/Mirror CV/firecrawl_Supabase`. Do not bulk-copy that folder into this repo: generated dumps, local `.env`, Archon state, and upstream Firecrawl files stay external. Mirror owns the Job Feed module at `backend/app/services/job_feed/`: canonical job row normalization, taxonomy compatibility checks, quality reporting, and the Supabase upsert adapter. See `docs/adr/0001-job-feed-firecrawl-crawler-contract.md`.
