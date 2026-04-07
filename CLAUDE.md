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

## CURRENT PHASE → `docs/phases/phase_1c_backend.md`

Status: Phase 1A complete. Phase 1B complete. Phase 1C code complete — Railway deployed, awaiting health check confirmation.

Phase order:
1. `docs/phases/phase_1a_infra.md` ← **COMPLETE**
2. `docs/phases/phase_1b_database.md` ← **COMPLETE**
3. `docs/phases/phase_1c_backend.md` ← **YOU ARE HERE**
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
Date: 2026-04-07
Phase files worked on: phase_1c_backend.md

What was completed:
  groq_tagger.py debugging session — attempted to run the full tagging pipeline.
  - Installed missing packages into .venv: openai, google-generativeai
  - Changed provider fallback order to Groq → OpenRouter → Gemini
  - Identified all currently working free OpenRouter models via /api/v1/models
    (meta-llama/llama-3.3-70b-instruct:free is the best available for JSON tasks)
  - Updated PROVIDERS list in skill_tagger.py with correct model names

Where we stopped:
  groq_tagger.py could not complete a single batch due to cascading provider failures.
  Session closed to wait for Groq daily limit reset overnight.

BLOCKERS — must fix before next run:
  1. GROQ: Daily free tier exhausted. Resets midnight UTC. Run tomorrow morning.
  2. OPENROUTER model: meta-llama/llama-3.3-70b-instruct:free exists but is
     temporarily rate-limited. Current code permanently switches away on any 429
     — needs retry logic instead of hard switch for temporary limits.
  3. GEMINI model: gemini-1.5-flash is deprecated/removed. Must update to
     gemini-2.0-flash in skill_tagger.py PROVIDERS list before next run.
  4. OPENROUTER 429 handling: _is_rate_limit() treats temporary 429 as permanent
     → code never retries the same provider. Should add per-batch retry with
     backoff before switching.

Next session run order:
  0. Fix skill_tagger.py before running:
     a. Change Gemini model: "gemini-1.5-flash" → "gemini-2.0-flash"
     b. Add retry-with-backoff for 429 on OpenRouter before hard-switching
  1. Run groq_tagger.py (after Groq daily limit resets — midnight UTC):
     → cd /Users/incognito/True_Yodha/backend
     → source ../.venv/bin/activate
     → python3 -m app.services.groq_tagger
     → Cache at database/skill_tag_cache.json has ~461 jobs already tagged
     → 4,757 jobs still need tagging across 1,586 batches
  2. Review enhanced xlsx output
  3. Run csv_importer.py to push jobs to Supabase
  4. Verify jobs appear in Supabase dashboard
  5. Mark Phase 1C complete
  6. Start Phase 1D: Next.js 14 frontend
```
