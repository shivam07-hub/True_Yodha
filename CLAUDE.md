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

## CURRENT PHASE → `docs/phases/phase_1g_validation.md`

Status: Phase 1A–1F complete. Phase 1G validation/testing in progress.

Phase order:
1. `docs/phases/phase_1a_infra.md` ← **COMPLETE**
2. `docs/phases/phase_1b_database.md` ← **COMPLETE**
3. `docs/phases/phase_1c_backend.md` ← **COMPLETE**
4. `docs/phases/phase_1d_frontend.md` ← **COMPLETE**
5. `docs/phases/phase_1e_scoring.md` ← **COMPLETE**
6. `docs/phases/phase_1f_jobs.md` ← **COMPLETE**
7. `docs/phases/phase_1g_validation.md` ← **YOU ARE HERE**

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
Date: 2026-04-10
Phase files worked on: phase_1g_validation.md + Career Ops canonical frontend/backend integration

What was completed:
  - Deleted untracked AGENTS.md and Market Data/Job_Scrapers/KNOWN_PORTALS.md per user request.
  - Inspected canonical frontend/backend and career-ops-web frontend reference app.
  - Made canonical frontend login-first by redirecting `/` to `/login`.
  - Fixed signup/auth contract:
    - frontend sends full_name
    - backend supports email-confirmation signup responses without requiring an immediate session
    - backend upserts user_profiles on signup
  - Fixed frontend API types to match FastAPI response shapes:
    - scores.compute unwraps ComputeScoreResponse.score
    - user profile update uses target_roles and target_location
    - jobs/applications/diary API clients added
  - Added protected canonical app shell and routes:
    - /jobs for Supabase-backed market job matches
    - /tracker for job_applications status tracking
    - /diary for private daily_logs entries and skill-signal updates
    - /cv for CV upload, score refresh, and job-match refresh
  - Dashboard now uses the protected app shell.
  - Onboarding now updates target_roles/target_location, uploads CV, computes score, and attempts job matching.
  - Read/update routes for users, scores/me, job matches, applications, and diary history now use Supabase anon client with the user JWT so RLS is exercised where policies support it.
  - CV upload now marks onboarding_complete true.
  - Cleaned secret-like API-key placeholder strings from helper files; exact secret-prefix grep still has known false positives from the Phase 1G checklist text and queue-microtask package URL.

Validation:
  - Backend: ../.venv/bin/python -m pytest tests/ -q → 85 passed
  - Frontend: npm run lint → passed
  - Frontend: npm run build → passed
  - rank_tier/percentile search in frontend + API schemas/routers only found explanatory comments, not response fields.

Where we stopped:
  - Local integration is complete and ready for cloud smoke testing.

Next task:
  - Run Phase 1G staging checks: Railway /health, Vercel production load, real Supabase auth/email verification, real CV upload, job import count, full user journey, mobile viewport checks, and 3 external user tests.

Blockers:
  - Cloud-only Phase 1G checks require deployed Railway/Vercel/Supabase access and real user testing.
```
