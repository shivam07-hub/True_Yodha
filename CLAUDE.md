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
Phase files worked on: phase_1c_backend.md + phase_1d_frontend.md

What was completed:
  Phase 1C:
  - Railway deployment fixed (Root Directory → backend/)
  - skill_tagger.py: fixed JSON parser (raw_decode), Gemini model → gemini-2.0-flash,
    added retry-with-backoff for OpenRouter 429s
  - Added interactive_tagger.py: company-by-company copy-paste CLI (human-in-loop)
  - Added manual_tag_exporter.py + manual_tag_importer.py (Excel-based human-in-loop)
  - groq_tagger.py now prints guidance to interactive_tagger on provider exhaustion

  Phase 1D (frontend fully scaffolded and built):
  - Next.js 14 App Router in frontend/ — TypeScript + Tailwind v3 + shadcn/ui
  - lib/supabase.ts, lib/api.ts (typed), lib/query-client.ts, components/providers.tsx
  - Landing page (/) with CV upload CTA + how-it-works
  - /login and /signup with shared AuthForm component
  - /onboarding: 3-step flow — CV drag-and-drop → target role → animated score reveal
  - /dashboard: Mirror Score gauge + domain radar + top 5 skill upgrades + top 10 jobs
  - All pages mobile-responsive, TanStack Query for all server state
  - Build clean, 6 routes all pass

Where we stopped:
  Frontend built and committed to Develop branch.
  User will push to GitHub + deploy to Vercel manually next session.

DEFERRED — job tagging pipeline (do before Phase 1E scoring):
  skill_tagger.py fixes are done. When ready:
  → cd /Users/incognito/True_Yodha/backend && source ../.venv/bin/activate
  → python3 -m app.services.groq_tagger   (API auto-pipeline)
  → python3 -m app.services.interactive_tagger  (manual company-by-company)
  Cache: ~483 jobs tagged, ~5,735 still untagged across 30 companies.
  After tagging: run csv_importer.py → verify in Supabase.

Next session start order:
  1. Push Develop → GitHub (GitHub Desktop)
  2. Merge Develop → main (GitHub PR)
  3. Connect Vercel → import True_Yodha repo
     - Root Directory: frontend
     - Add 3 env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
       NEXT_PUBLIC_API_URL (https://truemirror.up.railway.app)
  4. Verify Vercel deployment live
  5. Mark Phase 1D complete
  6. Start Phase 1E: Scoring engine
```
