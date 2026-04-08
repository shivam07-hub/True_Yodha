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
Date: 2026-04-08
Phase files worked on: Phase 1E (scoring engine), Phase 1F (job matching), skill tagger rebuild

What was completed:
  [tools/tagger_ui.py] Built Streamlit HITL tagger UI — browser copy/paste instead of terminal
  [backend/app/services/scoring_engine.py] Added certification signal type, fixed null-safety bug on skill_domains
  [backend/tests/test_scoring.py] 60 tests, 100% line coverage on scoring_engine.py
  [backend/app/services/job_matcher.py] Full implementation: overlap scorer, primary×2/secondary×1 weights
  [backend/app/services/llm_ranker.py] GPT-4o-mini re-ranker + action plans, weekly cache check
  [backend/app/routers/jobs.py] POST /jobs/compute endpoint
  [backend/tests/test_job_matcher.py] 24 tests covering all job matcher logic
  [backend/app/services/skill_tagger.py] Rebuilt as 5-provider fallback chain (Gemini→Cerebras→Groq→SambaNova→OpenRouter)
    - Sequential integer IDs in prompts (key fix: small LLMs mangled ?team= query strings)
    - Max 2 rate-limit retries per provider, then falls through
    - 0-tagged guard, description truncated to 1500 chars
  [backend/app/services/groq_tagger.py] Updated to pass all 5 provider API keys
  [backend/.env.example] Updated with all 5 provider keys + signup URLs
  [.gitmodules] Added cheahjs/free-llm-api-resources submodule at docs/free-llm-api-resources
  Ran tagger: ~1,339 jobs cached before all daily limits exhausted (Gemini, SambaNova, OpenRouter)

Where we stopped:
  Job tagging incomplete — ~3,879 jobs still untagged.
  Daily limits exhausted for Gemini, SambaNova, OpenRouter.
  Cerebras and Groq should be fresh next run.

DEFERRED — must complete before Phase 1G:
  Run tagger when limits reset:
  → cd /Users/incognito/True_Yodha/backend
  → ../.venv/bin/python3 -m app.services.groq_tagger
  After tagging completes: run csv_importer.py → verify in Supabase → Phase 1G validation

Next session start order:
  1. Run groq_tagger.py (Cerebras+Groq should clear ~3,879 remaining in ~30 min)
  2. Run csv_importer.py to push tagged jobs to Supabase
  3. Verify job count in Supabase dashboard
  4. Phase 1G: smoke tests + end-to-end pipeline validation
```
