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
- **Newsletter articles: collaborate before drafting.** From 2026-05-08 onwards, do NOT write a full newsletter article (Substack mini, MDX hub piece, or LinkedIn long post) without first agreeing with Shivam on (a) the angle/insights, (b) which dashboards or images to embed, (c) the heading. Two-line confirmation pass minimum. Apply to every newsletter task site (`/Users/incognito/Myro Newsletter/`, `/frontend/content/newsletter/`, anywhere we draft newsletter content). See VOICE-NOTES.md for the full protocol.

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

1. ✅ **XP + Forge system** — complete. 13/13 tests pass. TSC + lint clean.
2. ✅ **Smoke test steps 4–10** — validated by Shivam.
3. ✅ **cv_parser.py → LLMProvider** — `_llm_extract()` now delegates to `get_llm_provider().complete()`; private provider constants removed.
4. ✅ **Phase 4 — Cross-repo taxonomy contract** — CLOSED. Taxonomy will not change from repo files in foreseeable future. No checksum/contract test needed.
5. **Drop `jobs.main_skills` / `jobs.side_skills`** — confirm ≥1 full scraper run wrote directly to `job_skills`, then `ALTER TABLE jobs DROP COLUMN main_skills, DROP COLUMN side_skills`.
6. **Newsletter Issue 002 distribution** — images, internal links, schedule email + social.
7. **Report as Inactive feature** — full spec at `docs/REPORT_INACTIVE_FEATURE.md`. Needs `job_reports` table + scraper Phase 3 upload first.

**Defer to v2:** domain layer separation · Rename Mirror→Myro in remaining strings · Pillar pages `/careers/*` · Per-job progress detail views

---

## 🐛 BUG SPRINT + UX UPLIFT — QUEUED (2026-05-09, Cowork audit)

> Auto-detected from `reference/` screenshots (13 images, Apr 28–May 9). Build on `Develop`. Each item is independent unless noted. **Do P0s first — they corrupt real user data.**

---

### P0 — Critical (wrong data shown to users)

**P0-A — XP balance displays wrong value (◆60 for 9 sessions; expected ≥1450)**
- Root cause 1: `welcome_xp_granted` + `xp_balance` columns on `user_profiles` may not exist in Supabase (Phase 1 schema). `xp.balance(token)` silently fails → frontend falls back to `computeTotalXP(entries)` which sums `skills_delta.xp_added` from diary entries (small LLM-assigned values), not the wallet.
- Root cause 2: `grant_welcome_xp()` (1000 XP) is never called — `cv/upload.py` does NOT invoke it after analysis (Phase 2d was specced but not wired).
- Fix steps:
  1. Run Phase 1 SQL if not yet applied — verify with `SELECT column_name FROM information_schema.columns WHERE table_name='user_profiles' AND column_name IN ('xp_balance','welcome_xp_granted')`.
  2. In `backend/app/routers/cv/upload.py`, add `from app.services.xp_service import grant_welcome_xp` and call `await grant_welcome_xp(user_id)` after `cv_workflow.ingest_uploaded_cv()` resolves.
  3. In `frontend/app/home/page.tsx`, remove the `computeTotalXP` seeding fallback — if `xp.balance()` fails, seed as `0` not a wrong computed value (show "◆ —" until loaded).
- Test: re-upload CV → XP balance shows 1000+. Complete one forge session → shows 1050+.

**P0-B — CV score drifts on re-upload (same CV → different score)**
- Root cause: `cv_workflow.ingest_uploaded_cv()` runs full LLM extraction every call with non-zero temperature. LLM nondeterminism causes score variance ±5–15 points.
- Fix: Add CV content hash check in `cv_workflow.py`. Compute `SHA-256` of raw extracted text. If hash matches `cv_history.content_hash` for this user's latest CV, skip re-extraction and return cached skills. Only full re-run if hash differs.
- Schema: `ALTER TABLE cv_history ADD COLUMN IF NOT EXISTS content_hash TEXT;`
- Test: upload same PDF twice → second upload returns identical score ± 0.

**P0-C — Diary cart_skills silently dropped on submit**
- Root cause: `handleDiarySubmit` in `home/page.tsx` calls `void cart` (line 261). Backend already supports `cart_skills` (diary.py line 41: `cart_skills=[s.model_dump() for s in body.cart_skills]`). But `diary.createEntry()` in `frontend/lib/api.ts` (line 913) never passes `cart_skills` in the body. Also `daily_logs.cart_skills JSONB` column may not exist in Supabase.
- Fix steps:
  1. Verify `daily_logs.cart_skills JSONB NOT NULL DEFAULT '[]'` column exists in Supabase (Phase 1 schema item).
  2. In `frontend/lib/api.ts`, update `diary.createEntry` signature: `createEntry(token, entryText, logDate?, cartSkills?)` and include `cart_skills: cartSkills ?? []` in the POST body.
  3. In `home/page.tsx` `handleDiarySubmit`, replace `void cart` with the cart passed to `diary.createEntry()`.
- Test: add 2 skills to cart → submit diary entry → check `daily_logs` row in Supabase has non-empty `cart_skills`.

---

### P1 — Functional bugs (broken interactions)

**P1-A — "Log update →" in Pipeline card doesn't open diary panel**
- Root cause: `router.push('/home?jobId=${app.job_id}')` navigates to same page with `urlJobId` param but never calls `setDiaryOpen(true)`. The diary only opens when that setter is explicitly called.
- Fix: In `home/page.tsx`, add `useEffect(() => { if (urlJobId) setDiaryOpen(true) }, [urlJobId])`. Also pre-populate diary textarea with `📌 Update on [Company]:` prefix by passing `initialText` prop to `DiaryPanel`.
- Files: `frontend/app/home/page.tsx`, `frontend/components/diary/DiaryPanel.tsx`.

**P1-B — Forge fallback creates fake diary entries polluting history**
- Root cause: `handleForgeSession` catch block creates a diary entry `"Forge session complete (N min). Skill: X."` as a workaround. Backend IS deployed (`forge_service.py` + `xp.py` router exist). These fake entries accumulate in the user's diary history.
- Fix: Remove the entire catch fallback. If `xp.completeForge()` fails, show `showToast("Session couldn't save — try again")` and rethrow. No diary entry created. The try/catch stays for error handling only.
- File: `frontend/app/home/page.tsx` `handleForgeSession()`.

**P1-C — Sidebar subtitle "CAREER INTELLIGENCI" text clipped**
- Root cause: `app-shell.tsx` sidebar subtitle has no overflow handling. The word "INTELLIGENCE" overflows the sidebar width.
- Fix: Add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to the subtitle element, or reduce `letter-spacing` from current value.
- File: `frontend/components/app-shell.tsx`.

**P1-D — Intel page shows "RUNNING THE AGENT · FETCHING MARKET COVERAGE" indefinitely**
- Root cause: `marketSummary` in `market/page.tsx` falls back to `MARKET_LOADING_SUMMARY` constant when `analytics` is null. The `analyticsForMe` endpoint may return 404/500 for users without full profiles, causing `isLoading` to stay `true` via retry or the data to stay null.
- Fix: Add explicit error state handling in `market/page.tsx`. If `analytics` query is in error state OR `isLoading` has lasted > 8s, show: `"Set your target roles to see personalised intel"` with a Settings CTA instead of the infinite spinner. Check if `jobs.analyticsForMe` handles null `selectedCluster` gracefully.
- File: `frontend/app/market/page.tsx`.

---

### P2 — Design & UX polish (enterprise B2C feel)

**P2-A — Core user journey loop never shown to users**
- The 7-step loop (Find job → See gap → Forge → Log → Graph → Tailor CV → Apply) from the Apr 28 wireframe is the entire product promise. Users have no mental map.
- Fix: Add a compact "journey breadcrumb" strip between the Mission Control heading and the ForgeStrip. Show 7 steps as icon pills. Highlight the user's current step (derived from: has CV? → has saved job? → has gap skills? → has forge sessions? → etc.). Use icon-only on narrow screens with `title` tooltip.
- Component: new `frontend/components/common/journey-strip.tsx` (<80 lines). Wire into `home/page.tsx`.

**P2-B — Company tabs tracked by array index, fragile on refetch**
- Root cause: `activeJobIdx: number` state. If `topJobs` array reorders on next fetch, wrong tab is highlighted.
- Fix: Replace `activeJobIdx` with `activeJobId: string | null` (default `topJobs[0]?.job_id ?? null`). All comparisons: `j.job_id === activeJobId`. Update `setActiveJobIdx` → `setActiveJobId`. One refactor, no API changes.
- File: `frontend/app/home/page.tsx`.

**P2-C — Target roles header overflows on long role lists**
- Root cause: `targetRoles = profile?.target_roles?.join(", ")` — no truncation. "BUSINESS-TO-BUSINESS (B2B) SALES, COMPENSATION AND BENEFITS, SALES MANAGEMENT · INDIA" wraps or overflows.
- Fix: Limit to first 2 roles + `+N more` suffix. Add `title` attribute with full string for hover tooltip. Max-width the subtitle div with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
- File: `frontend/app/home/page.tsx` header section.

**P2-D — Two disconnected diary cart systems cause user confusion**
- The Tracker page uses the old URL-based `buildDiarySelectionsHref` cart (routes to `/diary?...` page). Mission Control uses the new Zustand `cartStore` + `DiaryPanel` slide-in. Users who queue skills from Tracker land on a different `/diary` route, not the Mission Control panel.
- Decision needed: **Unify to one cart system.** Recommended: adopt the new `cartStore` (Zustand) everywhere. Remove the `buildDiarySelectionsHref` routing from Tracker. The "Send to diary" CTA in Tracker should instead call `useCartStore().addSkill()` and then navigate to `/home` where the DiaryPanel auto-opens (P1-A fix enables this).
- Files: `frontend/app/tracker/page.tsx`, `frontend/lib/diary-skill-cart.ts` (can be deleted once migrated), `frontend/app/home/page.tsx`.

**P2-E — Skills domain labels truncated in grid view**
- Domain names "Information T...", "Media and Co...", "Science and R..." are clipped in the grid columns.
- Fix: Reduce domain name `font-size` to 11px. Add `title` attribute on each domain card for hover. Or switch the grid to 2 columns with more horizontal space per card.
- File: `frontend/app/skills/page.tsx` domain grid section.

**P2-F — Intel page shows two separate empty-state banners for new users**
- When no CV + no target roles: two separate message blocks appear ("Add your CV..." and "No target roles set — Add target roles..."). Confusing for new users.
- Fix: Replace both with one unified step card: **"2 steps to unlock your Intel: [●] Upload CV [○] Set target roles"** with a single CTA routing to the first incomplete step. Show step dots (●○) as visual progress.
- File: `frontend/app/market/page.tsx` (replace `CVRequiredNudge` + the roles nudge with unified component).

**P2-G — Gap skills card shows only 3 items, leaving card mostly empty**
- 3 gap skills + "View all →" link leaves large whitespace below. Looks unpolished.
- Fix: Show up to 5 gap skills (`gapSkills.slice(0, 5)`). Add a mini summary line at top of card: `"${gapSkills.length} gaps to close for ${activeJob.company}"` in faint text.
- File: `frontend/app/home/page.tsx` Skill gaps card section.

**P2-H — Achievements pill row has no label — users won't understand it**
- The pill row at bottom of Mission Control has no heading. First-time users won't know what these pills mean.
- Fix: Add a `"MILESTONES"` label above the row (same 10px uppercase tracking style as other section labels). Show count: `"MILESTONES · ${earnedAchievements.length} / ${ACHIEVEMENTS.length}"`.
- File: `frontend/app/home/page.tsx` achievements section.

**P2-I — Empty states use developer language, not warm B2C copy**
- Track page: `"No matches yet — Upload your CV then click Refresh."` feels like an error message.
- Intel page: `"RUNNING THE AGENT · FETCHING MARKET COVERAGE"` (uppercase, technical).
- Fix (Track): `"Your job matches appear here once your CV is analysed — we scan thousands of live roles for your skill set."` + `"Upload CV →"` button.
- Fix (Intel): When roles missing, replace the uppercase subtitle with: `"Tell us what you're aiming for and we'll show you who's hiring."` + `"Set target roles →"` button linking to Settings.

---

### Build order for the above

```
Step 1 — Schema verification + fixes (Supabase SQL editor)
  → Verify xp_balance / welcome_xp_granted on user_profiles
  → Verify daily_logs.cart_skills JSONB
  → Add cv_history.content_hash TEXT if missing
  → Run any missing Phase 1 SQL

Step 2 — P0-A: Welcome XP wiring (backend)
  → backend/app/routers/cv/upload.py: add grant_welcome_xp() call

Step 3 — P0-B: CV hash short-circuit (backend)
  → backend/app/services/cv_workflow.py: SHA-256 content hash check

Step 4 — P0-C: Cart skills wiring (frontend + verify backend)
  → frontend/lib/api.ts: diary.createEntry() + cartSkills param
  → frontend/app/home/page.tsx: remove void cart

Step 5 — P1-A: Log update → diary auto-open (frontend)
  → frontend/app/home/page.tsx: useEffect on urlJobId → setDiaryOpen(true)
  → frontend/components/diary/DiaryPanel.tsx: initialText prop

Step 6 — P1-B: Remove forge fake diary fallback (frontend)
  → frontend/app/home/page.tsx: handleForgeSession catch block

Step 7 — P1-C: Sidebar subtitle overflow (frontend)
  → frontend/components/app-shell.tsx

Step 8 — P1-D: Intel page loading hang fix (frontend)
  → frontend/app/market/page.tsx

Step 9 — P2 polish pass (frontend)
  → P2-A journey strip component
  → P2-B company tab by job_id
  → P2-C target roles truncation
  → P2-D tracker cart unification
  → P2-E domain labels
  → P2-F intel empty state
  → P2-G gap card expand to 5
  → P2-H achievements label
  → P2-I empty state copy

Step 10 — Verify
  → tsc --noEmit (zero errors)
  → next lint (zero warnings)
  → Manual smoke: upload CV → XP=1000 → complete forge → XP=1050 → submit diary with cart → cart persisted → pipeline "Log update →" opens diary → Intel page loads without infinite spinner

Step 11 — Commit
  → fix: XP wiring, CV hash, cart persistence, diary nav, polish pass
```

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

## XP + FORGE SYSTEM — FULL BUILD SPEC (2026-05-09)

> Status: **READY TO BUILD** — design finalised in Cowork session 2026-05-09.
> Build on `Develop` branch. Do NOT touch `main`.
> Complete each phase in order — later phases depend on earlier schema/endpoints.

---

### WHAT THIS REPLACES / REMOVES

- **7-day milestone plan removed entirely** — no `job_application_milestones` seeds, no LLM-generated plans, no 7-day UI. The user drives their own schedule through the skill cart.
- **Forge progress strip moved** — now sits directly below the "Mission control" heading, above company tabs.
- **Diary redesigned** — no longer a raw text-dump at bottom of page. Now a slide-in panel with two zones: (1) personal journal / vent area, (2) skill cart.
- **Achievements demoted** — compact pill row at bottom of Mission Control, not a full section.
- **Evidence Since Last CV strip removed as standalone section** — data collapsed into forge strip subtitle: "Since last CV: +N score · N diary entries · N days".

---

### DECISIONS LOCKED (XP + FORGE)

| # | Decision |
|---|---|
| XP1 | XP is permanent — never resets at midnight or any interval. It is a wallet the user owns forever. |
| XP2 | Welcome grant = 1000 XP, fired once after CV analysis completes (`cv_parser.py` pipeline end), gated by `user_profiles.welcome_xp_granted = FALSE`. |
| XP3 | Each forge session = +50 wallet XP. Each diary entry submit = +30 wallet XP. |
| XP4 | XP spend: 100 XP = rewrite one CV line (AI-tailored to focused job). 50 XP = download tailored CV PDF. Deducted immediately on button press — no confirm modal. |
| XP5 | Skill level thresholds (cumulative forge sessions on that skill): L0→L1 = 3, L1→L2 = 9, L2→L3 = 27, L3→L4 = 108. Wallet XP and skill-session counts are separate — wallet XP is currency, session counts drive level-up. |
| XP6 | Cart size = number of forge sessions the user can run. 3 skills in cart → 3 sessions available. No artificial daily cap — sessions are available as long as skills are in cart. |
| XP7 | Cart is ephemeral UI state (Zustand) until the user submits a diary entry — then it is snapshot-saved as `daily_logs.cart_skills JSONB`. Cart entry is immutable after submit. |
| XP8 | Forge modal is full-screen dark overlay. Cursor-following teal glow (radial CSS, JS mouse tracking). Teal edge particles (CSS keyframe animation). Everything else on screen disappears. |
| XP9 | Company tab selection reconfigures the WHOLE Mission Control page: gaps, pipeline, CV%, forge label, hero job card — all switch to that company's data. |

---

### PHASE 1 — SUPABASE SCHEMA (run in SQL editor, no migration tooling)

```sql
-- 1a. XP wallet + welcome grant flag on user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS xp_balance       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_xp_granted BOOLEAN NOT NULL DEFAULT FALSE;

-- 1b. Cart snapshot on daily_logs
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS cart_skills JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 1c. Forge sessions log (lightweight, one row per completed session)
CREATE TABLE IF NOT EXISTS forge_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_name       TEXT        NOT NULL,
  skill_id         UUID        REFERENCES skills(id),
  level_before     INTEGER     NOT NULL DEFAULT 0,
  level_after      INTEGER     NOT NULL DEFAULT 0,
  sessions_toward_next INTEGER NOT NULL DEFAULT 1,
  duration_minutes INTEGER     NOT NULL DEFAULT 25,
  xp_earned        INTEGER     NOT NULL DEFAULT 50,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE forge_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own forge sessions"
  ON forge_sessions FOR ALL USING (user_id = auth.uid());

-- 1d. Skill session counter on user_skills (tracks cumulative forge sessions per skill)
ALTER TABLE user_skills
  ADD COLUMN IF NOT EXISTS forge_sessions_count INTEGER NOT NULL DEFAULT 0;
```

**Verify schema applied** before moving to Phase 2:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_profiles' AND column_name IN ('xp_balance','welcome_xp_granted');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'daily_logs' AND column_name = 'cart_skills';
SELECT table_name FROM information_schema.tables WHERE table_name = 'forge_sessions';
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_skills' AND column_name = 'forge_sessions_count';
```

---

### PHASE 2 — BACKEND

#### 2a. `backend/app/services/xp_service.py` (new file, <120 lines)

```python
# Functions to implement (all async, use admin Supabase client):

async def get_xp_balance(user_id: str) -> int:
    # SELECT xp_balance FROM user_profiles WHERE id = user_id

async def grant_welcome_xp(user_id: str) -> int:
    # Guard: if welcome_xp_granted = TRUE, return current balance (idempotent)
    # UPDATE user_profiles SET xp_balance = xp_balance + 1000,
    #   welcome_xp_granted = TRUE WHERE id = user_id
    # Return new balance

async def earn_xp(user_id: str, amount: int) -> int:
    # UPDATE user_profiles SET xp_balance = xp_balance + amount WHERE id = user_id
    # Return new balance

async def spend_xp(user_id: str, amount: int, action: str) -> int:
    # SELECT xp_balance — if insufficient raise HTTPException(400, "Insufficient XP")
    # UPDATE user_profiles SET xp_balance = xp_balance - amount WHERE id = user_id
    # Return new balance
```

#### 2b. `backend/app/services/forge_service.py` (new file, <150 lines)

Skill level thresholds — define as module constant:
```python
LEVEL_THRESHOLDS = {0: 3, 1: 9, 2: 27, 3: 108}
# cumulative forge sessions needed to reach next level
# level 4 is max — no further progression
```

```python
async def complete_forge_session(
    user_id: str,
    skill_name: str,
    skill_id: str | None,
    duration_minutes: int,
) -> dict:
    # 1. Earn +50 XP (call xp_service.earn_xp)
    # 2. Fetch current user_skills row for this skill (match by skill_id or skill_name)
    #    — if no row exists, create one with matched_level=0, forge_sessions_count=0
    # 3. Increment forge_sessions_count += 1
    # 4. Determine level_before = matched_level
    # 5. Check if cumulative sessions cross threshold for current level:
    #    threshold = LEVEL_THRESHOLDS.get(level_before)
    #    if threshold and forge_sessions_count >= threshold:
    #        new_level = level_before + 1
    #        UPDATE user_skills SET matched_level = new_level, forge_sessions_count = forge_sessions_count + 1
    #    else:
    #        UPDATE user_skills SET forge_sessions_count = forge_sessions_count + 1
    # 6. INSERT into forge_sessions (all fields)
    # 7. Return {xp_earned: 50, new_xp_balance, level_before, level_after, leveled_up: bool,
    #            sessions_toward_next, sessions_needed: LEVEL_THRESHOLDS.get(new_level)}
```

#### 2c. `backend/app/routers/xp.py` (new router, <100 lines)

Register in `backend/app/main.py` with prefix `/users/me`.

```
GET  /users/me/xp
     → {balance: int}

POST /users/me/xp/spend
     Body: {amount: int, action: str}
     → {balance: int}  |  400 if insufficient

POST /users/me/forge/complete
     Body: {skill_name: str, skill_id: str | None, duration_minutes: int}
     → {xp_earned, new_xp_balance, level_before, level_after,
        leveled_up, sessions_toward_next, sessions_needed}
```

#### 2d. `backend/app/routers/cv/upload.py` — add welcome XP grant

After the CV analysis pipeline resolves skills successfully (after `compute_and_persist_score` is called), add:
```python
from app.services.xp_service import grant_welcome_xp
# ...after analysis completes:
await grant_welcome_xp(user_id)
```

This is idempotent — safe to call on re-upload.

#### 2e. `backend/app/routers/diary.py` (or wherever daily_logs POST lives)

Extend the diary entry creation endpoint to accept and persist `cart_skills`:
```python
class DiaryEntryCreate(BaseModel):
    entry_text: str
    cart_skills: list[dict] = []   # [{skill_name, level_from, level_to, company}]
    # ... existing fields

# After INSERT into daily_logs, earn XP:
from app.services.xp_service import earn_xp
new_balance = await earn_xp(user_id, 30)
# Return entry + {xp_earned: 30, new_xp_balance: new_balance}
```

#### 2f. Tests — add to `backend/tests/`

- `test_xp_service.py`: grant_welcome_xp idempotent, spend_xp insufficient guard, earn_xp accumulates
- `test_forge_service.py`: level-up fires at correct thresholds (3, 9, 27, 108), no overshoot past L4

---

### PHASE 3 — FRONTEND

All components on `Develop`. Run `tsc --noEmit` + `next lint` before each commit.

#### 3a. `frontend/lib/api.ts` — add 4 functions

```typescript
export async function getXPBalance(): Promise<number>
export async function spendXP(amount: number, action: string): Promise<number>
export async function completeForgeSession(payload: {
  skill_name: string
  skill_id?: string
  duration_minutes: number
}): Promise<ForgeSessionResult>
// ForgeSessionResult: {xp_earned, new_xp_balance, level_before, level_after,
//                      leveled_up, sessions_toward_next, sessions_needed}
```

Add types to `frontend/types/xp.ts` (new file).

#### 3b. `frontend/components/diary/DiaryPanel.tsx` (new component, <280 lines)

Slide-in panel rendered inside Mission Control layout (flex sibling, `width: 0 → 290px` CSS transition).

**Two zones:**

Zone 1 — Journal:
- Label: "TODAY'S THOUGHTS"
- `<textarea>` placeholder: "Vent, reflect, celebrate — what's going on with your search today?"
- No character limit, plain text

Zone 2 — Skill cart:
- Label: "SKILL CART · Skills to forge this week"
- List of cart items: `{skill_name, level_from, level_to, company}` — with × remove button
- "Add from gaps →" quick-add buttons (passed as props from parent, derived from current company's top gaps)
- Cart state lives in parent (Zustand store or lifted state in home/page.tsx)

Submit button: "Log entry · earn +30 XP"
- Calls `POST /diary` with `{entry_text, cart_skills: cartSkills}`
- On success: show "+30 XP" toast, clear journal textarea (keep cart — user may log again)

Past entries (below submit):
- Show last 3 entries, each truncated to 2 lines with expand
- Show XP tags (teal pills: "ML +50 XP") and cart tags (amber pills: "🛒 Machine Learning")

#### 3c. `frontend/components/forge/ForgeModal.tsx` (new component, <280 lines)

Full-screen dark overlay (`position: fixed, inset: 0` — this IS appropriate for a modal).
Background: `#070711`. Rendered via React portal into `document.body`.

Props:
```typescript
interface ForgeModalProps {
  cartSkills: CartSkill[]        // [{skill_name, level_from, level_to, company}]
  onClose: () => void
  onXPEarned: (amount: number, newBalance: number) => void
}
```

**Three screens** (internal state machine — `'queue' | 'session' | 'complete'`):

Screen 1 — Queue (`'queue'`):
- "TODAY'S FORGE QUEUE · N skills · N sessions"
- Numbered list of skills with XP badge (+50 XP each)
- "Begin session 1 of N" button → transitions to `'session'`

Screen 2 — Session (`'session'`):
- Cursor-following glow: `onMouseMove` → set CSS `transform: translate(x, y)` on glow div
  ```typescript
  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setGlowPos({ x: e.clientX - rect.left - 150, y: e.clientY - rect.top - 150 })
  }
  ```
- Teal edge particles: 22 `<div>` elements, CSS `@keyframes` fade in/out, spawned on mount
- Top bar: "SESSION N OF N" label + skill name + "X / Y XP earned today" badge + Exit button
- Session progress dots (one per skill, filled as completed)
- SVG ring timer: `r=84`, circumference=528, `strokeDashoffset` increases from 0 to 528 as time elapses
- Duration picker: 25 / 40 / 60 min
- Start / Pause button
- Bottom bar: "Up next: [skill]" + "Log in diary" button
- On session complete: call `completeForgeSession`, update XP balance, transition to between-session banner
- Between-session banner: "+50 XP · [Skill] forged ✓" → "Next session" or "Exit to dashboard"

Screen 3 — All done (`'complete'`):
- XP summary grid (one card per skill: skill name + "+50 XP" + level change if leveled up)
- "◆ Spend XP on CV" CTA → closes modal, opens CV card
- "Log in diary" CTA → closes modal, opens DiaryPanel

**Level-up moment:** when `leveled_up = true` from API response, show a brief overlay on the between-session banner: "[Skill] reached L[N]!" before continuing.

#### 3d. `frontend/app/(dashboard)/home/page.tsx` — Mission Control restructure

**New layout order (top to bottom):**
1. Target subtitle + "Mission control" `<h1>`
2. **Forge strip** (was at bottom — now immediately below heading):
   - Stats: streak · sessions · `◆ {xp_balance} XP` · score/100
   - Subtitle line: "Since last CV: +N score · N diary entries · N days"
   - Right side buttons (stacked): "Enter Forge ↗" (teal) + "Diary + cart" (ghost, below)
3. Company tabs (Airbnb | Accenture | 3M | ...)
4. Hero job card (company-specific, amber accent border)
5. 3-column grid: Skill gaps | Pipeline | CV unlock
6. Achievements pill row

**Company tab behaviour:** selecting a tab re-fetches or filters all data on the page for that company's focused job. All 5 sections update: gaps label, pipeline filter, CV%, hero card, forge label.

**Skill gaps card changes:**
- Each gap row gets two buttons: "▶ Forge" (opens ForgeModal) + "+ Cart" (adds to cartSkills state)
- Cart button shows filled/green state if skill already in cart

**CV unlock card changes:**
- "Rewrite CV line" (◆ 100 XP): calls `spendXP(100, 'rewrite_cv_line')` → on success shows toast "CV line rewriting..." → triggers CV rewrite endpoint
- "Download tailored CV" (◆ 50 XP): calls `spendXP(50, 'download_cv')` → on success triggers PDF download
- Both: deduct immediately, show toast "{action} unlocked · −N XP · Balance: ◆ N"
- If insufficient XP: toast "Not enough XP — forge a session to earn more"

**XP balance display:**
- Sidebar: XP balance fetched via `getXPBalance()` on mount, stored in Zustand (`useXPStore`)
- Forge strip: reads from same Zustand store
- Updates optimistically on earn/spend

**State management additions to Zustand:**
```typescript
// frontend/store/xpStore.ts (new)
interface XPStore {
  balance: number
  setBalance: (n: number) => void
  addBalance: (n: number) => void
  subtractBalance: (n: number) => void
}

// frontend/store/cartStore.ts (new)
interface CartStore {
  skills: CartSkill[]
  addSkill: (skill: CartSkill) => void
  removeSkill: (skillName: string) => void
  clearCart: () => void
}
```

**Toast component:** use existing shadcn `toast` / `useToast` — do not add a new library.

---

### BUILD ORDER (strict — do not skip steps)

```
Step 1 — Schema (Supabase SQL editor)
  → verify all 4 columns/tables exist before continuing

Step 2 — Backend services
  → xp_service.py
  → forge_service.py
  → xp.py router (register in main.py)

Step 3 — Backend integrations
  → cv/upload.py welcome XP hook
  → diary.py cart_skills extension + XP earn

Step 4 — Backend tests
  → test_xp_service.py
  → test_forge_service.py
  → pytest backend/tests — must be green

Step 5 — Frontend types + API
  → frontend/types/xp.ts
  → frontend/lib/api.ts additions

Step 6 — Frontend stores
  → frontend/store/xpStore.ts
  → frontend/store/cartStore.ts

Step 7 — DiaryPanel component
  → frontend/components/diary/DiaryPanel.tsx

Step 8 — ForgeModal component
  → frontend/components/forge/ForgeModal.tsx

Step 9 — Mission Control page restructure
  → frontend/app/(dashboard)/home/page.tsx

Step 10 — Verify
  → tsc --noEmit (zero errors)
  → next lint (zero warnings)
  → manual smoke test: add 2 skills to cart → enter forge → complete session → check XP balance updated → spend XP on CV download → check balance deducted → submit diary entry with cart → check +30 XP

Step 11 — Commit + push to Develop
  → feat: XP economy + forge multi-session + mission control redesign
```

---

## LAST SESSION SUMMARY (2026-05-09 — COWORK BUG AUDIT)

```
Date: 2026-05-09
Session type: Automated Cowork audit (scheduled task, no human present)
What landed:

  Bug audit of reference/ folder (13 screenshots, Apr 28 – May 9):
  - Identified 4 P0 bugs (data integrity), 4 P1 bugs (broken interactions),
    9 P2 design/UX issues
  - Full plan written to CLAUDE.md § BUG SPRINT + UX UPLIFT — QUEUED
  - No code changed this session — next Claude Code session should
    execute the plan top to bottom

  Key findings:

  P0-A: XP balance shows ◆60 for a user with 9 sessions (expected ≥1050).
    Two root causes: (1) grant_welcome_xp() never called in cv/upload.py
    (Phase 2d was specced but not wired), (2) xp.balance() silently fails
    → frontend falls back to computeTotalXP(diary entries) instead of wallet.

  P0-B: Score drifts on CV re-upload. Same PDF → different Myro Score.
    LLM temperature causes ±5–15 point variance. Fix: SHA-256 content hash
    short-circuit in cv_workflow.py.

  P0-C: Diary cart_skills silently dropped. Backend supports it (diary.py:41)
    but frontend api.ts createEntry() never passes cart_skills in body,
    and handleDiarySubmit() uses `void cart`. Data loss on every diary submit.

  P1-A: Pipeline "Log update →" navigates to home?jobId= but doesn't open
    diary panel. useEffect on urlJobId → setDiaryOpen(true) missing.

  P1-B: Forge fallback creates fake diary entries ("Forge session complete…")
    when backend is unavailable. Backend IS deployed — fallback should be removed.

  P1-C: Sidebar "CAREER INTELLIGENCI" text clipped (no overflow: hidden).

  P1-D: Intel page shows "RUNNING THE AGENT" loading indefinitely for users
    with no target roles (analyticsForMe returns null → isLoading stays true).

  P2 highlights:
  - Two diary cart systems: old URL-based (Tracker) vs new Zustand (Mission Control)
  - Company tabs tracked by array index, not job_id — fragile on refetch
  - Core 7-step user journey loop (Find job → Forge → Log → CV) never surfaced in UI
  - Target roles header overflows with long role strings
  - Gap skills card shows 3 items, lots of wasted whitespace (expand to 5)
  - Empty states use developer language ("No matches yet — Upload your CV then click Refresh")
  - Achievements pill row has no label

Pending from prior session still open:
  - CV upload latency decision (Option A vs B)
```

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
