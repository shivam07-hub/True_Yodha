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
Date: 2026-04-09
Phase files worked on: Skill tagger — LM Studio local model integration

What was completed:
  [backend/app/config.py] Split lm_studio_model → lm_studio_tagger_model + lm_studio_ranker_model
  [backend/app/services/skill_tagger.py] Major upgrades:
    - LM_STUDIO_TAGGER_MODEL as provider 0 (instruction model for tagging)
    - <think> tag stripping in parse_llm_response (regex, safe no-op if absent)
    - daemon-thread wall-clock timeout with httpx.Client.close() abort (SDK timeout doesn't work for local streaming)
    - lmstudio timeout exception → skip batch + stay on lmstudio (don't fall to cloud)
    - lmstudio 0-tagged → retry once, then skip batch (don't fall to cloud)
    - batch_size remains 10, description truncation remains 1500 chars
  [backend/app/services/llm_ranker.py]
    - <think> tag stripping in parse_llm_response
    - Uses settings.lm_studio_ranker_model (reasoning model for ranking)
  [backend/app/services/groq_tagger.py]
    - Passes LM_STUDIO_TAGGER_MODEL key to tag_jobs_with_llm
    - Startup check: accepts either GROQ_API_KEY or LM_STUDIO_TAGGER_MODEL
    - Reads only the LATEST ALL_JOBS_NORMALIZED_*.xlsx (by mtime) — not all historical files
  [backend/.env] LM_STUDIO_TAGGER_MODEL=qwen2.5-0.5b-instruct, LM_STUDIO_RANKER_MODEL=qwen3.5-9b-claude-4.6-opus-reasoning-distilled
  [backend/.env.example] Updated with LM_STUDIO_TAGGER_MODEL and LM_STUDIO_RANKER_MODEL

LM Studio setup (M4 Mac):
  Tagger model: qwen2.5-0.5b-instruct — context 8192, GPU max — runs at ~150 tok/s, ~8s per batch
  Ranker model: qwen3.5-9b-claude-4.6-opus-reasoning-distilled — for llm_ranker.py (job ranking + action plans)
  Server: http://localhost:1234/v1

Tagger run status (still running at session close):
  Cache at session start: ~1,339 jobs
  Cache at session close: ~1,864 + (232 batches × 10) = ~4,184 jobs tagged
  Tagger running in background: batch 232/336, 10/10 per batch with qwen2.5-0.5b-instruct
  Estimated completion: ~30 min from session close

DEFERRED — must complete before Phase 1G:
  1. Wait for tagger to finish (or rerun if interrupted):
     → cd /Users/incognito/True_Yodha/backend
     → ../.venv/bin/python3 -m app.services.groq_tagger
  2. Run csv_importer.py to push tagged jobs to Supabase
  3. Verify job count in Supabase dashboard
  4. Phase 1G: smoke tests + end-to-end pipeline validation

CODE NOT YET COMMITTED — review and commit manually:
  backend/app/config.py
  backend/app/services/skill_tagger.py
  backend/app/services/llm_ranker.py
  backend/app/services/groq_tagger.py
  backend/.env.example
```
