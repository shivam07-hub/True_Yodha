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

## LAST SESSION SUMMARY (2026-04-18 — Skill Table Flatten + Archon Setup)

```
Date: 2026-04-18

Work done this session:

  1. chore: deleted entire Version1/ directory (6,793 lines, 49 files)
     All legacy code superseded by current backend/

  2. debug(cv): all 21 unit tests pass. Root cause of "struggling": scripts run from
     project root can't find backend/.env → LLM config loads empty → silent [].
     Not a code bug. LM Studio live, llama-3.2-3b-instruct returns correct skill JSON.

  3. feat(dashboard): major layout restructure
     - Domain Breakdown radar + Skill Intelligence panel now SIDE BY SIDE (lg:grid-cols-2)
     - "Top Job Matches" section removed from Dashboard (belongs in Jobs/Tracker)
     - Dashboard container widened: max-w-2xl → max-w-5xl
     - SkillIntelligencePanel moved: tracker/page.tsx → dashboard/page.tsx
     - Tracker: collapsed to single-column job grid (md:2col, lg:3col); removed scoreQuery
     - Fixed pre-existing TS bug: Record<number> → Record<string> in appsByJobId

  4. docs: synced all project MD files to current state (README, frontend/README,
     docs/TECH_STACK.md created, DEPLOYMENT_GUIDE updated)

  5. refactor(db): flattened 3-table skill hierarchy → single skills table (APPLIED TO PROD)
     - skill_domains + skill_clusters tables DROPPED
     - skills table: cluster_id FK dropped; l1_domain + l2_cluster columns added
     - Populated via JOIN before drop: all 35,108 rows have l1_domain + l2_cluster
     - Users match at L3 (user_skills.skill_id). L2/L1 aggregated at query time.
     - All backend code updated: taxonomy_loader, scoring_engine, routers, schemas
     - 102 tests pass
     - Migration file deleted after apply (was: 20260418_flatten_skills_table.sql)
     - See docs/schema.md for full DB schema reference

  6. chore: added Archon CLI skill (.claude/commands/archon.md)
     - Archon binary at /Users/incognito/.local/bin/archon
     - Use /archon after Claude Code restart

## CURRENT DB STATE (as of 2026-04-18)

skills table columns: id, taxonomy_key, display_name, lightcast_id, l1_domain, l2_cluster, is_active, created_at
user_skills links: user_id → skill_id (L3). Scoring groups by l2_cluster, l1_domain at query time.
DROPPED tables: skill_domains, skill_clusters

## CURRENT UI STATE (as of 2026-04-18)

Nav order: CV → Dashboard → Jobs → Intel → Diary

Page map:
  /cv          Upload CV, view extracted skills by Lightcast domain, CV history timeline
  /dashboard   Truth Score (header) | Domain Breakdown ↔ Skill Intelligence (side-by-side)
               Below: Top 5 Skills to Upgrade (SkillUpgradeCard list)
  /tracker     Jobs Tracker — top 5 matches + application status (add/track/status change)
               Nav label: "Jobs"
  /jobs        Full job list with search (not in nav — accessed directly)
  /market      Intel — market intelligence panel
  /diary       Daily skill diary + XP log
  /onboarding  CV upload → role selection → score reveal flow
  /mission     About / mission statement

Next session:
  - Upload Shivam's real CV through /onboarding UI and verify top 3 matches
  - OpenRouter credits top-up before Railway deploy
  - Add env-path sanity check to backend startup log

LLM model map (local):
  - CV extraction:  llama-3.2-3b-instruct  (LM_STUDIO_EXTRACTOR_MODEL)
  - Job ranking:    deepseek-r1-0528-qwen3-8b-mlx  (LM_STUDIO_RANKER_MODEL)
  - Skill tagging:  qwen2.5-0.5b-instruct  (LM_STUDIO_TAGGER_MODEL)