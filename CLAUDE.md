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

## LAST SESSION SUMMARY (2026-04-18 — FIRST PRODUCTION DEPLOYMENT 🚀)

```
Date: 2026-04-18
Milestone: First successful end-to-end deployment on Railway + Vercel (Develop branch)

Work done this session:

  1. fix(llm): CV upload LLM routing for production
     - cv_parser: LM Studio → OpenRouter free llama → Groq → Gemini → OpenRouter paid
     - llm_ranker: LM Studio → OpenRouter → GPT-4o mini fallback chain
     - diary_processor: continue to next provider on any exception (not just rate limits)
     - Changed OpenRouter model from claude-3.5-sonnet ($15/MTok) to llama-3.3-70b-instruct:free

  2. fix(taxonomy): moved lightcast_skills_taxonomy.json into backend/
     - Was at project root — Docker COPY . . (from backend/) never included it
     - taxonomy_loader.py: parents[3] → parents[2]
     - database/backfill_skills.py: path updated to ROOT / "backend" / "lightcast_skills_taxonomy.json"

  3. fix(cors): resolved CORS preflight 400 errors
     - Root cause 1: pydantic-settings v2 JSON-decoded list[str] before validators — using str + property
     - Root cause 2: allow_credentials=True + allow_origins=["*"] invalid per CORS spec
     - Fix: allow_origins=["*"], allow_credentials=False (Bearer JWT auth doesn't need credentials mode)
     - No Railway env var needed — works for all Vercel URLs automatically

  4. Railway env vars added this session:
     OPENROUTER_API_KEY, GROQ_API_KEY, GOOGLE_API_KEY
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY (set earlier)
     LM_STUDIO_* vars cleared (local only)

  5. DEPLOYMENT RESULT (first ever):
     - CV upload: 201 Created ✓ (free Llama 429d → Groq fallback succeeded)
     - Scores compute: 200 ✓
     - Jobs compute: 200 ✓ (LLM ranking degraded to overlap-only; Groq key fixes this)
     - All GET endpoints: 200 ✓
     - Login / signup: working ✓

## CURRENT INFRASTRUCTURE STATE (as of 2026-04-18)

Railway service: True_Yodha → Develop branch → auto-deploys on push
Vercel: truemirror.vercel.app + preview URLs (develop branch)
Supabase: gipvxuugajkugntwkeiz (prod DB — shared dev/prod for now)

LLM fallback chain (production):
  CV extraction:   OpenRouter free llama → Groq llama-3.1-8b → Gemini 2.0 flash-lite → OpenRouter gemini-flash-1.5
  Job ranking:     OpenRouter free llama → (no further fallback yet — gracefully degrades)
  Diary:           LM Studio → Groq → Gemini → OpenRouter

## CURRENT DB STATE (as of 2026-04-18)

skills table: id, taxonomy_key, display_name, lightcast_id, l1_domain, l2_cluster, is_active, created_at
user_skills: user_id → skill_id (L3). Scoring groups by l2_cluster / l1_domain at query time.
DROPPED: skill_domains, skill_clusters

## CURRENT UI STATE (as of 2026-04-18)

Nav order: CV → Dashboard → Jobs → Intel → Diary

Page map:
  /cv          Upload CV, view extracted skills by L2 cluster, CV history timeline
  /dashboard   Truth Score (header) | Domain Breakdown radar ↔ Skill Intelligence (side-by-side)
               Below: Top 5 Skills to Upgrade (SkillUpgradeCard list)
  /tracker     Jobs Tracker — top 5 matches + application status
               Nav label: "Jobs"
  /jobs        Full job list with search
  /market      Intel — market intelligence panel
  /diary       Daily skill diary + XP log
  /onboarding  CV upload → role selection → score reveal flow
  /mission     About / mission statement

## NEXT SESSION FOCUS

  FRONTEND REDESIGN — Apple-inspired, modern, elegant, smooth
  Goal: awe users on first load. Every screen should feel premium.

  Design principles to apply:
    - Apple HIG: clarity, deference, depth
    - Generous whitespace, large typography, subtle motion
    - Monochromatic base + single accent color
    - Smooth transitions (Framer Motion)
    - Cards with soft shadows, rounded corners, blur backdrops
    - Data visualisations that feel like art, not spreadsheets

  Start with: /cv and /dashboard pages (most user-facing)
  Reference: FrontEND INSPIRATION/ folder in project root
```