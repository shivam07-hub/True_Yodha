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

## LAST SESSION SUMMARY (2026-04-18 — Scoring Engine Rewrite)

```
Date: 2026-04-18
Handoff doc: DELETED (all Track A tasks complete)

Work done this session:

  1. feat(scoring): full scoring engine rewrite (backend/app/services/scoring_engine.py)
     - New model: cluster_coverage × (max_proficiency/5) per Tax-L2 cluster
     - Domain score = mean(cluster_scores) × 100, Tax-L1 level, present-only
     - Mirror Score = mean(domain_scores) — no penalty for absent domains
     - Proficiency tiers renamed: Scout → Trailblazer → Excavator → Cartographer → Legend
     - Gap analysis aspiration-driven, 7-day day-budget packing
     - Tests split: test_scoring.py + test_scoring_io.py — 68/68 green

  2. docs/SCORING_ALGORITHM.md — fully rewritten to match new model

  3. chore(git): agency-agents submodule pointer removed
     - 184 agents installed to ~/.claude/agents/ (user-wide, all sessions)
     - agency-agents/ added to .gitignore

Next session:
  - CV upload + parsing is struggling — start with testing/debugging cv_parser.py
  - Apply migration SQL in Supabase (still pending manual step)
  - Upload Shivam's real CV through /onboarding and verify top 3 matches
  - OpenRouter credits need top-up before Railway deploy

LLM model map (local):
  - CV extraction:  llama-3.2-3b-instruct  (LM_STUDIO_EXTRACTOR_MODEL)
  - Job ranking:    deepseek-r1-0528-qwen3-8b-mlx  (LM_STUDIO_RANKER_MODEL)
  - Skill tagging:  qwen2.5-0.5b-instruct  (LM_STUDIO_TAGGER_MODEL)