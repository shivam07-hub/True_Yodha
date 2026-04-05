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

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, SQLAlchemy ORM, `HTTPException` only (never raw exceptions), 100% test coverage on scoring engine.

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
Date: 2026-04-05
Phase file worked on: phase_1b_database.md
What was completed:
  - Full schema review and rewrite — database/schema.sql v3.0 (12 tables, final)
  - docs/SCORING_ALGORITHM.md rewritten — XP system removed, taxonomy-level matching
  - CLAUDE.md project description updated to reflect correct Intelligence-as-a-Service flow
  - database/seed_skills.sql generated (63 skills, 315 skill_level rows)
  - backend/app/services/taxonomy_loader.py — reads taxonomy.json, generates seed SQL
  - backend/app/services/skill_tagger.py — Groq llama3-70b contextual skill tagger;
    extracts required_skills, preferred_skills, min_years_experience, min_qualification
    per job; results cached in database/skill_tag_cache.json
  - backend/app/services/csv_importer.py — reads master xlsx, Groq-tags skills,
    upserts into Supabase job_postings
  - backend/requirements.txt — added openpyxl, python-dotenv, groq

Key decisions made this session:
  - No XP accumulation — skill level matched from CV evidence vs skill_levels.description
  - skill_levels.description is the benchmark for both CV matching AND job tagging
  - job_postings: primary_skills/secondary_skills as JSONB [{skill_id, required_level}]
  - job_postings: added min_years_experience (INTEGER) and min_qualification (VARCHAR)
    both LLM-extracted from raw_jd_text (not from xlsx columns which are mostly empty)
  - user_skill_xp → renamed user_skills; xp dropped; inferred_level → matched_level
  - Job match pool = top 5; top 3 flagged is_recommended = TRUE and shown to user
  - action_plan JSONB on user_job_matches (7-day CV alignment plan per recommended job)
  - New table: job_applications — full application lifecycle tracking
  - user_profiles.id references auth.users(id) ON DELETE CASCADE (Supabase Auth FK)
  - demand_trend CHECK constraint (rising/stable/falling)
  - Groq skill tagger uses llama3-70b-8192 for contextual understanding (not keyword match)
  - Taxonomy folder has a SPACE in name: "skill_taxonomy mapping/" — all scripts handle this

Where we stopped:
  Schema is final and committed. NOT yet applied to Supabase — user will do this next session.

Next session run order:
  1. Supabase SQL Editor → paste database/schema.sql → Run
  2. source .venv/bin/activate && pip install -r backend/requirements.txt
  3. python3 backend/app/services/taxonomy_loader.py
  4. Supabase SQL Editor → paste database/seed_skills.sql → Run
  5. python3 backend/app/services/csv_importer.py  (Groq tags + imports all jobs)
  6. uvicorn app.main:app --reload --app-dir backend → curl localhost:8000/health
  7. Mark phase_1b_database.md checklist complete → move to phase_1c_backend.md

Blockers: None
```
