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

## NEXT SESSION FOCUS (2026-04-25 — IA REORDER + FRICTIONLESS CV-OPTIONAL UX)

**Spec:** `docs/superpowers/specs/2026-04-25-nav-reorder-and-cv-nudge.md`

Headline changes (read the spec for exact JSX, copy, tokens, and acceptance checks):

1. Sidebar order → **Intel → Jobs → Progress → CV Builder → Dashboard**.
2. Score block: drop the `Market position` subtitle. Keep `MYRO SCORE` + number.
3. Onboarding: gentle `×` close button, top-right of the header, font-consistent. Skips to `/market`.
4. No first-run CV gate anywhere. Users without a CV browse freely.
5. New reusable `<CVRequiredNudge />` component — banner or block variant — rendered consistently on `/market`, `/tracker`, `/jobs`, `/diary`, `/dashboard`. Replaces empty/blocked states.

**Branch:** `develop`. Four commits per spec. Smoke on Vercel preview before any merge to `main`.

**Out of scope this session:** the milestone / job_application_milestones / CV variant rewiring (Part 2 of the IA discussion). That gets its own spec.

---

## LAST SESSION SUMMARY (2026-04-20 — PRODUCTION DEPLOYMENT + FULL TOKEN PASS)

```
Date: 2026-04-20
Milestone: All pages token-compliant. First full production push to main (Vercel).

Commits this session:
  ba679f6  feat(auth): redirect to /market after login; TMLogo CSS-var fix
  c28cb5f  feat(ui): tm-page-enter + TM spacing on /mission
  f516299  feat(ui): token pass — /jobs, /onboarding, score-gauge; .gitignore cleanup
  a36960a  feat(ui): token pass — skill-upgrade-card, job-tracker-card, /tracker, /market
  f34d16c  chore: remove csv_importer.py

Work done:

  1. skill-upgrade-card.tsx — full dark token pass
     - Light-mode Tailwind → inline styles with var(--tm-*) tokens
     - ringColor() → gapColor() using danger/warning/accent semantics
     - Rank number, skill name, job count, gap ring all token-reactive

  2. job-tracker-card.tsx — full dark token pass
     - STATUS_META refactored: single color string → {fg, bg, border} CSS-var fields
     - Light bg-white/70 → var(--tm-surface); borders → var(--tm-border-soft)
     - Score bar color: success/warning/danger based on overlap_score
     - Company initials box: var(--tm-surface-2) + var(--tm-accent) mono text

  3. /tracker page — token pass
     - STATUS_META same fg/bg/border pattern
     - ScoreBar: accent/warning/danger based on score
     - AITutor: purple rgba → accent-wash + accent; input → tm-input class
     - GapSkillCard: danger/warning/accent semantics
     - tm-page-enter + var(--tm-page-*) spacing

  4. /market page — token pass
     - All #00F5D4 → var(--tm-accent)
     - All rgba(240,244,255,...) → var(--tm-text-muted/faint)
     - IntelBar, skill drill panel, toggle buttons all token-reactive
     - tm-page-enter + proper TM spacing

  5. /jobs page — token pass
     - scoreTone() Tailwind classes → scoreColor() CSS-var fn
     - bg-emerald-500/bg-amber-500 → var(--tm-success/warning)
     - Full inline style rewrite; tm-page-enter wrapper
     - Badge replaced with inline accent pill

  6. /onboarding page — dark bg + TM header
     - main element: var(--tm-bg) explicit background
     - Step dots: var(--tm-accent) active, var(--tm-border) inactive
     - Error banner: var(--tm-danger-wash)

  7. score-gauge.tsx — CSS-var colors
     - #22c55e/#f59e0b/#ef4444 → var(--tm-success/warning/danger)
     - SVG stroke via style prop (CSS vars can't be SVG attributes)

  8. /mission page — TM layout wrapper
     - tm-page-enter + var(--tm-page-*) spacing

  9. auth-form.tsx — login redirect + logo fix
     - Post-login redirect: /dashboard → /market (Intel page)
     - TMLogo: hardcoded #00F5D4 → currentColor + var(--tm-accent)

  10. .gitignore — cleaned up
      - Added: .claude/, Brand/, Black_futuristist_frontend/,
        archon-install.sh, taxonomy copies, *.png

  11. Production push
      - git merge Develop → main (--no-ff)
      - git pull origin main --no-rebase (reconcile PR#1 scraper history)
      - git push origin main → 76fac0e
      - Vercel auto-deploy triggered

  12. Verification
      - tsc --noEmit → exit 0 ✓
      - next lint → no warnings or errors ✓

## CURRENT BRAND STATE (as of 2026-04-20 evening)

ALL pages token-compliant. No hardcoded hex. No purple. No light-mode classes.

Pages: /cv, /dashboard, /diary, /tracker, /market, /jobs, /mission, /onboarding
Components: app-shell, particle-bg, skill-upgrade-card, job-tracker-card,
            auth-form, score-gauge, all onboarding steps

Accent system: fully wired on all surfaces (Signal/Forge toggle works everywhere)
Login redirect: → /market (Intel page)

## KNOWN FOLLOW-UPS

  [ ] Regenerate Signal Dot particle logo in amber for Forge mode.
      Current PNG has teal baked in — doesn't flip with accent toggle.
  [ ] Replace TMLogo SVG with new Signal Dot mark in sidebar + About modal.
  [ ] Smoke test production URL end-to-end (CV upload → scores → jobs).
  [ ] .env.local: localhost:8000 line commented out — uncomment for local backend dev.
```

## PREVIOUS SESSION SUMMARY (2026-04-20 — PAGE REDESIGN + PARTICLE OVERHAUL)

```
Date: 2026-04-20
Milestone: Full brand token pass applied to /dashboard, /cv, /diary, app-shell,
           particle background. All hardcoded hex/purple removed. Signal/Forge
           toggle now works across every redesigned surface.

Commit: febd504

Work done this session:

  1. particle-bg.tsx — complete rewrite
     - CONN=145 (doubled base connections), CURSOR_R=360 (doubled cursor reach)
     - Cursor lerp speed 0.082 (was 0.038)
     - Idle sphere: particles spring to imperfect circle (2-layer radial
       distribution) when cursor hidden or idle 2.5s+; idleFactor ramps over 900ms
     - Click: 28 radial blast particles + immediate shockwave push on nearby
       particles + glide attractor toward Progress nav (sidebar x=32, y=320);
       glide decays via strength *= 0.994; no ripple rings
     - Accent-reactive: reads --tm-accent via getComputedStyle + hexToRgb;
       MutationObserver watches data-accent attribute for live toggle

  2. app-shell.tsx — full token pass
     - TMLogo SVG: stroke/fill="currentColor" + style={{ color: var(--tm-accent) }}
     - FEEDBACK_ACTIONS: added bg wash property (fixes CSS-var opacity-hex hack)
     - Diary nav item: pulsing accent dot + "Log today →" nudge text
     - Truth Score metric: var(--tm-text) (non-clickable; not accent per brand rules)
     - About modal: purple section → var(--tm-surface-2); warning → var(--tm-warning-wash)
     - All hover handlers: CSS var strings instead of hardcoded hex

  3. dashboard/page.tsx — full token pass
     - All hardcoded hex → var(--tm-*) tokens
     - Truth Score: large monospaced hero display top-right
     - Ambient accent glow: radial-gradient ellipse at 60% 0%
     - .tm-page-enter + .tm-card wrappers throughout

  4. cv/page.tsx — full token pass
     - STATUS_CONFIG: strong→tm-success, close/gap→tm-warning, missing→tm-danger
     - Purple (#A97FFF) removed entirely
     - Level bars: var(--tm-accent); status dots: status color (distinct semantics)
     - Filter tabs: active uses accent-wash + accent-ring
     - Summary pills: mapped to success/warning/danger tokens

  5. diary/page.tsx — complete rewrite
     - DeepFocusTimer component: SVG ring timer (25/40/60 min), session dot tracker,
       tm-btn-primary/ghost controls, tokn-reactive throughout
     - MilestoneRing: removed hardcoded color prop; all accent-reactive
     - Layout: LEFT=DeepFocusTimer, RIGHT=7-Day Milestone Plan (merged week plan
       + achievements grid)
     - Today's task highlighted via todayIdx from new Date().getDay()
     - todayTask prop passed to timer for contextual display
     - Purple removed; streak pill uses var(--tm-warning)

  6. Verification
     - tsc --noEmit → exit 0 ✓
     - next lint → no warnings or errors ✓

## CURRENT BRAND STATE (as of 2026-04-20)

Brand name: "Truth Mirror — The Career Intelligence Platform"

Accent system: dual, user-toggleable (FULLY WIRED)
  - Signal (teal #00F5D4) — default
  - Forge  (amber #FFB347)
  - All redesigned surfaces flip correctly with the toggle

Pages fully token-compliant: /dashboard, /cv, /diary, app-shell sidebar

Pages NOT yet redesigned (old inline styles):
  /tracker (Jobs), /market (Intel), /jobs (full list), /onboarding, /mission

Components NOT yet redesigned:
  components/dashboard/skill-upgrade-card.tsx — light-mode Tailwind classes
  components/tracker/job-tracker-card.tsx     — light-mode Tailwind classes

## KNOWN FOLLOW-UPS (carry into next session)

  [ ] Regenerate Signal Dot particle logo in amber for Forge mode.
      Current PNG has teal baked in — doesn't flip with accent toggle.
  [ ] Replace TMLogo SVG in sidebar + About modal with new Signal Dot mark.
  [ ] Redesign /tracker, /market, /jobs, /onboarding, /mission pages.
  [ ] Token pass on skill-upgrade-card.tsx and job-tracker-card.tsx.

## NEXT SESSION FOCUS

  Continue page redesign pass:
    - /tracker (Jobs Tracker) — highest user-facing priority
    - /market (Intel panel)
    - skill-upgrade-card.tsx + job-tracker-card.tsx components
    - Then /jobs, /onboarding, /mission

  Same checklist:
    - All hardcoded hex → var(--tm-*) tokens
    - Type scale: display/title/heading/body/meta (no arbitrary sizes)
    - 4-signal affordance rule on all interactive elements
    - Status semantics: success/warning/danger only (never accent for status)
    - Test under both Signal and Forge accents before marking done
```

---

## PREVIOUS SESSION SUMMARY (2026-04-18 — FIRST PRODUCTION DEPLOYMENT 🚀)

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