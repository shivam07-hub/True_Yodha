# MIRROR — CLAUDE.md (Cockpit)
### Session Control File · v3.0 · April 2026

---

## SESSION START RITUAL (do this every time, no exceptions)

1. Read this file top to bottom
2. State your full plan for today and wait for "yes / proceed / go ahead"
4. Work one task at a time — commit after each completed task
5. Before ending: update **Last Session Summary** below

---

## ABSOLUTE RULES (cannot be broken)

- Never merge to `main` directly — only to `develop`. `main` = Vercel production.
- Never hardcode API keys — use `.env` files, never commit `.env`
- Never skip tests before marking a task complete
- Web only (mobile-responsive) — use tailwindcss and shadcn
---

## PROJECT IN ONE PARAGRAPH

Mirror is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills are extracted and matched against a global skill taxonomy (L1–L5 levels determined by comparing CV evidence to taxonomy benchmark definitions) → top 5 job matches are found by skill overlap and LLM-ranked → top 3 are recommended to the user with explanations and a 7-day action plan to align their CV to each job → a Mirror Score (0–100) is computed across 10 domains → user sees their score, domain breakdown, top 3 recommended jobs, and top 5 skill upgrade priorities. Application tracking records whether the user applied, received a response, and status at the 1-week check-in. Rank, tier, and percentile are computed internally.

**Tech stack:** FastAPI (backend) · Railway (backend hosting) ~ Next.js 14 (frontend) , Tailwind CSS, Shadcn/ui · Supabase/PostgreSQL (DB) ·  · Vercel (frontend hosting) · OpenRouter API (LLM ranking)

**Reference docs:**
- Full tech stack + architecture: `docs/TECH_STACK.md`
- Scoring algorithm: `docs/SCORING_ALGORITHM.md`
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

---

## LAST SESSION SUMMARY (2026-04-18 — Track A Matching Fix)

```
Date: 2026-04-18
Handoff doc: docs/MATCHING_FIX_HANDOFF.md (all tasks now complete)

Work done (5 commits to Develop):
  1. chore(db): migration SQL — database/migrations/20260417_job_id_text.sql
     - Converts user_job_matches.job_id + job_applications.job_id from int4 → text
     - Adds FK to public.jobs(job_id), adds matched_skills jsonb column
     - MUST be applied in Supabase SQL Editor before next deploy

  2. fix(matcher): job_matcher.py fully rewritten
     - Now reads public.jobs directly (no more phantom job_postings dependency)
     - Text job_ids, aspiration rerank (1.3x role, 1.2x location boost)
     - Anti-Accenture cap: no single company > 30% of top_n
     - 12/12 tests green

  3. feat(jobs): router + schemas + llm_ranker updated
     - POST /jobs/compute: graceful needs_onboarding=true instead of 404
     - Fetches target_roles + target_location from user_profiles → passes to matcher
     - job_postings embed removed everywhere → replaced with jobs embed
     - matched_skills persisted to user_job_matches and returned in API

  4. feat(jobs): frontend skill chips on job cards
     - JobMatchCard renders matched Lightcast skills (max 6 + overflow pill)
     - job_id: string everywhere in frontend types + call sites

  5. fix(cv): CV extraction now uses LM Studio locally, OpenRouter in prod
     - LM_STUDIO_EXTRACTOR_MODEL=llama-3.2-3b-instruct (local, working)
     - deepseek-r1 rejected — reasoning model burns tokens on <think>, empty output
     - OpenRouter fallback kept for Railway deploy (needs credit top-up at launch)

Next session:
  - Apply migration SQL in Supabase (only remaining manual step)
  - Upload Shivam's real CV through /onboarding and verify top 3 matches
  - Confirm no HR roles, ≥1 DE/PM/Sales role, no company duplication
  - Mirror Score denominator bug still open (task 3a from handoff) — score shows ~0.1
  - OpenRouter credits need top-up before Railway deploy

LLM model map (local):
  - CV extraction:  llama-3.2-3b-instruct  (LM_STUDIO_EXTRACTOR_MODEL)
  - Job ranking:    deepseek-r1-0528-qwen3-8b-mlx  (LM_STUDIO_RANKER_MODEL)
  - Skill tagging:  qwen2.5-0.5b-instruct  (LM_STUDIO_TAGGER_MODEL)