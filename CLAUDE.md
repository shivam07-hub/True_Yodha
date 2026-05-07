# MYRO — CLAUDE.md (Cockpit)
### Session Control File · v4.1 · May 2026

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
- Backend dev: `PYTHONPATH=backend uvicorn app.main:app --reload`
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

## ✅ MISSION CONTROL REDESIGN — COMPLETE (2026-05-07)

All phases shipped. See Last Session Summary for details.

- ✅ P0-1 — match % clamped to 0–100 (was double-multiplied in home/page.tsx)
- ✅ P0-2 — location filter applied; 15,340 job rows backfilled with location_country
- ✅ Phase 1 — Skill Intelligence widget replaced with Top Skill Gaps card (endpoint: `GET /jobs/{job_id}/skill-gap`)
- ✅ Phase 2 — Pipeline card redesigned: company + role title + status label + age + "Log update →" CTA
- ✅ Phase 3 — Forge CTAs clarified (job card: "▶ Forge: [skill]", today card: "Open Forge →"); Active Focus tabs show company name only; focused job card elevated with accent border + shadow

**Skill gap level heuristic:** `required_level = 4` (primary) / `2` (secondary) fires only when `job_skills.required_level IS NULL`. When scraper adds that column, True_Yodha auto-uses real values — no code change needed. See firecrawl_Supabase CLAUDE.md §Pending Work for the scraper contract.

---

## OPEN WORK

### ✅ NEW-USER FLOW BUG SPRINT — COMPLETE (2026-05-07)

- ✅ Bug 1 — Orphan user 404s: `ensure_profile_exists()` in `deps.py`, `update_profile` UPSERTs
- ✅ Bug 2 — PostgREST 400: RPC `fetch_job_skills_by_job_ids(text[])` live in Supabase
- ✅ Bug 3 — Settings modal: full Substack-inspired redesign (see Last Session Summary)

---

### ✅ CV upload perceived latency — DONE (2026-05-07)
Stage timers in `CVUploadProcessing` now match real ~29s window (7s → 20s). Footer copy: "20–30 seconds". No backend change needed.

---

### Backlog (priority order)

1. **Smoke test steps 4–10** — tracker → save job → diary → Next Mission card → mark complete → score recompute loop.
2. **cv_parser.py + diary_processor.py → LLMProvider** — still on raw API calls; migrate to unified fallback chain.
3. **Phase 4 — Cross-repo taxonomy contract** — checksum check on boot + contract test asserting `public.jobs` shape matches `csv_importer.py` output.
4. **Drop `jobs.main_skills` / `jobs.side_skills`** — confirm ≥1 full scraper run wrote directly to `job_skills`, then `ALTER TABLE jobs DROP COLUMN main_skills, DROP COLUMN side_skills`.
5. **Newsletter Issue 002 distribution** — images, internal links, schedule email + social.
6. **Report as Inactive feature** — full spec at `docs/REPORT_INACTIVE_FEATURE.md`. Needs `job_reports` table + scraper Phase 3 upload first.

**Defer to v2:** domain layer separation · Rename Mirror→Myro in remaining strings · Pillar pages `/careers/*` · Per-job progress detail views

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
| NU1 | Profile auto-provisioned from JWT email + user_metadata.full_name on first authenticated request. Admin client (bypass RLS). Cached per-process. Failure logs-and-continues. |
| NU2 | `update_profile` UPSERTs (defensive). |
| NU3 | Bug 2 fix uses Supabase RPC, not request chunking. Chunking kept only as fallback. |
| NU4 | Bug 3 = full redesign, not minimal patch. Design loop → spec → Claude Code. |

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
- Milestone seed: behind CTA, not auto
- Milestone content: template if `template_id` matches, else LLM-generated
- Skill selection per path: top 3 gap skills, user can swap
- Diary binding: auto-bind to next-due milestone, one-tap override
- Milestone complete: explicit button only
- Proof/impact: entry text = proof; impact = separate prompt via `impact_prompt` column
- LLM degradation: save entry without `skills_delta` — diary never fails due to LLM down
- CV variant threshold: 3 milestones with proof → auto-regenerate deterministic; AI polish = opt-in
- CV variant storage: `cv_history` row with `version_type='generated_draft'`

---

## ARCHITECTURE STATE (as of 2026-05-07)

**Backend structure:**
- `backend/app/routers/jobs/{list,detail,match,apply,milestone}.py`
- `backend/app/routers/cv/{upload,history,variants}.py`
- `backend/app/repositories/{scores,skills,users,diary,cv,jobs}.py`
- `backend/app/services/scoring/{formulas,gap,persistence}.py`
- `backend/app/services/job_path/{plan,milestones,cv_generator,quality_gate,llm_polish,_db,_helpers,_content}.py`
- `backend/app/services/llm_provider.py` — unified LLM fallback chain (OpenRouter→Groq→Gemini)
- `backend/app/services/location_normalizer.py` — regex normalizer, writes to `location_country / location_city / location_mode / location_quality`

**DB schema highlights:**
- `job_skills (job_id FK→jobs, skill_id FK→skills, is_primary BOOLEAN)` — canonical skill source
- `followed_companies (user_id FK→user_profiles, company_name TEXT, UNIQUE(user_id, company_name))` — RLS-protected, live (2026-05-07)
- `jobs.location_country / location_city / location_mode / location_quality` — all backfilled (15,340 rows, 2026-05-07)
- Backward-compat trigger DROPPED (`trg_sync_job_skills` removed 2026-05-02)
- `jobs.main_skills` / `jobs.side_skills` still exist — drop pending (see backlog #4)
- `user_milestones` = personal milestones; `job_application_milestones` = job-path milestones
- All backend reads from `job_skills JOIN skills`

**Scraper (firecrawl_Supabase):**
- `csv_importer.py` — writes skills directly to `job_skills`
- `normalizer.py` — 3-tier taxonomy matching (exact → stripped → fuzzy 0.88)
- Schema contract documented in firecrawl_Supabase CLAUDE.md (location columns + `required_level` pending)

**Infrastructure:**
- Railway: `True_Yodha` → `Develop` → auto-deploy
- Vercel: `truemirror.vercel.app` → `main`
- Supabase: `gipvxuugajkugntwkeiz` (prod DB)
- LLM chain: OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid

---

## LAST SESSION SUMMARY (2026-05-07 — MISSION CONTROL REDESIGN)

```
Date: 2026-05-07
What landed:

  P0-1 — Match % fix (home/page.tsx):
    - overlap_score stored as 0-100 in DB; frontend was multiplying by 100 again
    - Four call sites: Math.min(100, Math.round(overlap_score)) — no backend change
    - Active Focus tabs, job card badge, CV readiness hero all now 0-100

  P0-2 — Location filter fix:
    - Root cause: target_location_country NULL in user_profiles → filter skipped
    - _ensure_location_country_backfilled() in deps.py already handles profile side
    - 15,340 job rows backfilled with location_country/city/mode/quality via
      backend/scripts/backfill_job_locations.py (script deleted post-run)
    - Backfill used batch-of-200 fresh Supabase clients to avoid HTTP/2 exhaustion

  Location architecture:
    - Consolidated into 4 meaningful columns: location_country, location_city,
      location_mode (remote/hybrid/onsite), location_quality (good/partial/inferred)
    - location and location_raw kept as source fields
    - firecrawl_Supabase CLAUDE.md updated with full schema + required_level contract

  Phase 1 — Top Skill Gaps card:
    - Skill Intelligence SVG widget deleted
    - New card: top 3 missing skills from GET /jobs/{job_id}/skill-gap
    - Each gap: skill name · L{user_level}→L{required_level} · "▶ Forge this gap" button
    - Heuristic: is_primary → required_level=4, else 2 (fires only when DB column NULL)
    - Placeholder when no focused job; "View all skill gaps →" links to /skills

  Phase 2 — Pipeline card redesign:
    - Pipeline rows now show: company (bold) + "Status · Nd" on top line
    - Role title (app.title) on second line
    - "Log update →" button routes to /diary?job={job_id}
    - STATUS_LABEL map: pending→"Saved", applied→"Applied", etc.
    - daysAgo() helper uses created_at

  Phase 3 — UX consistency:
    - P3-1: Job card CTA → "▶ Forge: {top gap skill}" (pre-selects skill)
    - P3-1: Today card CTA → "Open Forge →" (generic entry)
    - P3-2: Active Focus tabs → company name only (% removed)
    - P3-2: Focused job card → 2px accent border + glow shadow
    - P3-2: Today card date → fontSize 22 (was 36+)

  Bug 2 RPC migration:
    - SQL run in Supabase: fetch_job_skills_by_job_ids(job_ids text[]) live
    - Backend routes through RPC; chunked .in_() kept as fallback

  Verification: tsc --noEmit + next lint → clean

  Settings modal redesign (Substack-inspired):
    - Two-column layout: 200px left sidebar + scrollable right content
    - Left sidebar: 52px initials avatar, name, email, Account/Following nav tabs,
      autosave indicator at bottom
    - Account tab: PROFILE section (Ninja Name + LinkedIn), JOB SEARCH section
      (Target Roles DnD chips + Target Location combobox), Save button
    - Following tab: search bar, company list (initials avatar + name + View jobs →
      + unfollow ×), empty state with Market CTA
    - followed_companies table: UNIQUE(user_id, company_name), RLS, live in Supabase
    - 3 endpoints: GET/POST/DELETE /users/me/following/companies
    - Market page: ☆ Follow / ★ Following pill button on company skills panel

Pending from this session:
  - CV upload latency decision (Option A vs B)
```
