# MYRO — CLAUDE.md (Cockpit)
### Session Control File · v4.0 · May 2026

---

## SESSION START RITUAL (do this every time, no exceptions)

1. Read this file top to bottom
2. State your full plan for today and wait for "yes / proceed / go ahead"
3. Work one task at a time — commit after each completed task
4. Before ending: update **Last Session Summary** below

---

## ABSOLUTE RULES (cannot be broken)

- Never merge to `main` directly — only to `Develop`. `main` = Vercel production.
- Never hardcode API keys — use `.env` files, never commit `.env`
- Never skip tests before marking a task complete
- Web only (mobile-responsive) — use tailwindcss and shadcn

---

## PROJECT IN ONE PARAGRAPH

Myro is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills are extracted and matched against a global skill taxonomy (L1–L5 levels determined by comparing CV evidence to taxonomy benchmark definitions) → top 5 job matches are found by skill overlap and LLM-ranked → top 3 are recommended to the user with explanations and a 7-day action plan to align their CV to each job → a Myro Score (0–100) is computed across 10 domains → user sees their score, domain breakdown, top 3 recommended jobs, and top 5 skill upgrade priorities. Application tracking records whether the user applied, received a response, and status at the 1-week check-in.

**Tech stack:** FastAPI (backend) · Railway (backend hosting) · Next.js 14 (frontend), Tailwind CSS, Shadcn/ui · Supabase/PostgreSQL (DB) · Vercel (frontend hosting) · OpenRouter API (LLM ranking) · Chrome Manifest V3 (`/Chrome_extension/`)

**Reference docs:** `docs/TECH_STACK.md` · `docs/SCORING_ALGORITHM.md` · `docs/DEPLOYMENT_GUIDE.md`

---

## CODING CONVENTIONS (always apply)

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, Supabase client for all DB ops (no SQLAlchemy/Alembic), `HTTPException` only, 100% test coverage on scoring engine.

**TypeScript:** Strict mode ON, no `any`, functional components only, all API calls via `lib/api.ts`, TanStack Query for server state, Zustand for UI-only state, 375px mobile viewport required.

**Git commits:** `feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope per commit.

**File size:** No file > 300 lines. Split if exceeded.

---

## CLAUDE CODE SKILLS (available via `/skill-name`)

| Skill | Trigger | Purpose |
|---|---|---|
| `improve-codebase-architecture` | `/improve-codebase-architecture` | Find deepening opportunities, ADR-informed refactor suggestions |
| `graphify` | `/graphify` | Any input → knowledge graph (HTML + JSON + audit report) |
| `triage-issue` | `/triage-issue` | Root-cause a bug, file GitHub issue with TDD fix plan |
| `to-issues` | `/to-issues` | Break plan/spec/PRD into vertical-slice GitHub issues |
| `to-prd` | `/to-prd` | Turn conversation into a PRD, file as GitHub issue |
| `review` | `/review` | Review current branch PR |
| `security-review` | `/security-review` | Security review of pending branch changes |
| `tdd` | `/tdd` | Red-green-refactor TDD loop for features/bug fixes |
| `frontend-design` | `/frontend-design` | Production-grade frontend interfaces, high design quality |
| `baseline-ui` | `/baseline-ui` | Animation, typography, accessibility, layout audits |
| `fixing-accessibility` | `/fixing-accessibility` | ARIA, keyboard nav, focus, contrast audits + fixes |
| `fixing-motion-performance` | `/fixing-motion-performance` | Animation perf: layout thrashing, compositor, scroll-linked |
| `fixing-metadata` | `/fixing-metadata` | HTML metadata: titles, OG tags, Twitter cards, canonical |
| `schedule` | `/schedule` | Schedule recurring or one-time remote agents |
| `caveman` | `/caveman` | Ultra-compressed communication mode |
| `grill-me` | `/grill-me` | Relentless interview to resolve plan/design ambiguities |
| `qa` | `/qa` | Interactive QA session → GitHub issues |

---

## ENVIRONMENT & VIRTUAL ENV

- Python venv: `.venv/` (project root) — `source .venv/bin/activate`
- Install deps: `pip install -r backend/requirements.txt`
- Backend dev: `uvicorn backend.app.main:app --reload`
- Frontend dev: `cd frontend && npm run dev`

---

## WORKING WITH CODEX — TWO-AGENT WORKFLOW

| Task type | Best fit |
|---|---|
| Multi-file orchestration, cross-cutting refactors | Claude Code |
| Mechanical splits / renames once interfaces are agreed | Codex |
| Test scaffolding for new module boundaries | Codex |
| Single-file Python tweaks with clear instructions | Either |

**Claude → Codex handoff:** specify target files + line ranges, new function signatures, which tests must pass, imports to rewrite.

**Codex → Claude handoff:** commit on `Develop`, push, update **LAST SESSION SUMMARY** below.

**Shared:** All work on `Develop`. Run `pytest backend/tests` + `tsc --noEmit` + `next lint` before marking complete.

**Architecture audit:** `graphify-out/GRAPH_REPORT.md` (832 nodes, 1247 edges) + `graphify-out/graph.html` — consult before any refactor phase.

---

## OPEN WORK (as of 2026-05-03)

Priority order:

1. **Smoke test steps 4–10** — tracker → save job → diary → Next Mission card → mark complete → score recompute loop. Full end-to-end production path with dedicated test account.

2. ~~**GA4 wiring**~~ ✅ DONE (2026-05-03) — `NEXT_PUBLIC_GA_ID=G-W4JXC52DKW` set in Vercel; `<Script>` added to `frontend/app/layout.tsx`. `trackEvent()` now live in production.

3. **cv_parser.py + diary processor → LLMProvider** — still on raw API calls. Migrate to unified `LLMProvider.complete()` fallback chain (same pattern as `llm_ranker.py`). Files: `backend/app/services/cv_parser.py`, `backend/app/services/diary_processor.py`.

4. **Phase 4 — Cross-repo taxonomy contract** — `lightcast_skills_taxonomy.json` lives in two places (`backend/` and `firecrawl_Supabase/scraper/`). Add checksum check on boot + a contract test in Myro asserting `public.jobs` table shape matches what `csv_importer.py` writes.

5. **Drop `jobs.main_skills` / `jobs.side_skills` columns** — trigger already dropped (migration `20260502_drop_job_skills_trigger.sql` run). Do NOT drop columns yet — confirm at least one full scraper run wrote correctly to `job_skills` directly via `csv_importer.py`. Then run `ALTER TABLE jobs DROP COLUMN main_skills, DROP COLUMN side_skills`.

6. **Newsletter Issue 002** — use `npm run new:issue` to scaffold. Needs ≥3 issues before pillar pages (`/careers/*`) are worthwhile.

**Defer to v2:**
- Phase 8 — domain layer separation (DTO ↔ entity ↔ row mapping)
- Rename Mirror → Myro in remaining code strings
- Pillar pages `/careers/*` (needs 3+ issues first)
- Per-job progress detail views, pause/abandon/resume flows

---

## DECISIONS LOCKED (do not reopen without explicit user instruction)

| # | Decision |
|---|---|
| OQ1 | **Separate repos.** Myro + firecrawl_Supabase stay independent. Contract tests in Phase 4. |
| OQ2 | **Token-scoped for user endpoints.** Service-role for admin/internal only. |
| OQ3 | **Intentional LLM separation.** Scraper = local LM Studio. Myro = cloud (OpenRouter→Groq→Gemini). |
| OQ4 | **Single canonical scoring.** `compute_and_persist_score()` is the source of truth. |
| S1 | **`user_milestones` = personal milestones** (kept alive). `job_application_milestones` = job-path milestones. Merge at service layer only. |
| S2 | **Join table** for `daily_logs` ↔ milestone binding. One entry can complete milestones across multiple job-paths. |
| S3 | **`job_applications.status = 'pending'`** means saved/targeted. Every saved job is an intended application. |
| S4 | **Intel is ephemeral.** Skill targets inferred from saved jobs only. No DB writes. |
| S5 | **No cap on active job paths.** Surface only "next due" milestone in diary. |

---

## ARCHITECTURE — PROGRESS FLOW (north star)

```
Intel    → pick target skill / company (ephemeral — no DB write)
Jobs     → save a target job (job_applications.status = 'pending')
           ↳ seeds job_application_milestones (7 rows) behind "Build my plan" CTA
Progress → next-due milestone in NextMissionCard at top of /diary
           ↳ submitting an entry:
              • appends to daily_logs.entry_text
              • join table links entry → milestone(s)
              • keyword signal extraction → fills skills_delta
              • upgrades user_skills.matched_level
              • explicit "Mark complete" → sets completed_at, copies proof/impact
CV       → when ≥3 milestones for a job have proof → deterministic CV variant auto-regenerates
           AI polish = opt-in CTA (costs money)
Dashboard → trajectory view: score Δ, jobs in flight, milestones done, latest CV vN (30-day fixed)
```

**Tier 2 decisions (locked):**
- Milestone seed: behind CTA, not auto (avoids spam)
- Milestone content: template if `template_id` matches, else LLM-generated
- Skill selection per path: top 3 gap skills, user can swap
- Plan start: today, with "shift to next Monday" toggle
- Diary binding: auto-bind to next-due milestone, one-tap override
- Milestone complete: explicit button only (meaningful event)
- Proof/impact: entry text = proof; impact = separate prompt via `impact_prompt` column
- LLM degradation: save entry without `skills_delta` — diary never fails due to LLM down
- Skill attribution conflict: keep `source='cv'`, stamp `last_diary_evidence_at`
- CV variant threshold: 3 milestones with proof → auto-regenerate deterministic; AI polish = opt-in
- CV variant storage: polished variant → `cv_history` row with `version_type='generated_draft'`
- CV variant view: inline drawer on `/cv`

---

## ARCHITECTURE STATE (as of 2026-05-03)

**Backend structure:**
- `backend/app/routers/jobs/{list,detail,match,apply,milestone}.py`
- `backend/app/routers/cv/{upload,history,variants}.py`
- `backend/app/repositories/{scores,skills,users,diary,cv,jobs}.py`
- `backend/app/services/scoring/{formulas,gap,persistence}.py`
- `backend/app/services/job_path/{plan,milestones,cv_generator,quality_gate,llm_polish,_db,_helpers,_content}.py`
- `backend/app/services/llm_provider.py` — unified LLM fallback chain (OpenRouter→Groq→Gemini)

**DB schema highlights:**
- `job_skills (job_id FK→jobs, skill_id FK→skills, is_primary BOOLEAN)` — canonical skill source; 16,342 rows backfilled
- Backward-compat trigger DROPPED (`trg_sync_job_skills` removed 2026-05-02)
- `jobs.main_skills` / `jobs.side_skills` columns still exist (enrichment pipeline uses them) — drop pending
- `user_milestones` = personal milestones (alive); `job_application_milestones` = job-path milestones
- All backend reads from `job_skills JOIN skills`

**Scraper (firecrawl_Supabase):**
- `csv_importer.py` — writes skills directly to `job_skills` (resolved skill_id via `skills.taxonomy_key`)
- `supabase_enricher.py` — backfill enricher; writes via `write_job_skills()` to `job_skills`
- `normalizer.py` — single source of truth for taxonomy matching (3-tier: exact → stripped → fuzzy 0.88)
- `jobs.main_skills` / `jobs.side_skills` still written by scraper pipeline (enrichment phase) — OK until columns dropped

**Infrastructure:**
- Railway: `True_Yodha` repo → `Develop` branch → auto-deploy
- Vercel: `truemirror.vercel.app` → `main` branch
- Supabase: `gipvxuugajkugntwkeiz` (prod DB)
- LLM chain: OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid

---

## LAST SESSION SUMMARY (2026-05-03 — NEWSLETTER REDESIGN + GA4)

```
Date: 2026-05-03
What landed this session:

  Newsletter redesign (Substack-style layout):
    - New components: ReadingProgress, ShareButton, TldrCard, StatCards, DataTable,
      LocationChart, SkillsList, CareerCards, EmailSubscribe, MethodologyBlock
    - app/newsletter/[slug]/page.tsx: full rewrite — 760px max-width, reading progress bar
      (CSS scroll-driven, no JS), byline bar, share button, bottom CTA only
    - app/newsletter/page.tsx: robots indexing fixed, max-width 760
    - globals.css: newsletter-prose overrides, nl-reading-progress, nl-page-enter, z-index scale
    - design-tokens.css: fixed z-index scale added
    - lib/newsletter/index.ts: issueNumber, seriesLabel, readMinutes, authorName, authorInitials fields
    - content/newsletter/issues/2026-04-ai-hiring-heatmap.mdx: frontmatter extended,
      mid-article CTA removed, methodology section cleaned (no internal schema exposed)

  Newsletter guidelines (sister repo):
    - /Myro Newsletter/skills/myro-newsletter/references/monday-hiring-heatmap.md:
      methodology template rewritten — instructs plain-language output only, no SQL/schema
    - /Myro Newsletter/skills/myro-newsletter/references/data-sources.md:
      "Honest caveats" items 4-5 rewritten to reader-safe language;
      INTERNAL NOTE added blocking schema exposure in published articles

  GA4 wiring:
    - frontend/app/layout.tsx: <Script> tags added (afterInteractive, only renders when env var set)
    - NEXT_PUBLIC_GA_ID=G-W4JXC52DKW set in Vercel — live in production
    - trackEvent() in lib/analytics.ts now active

Verification:
  tsc --noEmit  → exit 0
  next lint     → no errors
```
