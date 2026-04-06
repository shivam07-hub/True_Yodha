# MIRROR — CLAUDE.md (Cockpit)
### Session Control File · v3.0 · April 2026

---

## SESSION START RITUAL (do this every time, no exceptions)

1. Read this file top to bottom
2. Read the **current phase file** listed below
3. State your full plan for today and wait for "yes / proceed / go ahead"
4. Work one task at a time — commit after each completed task
5. Before ending: update **Last Session Summary** below

---

## CURRENT PHASE → `docs/phases/phase_1b_database.md`

Status: Phase 1A complete. Phase 1B is next — but user wants to review and adjust table structures in `database/schema.sql` BEFORE applying to Supabase.

Phase order:
1. `docs/phases/phase_1a_infra.md` ← **COMPLETE**
2. `docs/phases/phase_1b_database.md` ← **YOU ARE HERE**
3. `docs/phases/phase_1c_backend.md`
4. `docs/phases/phase_1d_frontend.md`
5. `docs/phases/phase_1e_scoring.md`
6. `docs/phases/phase_1f_jobs.md`
7. `docs/phases/phase_1g_validation.md`

---

## ABSOLUTE RULES (cannot be broken)

- Skill data source of truth: `skill_taxonomy_mapping/taxonomy.json` + `Skill_Taxonomy_v1.xlsx`
  Never edit skill data without updating BOTH files and logging in `TAXONOMY_CHANGELOG.md`
- Never merge to `main` directly — only to `develop`. `main` = Vercel production.
- Never hardcode API keys — use `.env` files, never commit `.env`
- Never skip tests before marking a task complete
- Never expose `rank_tier` or `percentile` via API — internal only
- Web only (mobile-responsive) — no React Native, no native app

---

## PROJECT IN ONE PARAGRAPH

Mirror is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills are extracted and matched against a 63-skill taxonomy (L1–L5 levels determined by comparing CV evidence to taxonomy benchmark definitions) → top 5 job matches are found by skill overlap and LLM-ranked → top 3 are recommended to the user with explanations and a 7-day action plan to align their CV to each job → a Mirror Score (0–100) is computed across 10 domains → user sees their score, domain breakdown, top 3 recommended jobs, and top 5 skill upgrade priorities. Jobs are tagged with primary and secondary skills at required levels. Application tracking records whether the user applied, received a response, and status at the 1-week check-in. Rank tier and percentile are computed internally and never exposed via API.

**Tech stack:** FastAPI (backend) · Next.js 14 (frontend) · Supabase/PostgreSQL (DB) · Railway (backend hosting) · Vercel (frontend hosting) · GPT-4o mini (LLM ranking)

**Reference docs:**
- Full tech stack + architecture: `docs/TECH_STACK.md`
- Database schema: `docs/SCHEMA.md`
- Scoring algorithm: `docs/SCORING_ALGORITHM.md`
- Skill taxonomy reference: `docs/TAXONOMY_REFERENCE.md`
- Intern collaboration contracts: `docs/INTERN_CONTRACTS.md`
- Deployment guide (Git → GitHub → Vercel): `docs/DEPLOYMENT_GUIDE.md`

---

## CODING CONVENTIONS (always apply)

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, Supabase client for all DB operations (no SQLAlchemy/Alembic), `HTTPException` only (never raw exceptions), 100% test coverage on scoring engine.

**TypeScript:** Strict mode ON, no `any`, functional components only, all API calls via `lib/api.ts`, TanStack Query for server state, Zustand for UI-only state, 375px mobile viewport required.

**Git commits (Conventional Commits format):**
`feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope per commit.

**File size:** No file > 300 lines. Split if exceeded.

---

## ENVIRONMENT & VIRTUAL ENV

- Python venv lives at `.venv/` (project root)
- Activate: `source .venv/bin/activate`
- Install deps: `pip install -r backend/requirements.txt`
- Never activate conda for this project — use `.venv` only

---

## LAST SESSION SUMMARY

```
Date: 2026-04-06
Phase files worked on: phase_1b_database.md, phase_1c_backend.md (design decisions)

What was completed:
  PIPELINE SPLIT (Phase 1B):
  - preprocessor.py created: HTML strip, quality filter (<150 chars), title normalisation,
    INR salary normalisation (LPA/K/crore formats), staleness filter (50 days)
  - groq_tagger.py created: reads raw xlsx → preprocesses → Groq tags → writes enhanced xlsx
    Output: Market Data/.../Enhanced/ENHANCED_JOBS_<YYYYMMDD>.xlsx
  - csv_importer.py rewritten: reads enhanced xlsx only (no Groq), upserts to Supabase,
    deactivation sweep (marks jobs absent from current run as is_active=false)
  - skill_tagger.py: model updated to llama-3.1-8b-instant (higher free tier limit)

  ARCHITECTURE DECISIONS:
  - Dropped SQLAlchemy/asyncpg/alembic entirely — Supabase client for all DB ops
  - database.py replaced with Supabase client factory (get_supabase + get_supabase_admin)
  - config.py: added supabase_anon_key, removed database_url
  - backend/.env.example created
  - backend/app/scrapers/ deleted (scrapers run locally, never in backend)
  - requirements.txt: removed duplicate httpx, spacy pinned to >=3.8.0 for Python 3.13
  - salary_currency default changed USD → INR in schema.sql

  SCHEMA UPDATES (applied to Supabase):
  - daily_logs table added (14 tables total): free-text diary, skills_delta JSONB,
    one entry per user per day, RLS enabled
  - user_job_matches: batch_week DATE column added, UNIQUE constraint updated
  - TECH_STACK.md, phase_1a_infra.md, phase_1c_backend.md, CLAUDE.md all updated

  PRODUCT DESIGN DECISIONS (Phase 1C inputs):
  - Core loop: weekly job matches (top 3, every Monday) + daily diary + score updates
  - Diary: free text, Groq extracts skill XP in real-time, triggers score recompute
  - Job matches: top 3 by overlap score + overlap % + Groq reasoning (not explicit/inferred split)
  - Onboarding v1: CV upload first, target role questionnaire deferred to v2
  - Weekly batch: automatic every Monday when job data refreshes

Where we stopped:
  groq_tagger.py is RUNNING IN BACKGROUND (process ID: bmzdehayy)
  Model: llama-3.1-8b-instant, 5,218 jobs across 1,740 batches
  Hit 100K token/day limit on llama-3.3-70b-versatile earlier — switched to 8b
  Cache preserved: 60 good entries so far, 5,158 remaining

Blocker:
  Groq free tier (llama-3.1-8b-instant) may also hit daily token limit before finishing.
  Plan: refactor skill_tagger.py to auto-switch providers on 429:
    1. Groq llama-3.1-8b-instant
    2. Gemini 1.5 Flash (GOOGLE_API_KEY already in .env)
    3. OpenRouter free models (needs free account + API key)
  This refactor is PENDING — do NOT start until current run finishes or hits limit.

Next session run order:
  1. Check if groq_tagger.py finished successfully
     → If yes: review enhanced xlsx, run csv_importer.py, verify Supabase
     → If hit rate limit again: refactor skill_tagger.py for multi-provider fallback
  2. Once Supabase populated: test uvicorn + curl /health
  3. Mark Phase 1B complete
  4. Start Phase 1C: Pydantic schemas → auth routes → user routes → CV upload → scoring → jobs → diary
```
  5. uvicorn app.main:app --reload --app-dir backend → curl localhost:8000/health
  6. Mark phase_1b_database.md checklist complete → move to phase_1c_backend.md

Blockers: None
```
