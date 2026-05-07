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

## 🗺️ MISSION CONTROL REDESIGN PLAN (2026-05-07)

> **Origin:** Design critique session. Full diagnosis in session transcript.
> **Rule:** Claude Code must state the phase plan + get explicit "yes / proceed / go ahead" before writing any code for that phase.
> **Branch:** All work on `Develop`. Commit after each numbered task.

---

### PHASE 0 — Data integrity bugs (MUST LAND FIRST — blocks trust)

**Sync point:** Before starting, Claude Code reads this section aloud and confirms file locations for the scoring pipeline and match logic. User approves.

These are not design issues. They are broken numbers that will make every other improvement invisible.

#### P0-1 — Fix match % calculation (showing 10000% instead of 0–100%)

**Symptom:** Active Focus tabs show "Chanel · 10000%", "Sanofi · 6670%", etc. Job card shows "10000% fit" badge. CV card shows "10000%" as hero number. The number is being multiplied by 100 somewhere, or the denominator is wrong.

**Investigation steps:**
1. Find where match % is computed — likely `backend/app/services/scoring/` or `jobs_workflow.py → compute_job_matches`
2. Check if overlap is being divided by `len(user_skills)` instead of `len(required_skills)` — that would give > 100 when user has more skills than the job requires
3. Check if the value is being multiplied by 100 twice (once in the formula, once at the display layer)
4. Add a hard `min(score, 100)` cap at the point of persistence AND at the frontend display layer as a safety net

**Files to touch:** `backend/app/services/scoring/formulas.py` · wherever `match_score` or `skill_overlap` is computed in `jobs_workflow.py` · `frontend/app/home/` or wherever the Active Focus % is rendered

**Tests:** Add a test asserting `compute_match_score(user_skills=100, required_skills=5, overlap=5) == 100` (not 2000%)

**Commit:** `fix(scoring): clamp match percentage to 0–100`

---

#### P0-2 — Fix location filtering (India target, French jobs surfaced)

**Symptom:** User's target location = India (visible in header). Top recommended job is Chanel Neuilly-Sur-Seine, France. Location filter is not being applied in the match pipeline.

**Investigation steps:**
1. In `compute_job_matches` or `get_candidate_job_ids_for_skills`, check if a location filter is applied at the DB query level
2. Check if the Chanel job has `location_city = NULL` or `country = NULL` — if so it bypasses the filter silently
3. Check if the user's target location is being read from `user_profiles.target_location` and passed into the match call
4. Decision to lock with user: **strict filter** (only show jobs in target location) vs **soft filter** (show all, but rank in-location jobs higher with a location bonus). Default to strict unless user says otherwise.

**Files to touch:** `backend/app/repositories/jobs.py` · `backend/app/services/jobs_workflow.py` · `backend/app/routers/jobs/match.py`

**Tests:** Add test asserting that `compute_job_matches(target_location="India")` does not return jobs with `location_country != "India"` (or NULL location jobs, depending on decision)

**Commit:** `fix(matching): apply user target location filter in compute_job_matches`

---

**Phase 0 done when:** `pytest backend/tests` green · match % shows 0–100 for all companies · featured job is in India · commit pushed to Develop.

---

### PHASE 1 — Remove skill intelligence widget, add Skill Gaps card

**Sync point:** Claude Code states exactly what it will delete and what it will build. User approves before any file is touched.

**What to remove:**
- The "Skill Intelligence" card in the bottom-left of the home dashboard
- The small hierarchy tree SVG/canvas component rendered inside it
- The "Open skills →" button inside that card
- The card's grid slot (do not leave empty space — the grid should reflow)

**What to build in its place — "Top Skill Gaps" card:**

```
┌─────────────────────────────────────────────┐
│ TOP GAPS — CHANEL                           │
│                                             │
│ 🔴 Fragrance Product Development   L2→L4   │
│    [▶ Forge this gap]                       │
│                                             │
│ 🟡 B2B Sales Strategy              L3→L4   │
│    [▶ Forge this gap]                       │
│                                             │
│ 🟡 Compensation & Benefits         L1→L3   │
│    [▶ Forge this gap]                       │
│                                             │
│              [View all skill gaps →]        │
└─────────────────────────────────────────────┘
```

- Pull top 3 skill gaps for the currently focused company from `GET /jobs/{job_id}/skill_gaps` or derive from existing match data
- Each gap shows: skill name · current level → required level · "Forge this gap" button (routes to Forge with that skill pre-selected)
- "View all skill gaps →" routes to `/skills`
- If no focused job is set: show placeholder "Save a target job to see your skill gaps"

**Files to touch:** `frontend/app/home/` page component · wherever the grid layout is defined · possibly `frontend/lib/api.ts` if a new endpoint is needed

**Commit:** `feat(home): replace skill intelligence widget with top-skill-gaps card`

---

**Phase 1 done when:** Skill intelligence widget is gone from home · Skill Gaps card renders top 3 gaps for focused job · each gap links to Forge · tsc + next lint clean · commit pushed.

---

### PHASE 2 — Pipeline card redesign

**Sync point:** Claude Code proposes the exact data shape it will fetch and the component structure. User approves.

**Current state:** Three rows of `[Company name] [pending]`. No role title, no age, no action.

**Target state — each pipeline row:**

```
┌──────────────────────────────────────────────────────┐
│ [Logo] Chanel                          [Saved] ·  3d │
│        STAGE - Communication Parfums               │
│                                    [Log update →]    │
├──────────────────────────────────────────────────────┤
│ [Logo] Sanofi                          [Applied] · 1d│
│        Senior Sales Manager                         │
│                                    [Log update →]    │
└──────────────────────────────────────────────────────┘
```

**Data requirements:**
- Role title (not just company) — from `job_applications JOIN jobs`
- Status display label mapping: `pending` → "Saved", `applied` → "Applied", `interviewing` → "Interviewing", `offer` → "Offer", `closed` → "Closed"
- Days since last activity (`updated_at` age)
- Inline "Log update →" button routes to `/diary` with that job pre-selected

**Files to touch:** `frontend/app/home/` pipeline card component · `frontend/lib/api.ts` (check if `/track` endpoint returns role title — add it if not) · `backend/app/routers/jobs/apply.py` if response shape needs the job title added

**Commit:** `feat(home): redesign pipeline card with role title, status labels, activity age`

---

**Phase 2 done when:** Pipeline rows show company + role title + meaningful status + days since activity + log update CTA · tsc + next lint clean · commit pushed.

---

### PHASE 3 — UX consistency: Forge entry points + visual hierarchy

**Sync point:** Claude Code explains the exact intent difference between the two Forge CTAs and how it will label them. User approves.

#### P3-1 — Clarify the two Forge entry points

**Current state:** "→ Enter Forge" (Today card) and "▶ Forge next gap" (job card). Same destination, different framing, no explanation of difference.

**Decision needed from user before implementation:** 
- Option A: "Enter Forge" = open-ended daily log. "Forge next gap" = Forge pre-loaded with the top gap skill for the focused job. Keep both, label clearly.
- Option B: Merge into one CTA. "Forge: [Skill name] →" in the job card. Remove "Enter Forge" from Today card and put a generic "Open Forge →" link in the nav instead.

**Lock the decision, then implement.**

**Commit:** `fix(home): clarify forge entry points — [option label]`

---

#### P3-2 — Visual hierarchy: focused job card as hero

**Current state:** All 6 cards are the same visual weight. The Myro Score card and the date widget take up equal space to the focused job card.

**Changes:**
- Focused job card: increase card prominence (slightly larger, stronger border, or elevated shadow)
- Today card (right column): shrink the date display — it does not need to be `text-5xl`. Replace with a compact date + time + one-line "Next action" summary
- Active Focus tab bar: remove the % from the tab labels entirely (the % is broken and even when fixed, it belongs inside the card, not in the tab). Tab = company name only.

**Files to touch:** `frontend/app/home/` layout and card components

**Commit:** `refactor(home): elevate focused-job card, compact today card, clean active-focus tabs`

---

**Phase 3 done when:** Forge CTAs have clear, distinct labels · focused job card is visually dominant · Active Focus tabs show company name only · tsc + next lint clean · commit pushed.

---

### VERIFICATION (after all phases)

- `pytest backend/tests` — must be green (no regression)
- `tsc --noEmit && next lint` — must be clean
- Manual smoke on Develop: log in → home shows valid % → focused job is in India → Skill Gaps card shows 3 gaps → Pipeline rows have role titles → Forge CTAs are unambiguous

---

## OPEN WORK (as of 2026-05-05)

### ✅ ARCH SPRINT — job_skills read path — COMPLETE (2026-05-05)

All A1–A6 done. 209 tests passing. Safe to run Phase 3 upload now.

---

### 🔥 ACTIVE — NEW-USER FLOW BUG SPRINT (started 2026-05-05 PM)

User reported broken new-user journey. Three independent root causes identified, plan locked with user, work in progress. Resume from current state.

#### Bug 1 — Profile-not-found chain (orphan user 404s) — **IN PROGRESS**

**Symptoms:** "Profile not found" red banner in Settings modal · `GET /users/me 404` · `GET /scores/me 404` · `PUT /users/me/profile 404` (PUT 404s because UPDATE affects 0 rows for orphan users).

**Root cause:** `_upsert_user_profile` in `backend/app/routers/auth.py` only runs on `/auth/login` and `/auth/signup`. Any other entry path (magic link, OAuth, Supabase row deletion, dev shortcut) leaves the user with a valid JWT but no `user_profiles` row. `UsersRepository.update_profile` was a plain UPDATE, so PUT couldn't self-heal.

**Fix decision (user-locked):** Auto-create `user_profiles` row from JWT claims (`email`, `user_metadata.full_name`) on first authenticated request.

**Done:**
- `backend/app/repositories/users.py` — `update_profile` now UPSERTs on `id`. Added `ensure_profile_exists(user_id, email, full_name)` using INSERT … ON CONFLICT DO NOTHING (admin client).
- `backend/app/deps.py` — `get_current_user` now extracts `email` + `full_name` from JWT and calls `_ensure_profile_provisioned()`. Per-process `_provisioned_users: set[str]` cache avoids redundant Supabase round-trips. Provisioning failures log-and-continue (never block auth).
- `backend/tests/test_users_repository.py` — added `test_update_profile_upserts_current_user_row`, `test_ensure_profile_exists_no_op_without_email`, `test_ensure_profile_exists_upserts_with_ignore_duplicates`. Updated `_q` helper to mock `upsert`.
- `backend/tests/test_users_api.py` — added `test_update_profile_creates_row_for_orphan_user`.

**Pending in Bug 1:**
- Run `pytest backend/tests` and confirm orphan-user tests pass + previous 209 still green.
- Commit `fix(users): auto-provision user_profiles on first authenticated request`.

#### Bug 2 — Postgrest 400 "JSON could not be generated" — **PENDING**

**Symptoms:** stack trace in Railway deploy logs (14:12:58, 14:13:02) showing `postgrest.exceptions.APIError: 'JSON could not be generated', code 400, 'b\\'Bad Request\\''` originating at `query.range(start, start + page_size - 1).execute()` in `backend/app/repositories/job_skills_read_model.py:29`. Triggered by CV upload's downstream `compute_job_matches`. CV "Computing your score" hangs because matcher errors out before score persistence runs.

**Root cause:** A2/A4 changes (today's ARCH SPRINT) pass `list(user_skill_map.keys())` → `candidate_job_ids` (potentially thousands of UUIDs) directly into `.in_("job_id", candidate_job_ids)`. PostgREST serializes `.in_()` into the URL query string. ~36 chars/UUID × thousands blows past the ~8 KB URL limit. PostgREST replies 400.

**Fix decision (user-locked):** Server-side Postgres function `fetch_job_skills_by_job_ids(job_ids uuid[])` invoked via Supabase RPC — single round-trip, body-encoded array, no URL-length issue.

**Plan:**
1. SQL migration via Supabase MCP:
   ```sql
   CREATE OR REPLACE FUNCTION fetch_job_skills_by_job_ids(job_ids uuid[])
   RETURNS TABLE (job_id uuid, is_primary boolean, taxonomy_key text)
   LANGUAGE sql STABLE AS $$
     SELECT js.job_id, js.is_primary, s.taxonomy_key
     FROM job_skills js JOIN skills s ON s.id = js.skill_id
     WHERE js.job_id = ANY(job_ids);
   $$;
   GRANT EXECUTE ON FUNCTION fetch_job_skills_by_job_ids(uuid[]) TO authenticated, service_role;
   ```
2. `backend/app/repositories/job_skills_read_model.py` — new `fetch_job_skill_rows_via_rpc(db, job_ids)` calling `db.rpc("fetch_job_skills_by_job_ids", {"job_ids": job_ids}).execute()`. Adapter translates RPC row shape `{job_id, is_primary, taxonomy_key}` back to `{job_id, is_primary, skills: {taxonomy_key}}` so existing `group_job_skill_rows` keeps working.
3. `fetch_job_skill_rows()` — when `job_ids` is provided, route through RPC. Keep `.in_()` chunking (200 IDs/chunk) as fallback for unexpected RPC failure.
4. Tests: empty list returns `[]`, normal small list works, 5,000-id list executes without 400.

**Files to touch:** repositories/job_skills_read_model.py · repositories/jobs.py (`get_jobs_by_ids` may have same issue — extend RPC pattern if so) · tests/test_job_skills_read_model.py.

#### Bug 3 — Settings modal UX (jarring save model) — **HOLD (design prompt to be drafted)**

**Symptoms:** Inconsistent save behavior across fields (auto-save-on-blur for Ninja Name / Target Location / LinkedIn vs. explicit "Save roles" button for Target Roles). "Profile not found" red banner shown while form is interactive. X close button can scroll out of view inside `maxHeight: 82vh` modal. User couldn't predict where to click to commit.

**Fix decision (user-locked):** **(b) Proper redo** — single unified form, field-level validation, autosave indicator, clean empty-onboarding state ("Welcome — let's set up your profile in 30 seconds"), sticky header X. **No code yet.** Claude writes the design prompt; user iterates with Claude design agent; final spec comes back to Claude Code for implementation.

**Pending in Bug 3:** Claude writes the design prompt as a deliverable in `/Users/incognito/True_Yodha/docs/SETTINGS_MODAL_REDESIGN_PROMPT.md`. User will hand it to design agent.

#### Verification (deferred until Bugs 1+2 land)

- `pytest backend/tests` (target: ≥212 passing — 209 baseline + 3 new orphan-user tests; +RPC tests once Bug 2 lands).
- `tsc --noEmit && next lint` (no frontend changes yet).
- Manual smoke: log in as fresh user → /users/me 200 → set Ninja Name → upload CV → score lands → /scores/me 200.

#### Decisions locked this sprint (do not reopen)
| # | Decision |
|---|---|
| NU1 | Profile auto-provisioned from JWT email + user_metadata.full_name on first authenticated request. Admin client (bypass RLS). Cached per-process. Failure logs-and-continues. |
| NU2 | `update_profile` UPSERTs (defensive, even though ensure_profile_exists guarantees row presence). |
| NU3 | Bug 2 fix uses Supabase RPC, not request chunking. Chunking kept only as fallback. |
| NU4 | Bug 3 = full redesign, not minimal patch. Design happens in a separate loop (Claude design agent → user → Claude Code). |

---

### 🔲 OPEN DECISION — CV upload perceived latency (~29s)

**Context:** `POST /cv/upload` takes ~29s end-to-end. The bottleneck is `cv_parser.parse_cv()` — an LLM call via the OpenRouter → Groq → Gemini fallback chain. Observed in production: moonshotai/kimi-k2.6 returned an unparseable response, triggering a provider retry, which added several seconds on top of base latency.

**The redundant 85s `scores.compute` call after upload has already been removed (2026-05-06).** The 29s is now the irreducible minimum with the current synchronous architecture.

**Two paths forward — decision deferred to next session:**

| Option | What it means | Tradeoffs |
|---|---|---|
| **A — Better loading UX** | Keep sync upload. Replace the fixed-timer `CVUploadProcessing` animation with step-aware progress tied to real backend stages. Make the wait feel purposeful ("Extracting your skills…", "Mapping to taxonomy…", "Computing your score…"). | Zero backend change. 29s stays 29s. Users may still abandon if they don't trust the wait. |
| **B — Reduce actual latency** | Options: (1) faster/cheaper LLM model for extraction (Gemini Flash or a quantized local model), (2) async upload — return 202 immediately with a `task_id`, frontend polls `/cv/status/{task_id}` every 2s, (3) parallel provider race instead of sequential fallback. | B1 risks quality loss. B2 adds infra complexity (task store, polling endpoint). B3 is low-effort and directly addresses the retry penalty seen in logs. |

**Do not implement either option without an explicit decision in the next session. Resume from here.**

---

### Existing backlog (priority order after arch sprint)

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

## LAST SESSION SUMMARY (2026-05-06 PM — NEWSLETTER ISSUE 002 DRAFTED)

```
Date: 2026-05-06 (PM)
What landed:

  Issue 002 — "Hiring Map May 2026: 5 Surprises in 9,446 Jobs"
  Re-cut Apr 11–19 dataset for stories Issue 001 didn't tell. Authored under Myro
  brand voice (not Shivam personal) per low-engagement decision on Issue 001
  (10 likes / 22 Substack views / 0 signups).

  Data source decision: re-used the 9,446-job dashboards on disk. The fresh ~28K
  scrape lives in CSVs but Phase 3 upload not yet run, so dashboards still
  reflect the April window. Issue 003 will widen once Phase 3 ships.

  Files written:
    1. /frontend/content/newsletter/issues/2026-05-hiring-map-5-surprises.mdx
       ~2,500-word long-form site issue. 5 dashboard ChartEmbeds. SEO frontmatter,
       methodology block, A/B subject lines, 10-slide LinkedIn carousel outline,
       6-tweet X thread, pre-publish checklist. authorName="Myro" not Shivam.

    2. /Users/incognito/Myro Newsletter/Issue 002/substack/ — 5 mini-issues:
       01-pune-second-biggest-tech-city.md      (Pune > Hyderabad)
       02-pharma-stealth-hire.md                 (Sanofi+Novartis = 1,000)
       03-soft-skills-lie.md                      (229 mentions, 3 primary)
       04-accenture-thousand-jobs.md              (1,000 in a single day)
       05-saturday-effect.md                      (85% from one batch)
       Each ~700-900 words, links back to himyro.com hub.

    3. /Users/incognito/Myro Newsletter/Issue 002/linkedin/posts.md
       5 posts × ~1,200 chars, formatted for the @Myro company page (NOT personal).
       Link strategy: post body has the story, link goes in first comment to
       avoid LinkedIn's external-URL penalty. Includes posting-manager notes.

    4. /Users/incognito/Myro Newsletter/Issue 002/twitter/posts.md
       SUPERSEDED: user said mid-task to ignore X posts. File written before the
       cancel arrived. Left in place as optional artifact.

  Anti-slop verification (per skills/myro-newsletter/references/voice-and-anti-slop.md):
    - Zero "isn't…it's" patterns
    - Zero "The translation/takeaway/upshot" / "Notice what's missing"
    - Body em-dashes: 1 (well under the 3-cap)
    - "actually" reduced from 4 to 1 (in compound adjective "actually-primary")
    - Hook leads with a number, no throat-clearing

  TASKS.md created at project root with:
    - India-only job count tracking (per user request — for Issue 003 + future
      Monday Heatmaps; KPI card in dashboard5_location_scraper.html)
    - Build Myro brand social accounts (LinkedIn Page, X handle, Substack pub)
    - Issue 002 distribution scheduling
    - Existing CLAUDE.md backlog items mirrored

Distribution publishing plan locked in the deliverables:
  Day 0 (Monday) : Long-form MDX live on himyro.com/newsletter/2026-05-...
                  Email send 7:00 AM IST (subscribers)
  Day 1 (Tue)   : Substack 1 (Pune) + LinkedIn post 1 + 5 X tweets
  Day 2 (Wed)   : Substack 2 (Pharma) + LinkedIn 2 + 5 X tweets
  Day 3 (Thu)   : Substack 3 (Soft skills) + LinkedIn 3 + 5 X tweets
  Day 4 (Fri)   : Substack 4 (Accenture) + LinkedIn 4 + 5 X tweets
  Day 5 (Sat)   : Substack 5 (Saturday) + LinkedIn 5 + 5 X tweets
  Day 7 (next Mon): LinkedIn carousel (10 slides) on Myro page

Pending / next session:
  - Owner needs to add featured images (issue-002-hero.png + 5 mini hero images)
  - Wire internal links to Issue 001 in the MDX (left as pre-publish checklist item)
  - Set up Myro brand accounts on LinkedIn / X / Substack publication if not done
  - Schedule the email + social distribution
  - Decide async-vs-sync on the open CV upload latency question (Option A vs B)
  - Run the still-pending Supabase RPC migration for Bug 2 fallback
```

---

## LAST SESSION SUMMARY (2026-05-06 — NEW-USER FLOW FIXES + CV PIPELINE PERF)

```
Date: 2026-05-06
What landed:

  Bug 1 — null email 500 on PUT /users/me/profile:
    - update_profile upsert was missing email in the INSERT path
    - Router now passes email=current_user["email"] into repo upsert
    - Fake repos in test_users_api.py updated to accept email= kwarg
    - 217 tests passing

  Settings modal — explicit Save button:
    - saveNow() fn flushes debounce immediately and fires mutation
    - "Save" button at bottom of scrollable body; shows "Saving…" / "✓ Saved"
    - Autosave (800ms debounce) still runs alongside

  CV pipeline perf (improve-codebase-architecture sprint):
    - Removed redundant scores.compute call from cv/page.tsx handleUpload
      and onboarding/page.tsx — score already persisted inside cv_workflow
    - Changed invalidateQueries → refetchQueries for cvProfile after upload
      so CV text viewer shows new CV before the 2s modal-close timer fires
    - jobs/compute 404 → graceful 200 {matches_written:0, needs_onboarding:true}
      when no job matches found (empty result ≠ not found)
    - TTL cache (1h) on fetch_skill_demand in scoring/persistence.py —
      eliminates full jobs table scan on every per-user recompute after warmup
    - 217 tests passing, tsc + next lint clean

  Open decision recorded in CLAUDE.md:
    - CV upload still takes ~29s (LLM bottleneck in cv_parser.parse_cv)
    - Decision pending next session: Option A (better loading UX) vs
      Option B (reduce actual latency — model swap, async upload, or parallel
      provider race). Do not implement without explicit decision.

  Still pending:
    - Supabase SQL migration database/migrations/20260505_fetch_job_skills_rpc.sql
      not yet run — Bug 2 RPC fix falls back to chunked .in_() until this runs
    - docs/SETTINGS_MODAL_REDESIGN_PROMPT.md and TASKS.md untracked (not committed)
```

---

## LAST SESSION SUMMARY (2026-05-05 — ARCH SPRINT A1–A6)

```
Date: 2026-05-05
What landed:

  ARCH SPRINT — job_skills read path (all 6 tasks complete):

  A1 — DB indexes (run via Supabase MCP, not in code):
    idx_jobs_company_name, idx_jobs_role_domain,
    idx_job_skills_job_primary, idx_skills_taxonomy_key

  A2 — DB-side skill filter in fetch_job_skill_rows:
    - job_skills_read_model.py: added job_ids: list[str] | None param
    - Injects .in_("job_id", job_ids) DB-side; early-returns [] on empty list
    - jobs.py fetch_analytics_rows: passes list(job_ids), removed Python filter
    - jobs.py search_jobs_by_filters: passes list(candidate_ids), removed Python filter

  A3 — Analytics cache:
    - jobs.py: module-level _analytics_cache dict keyed on role_domain
    - compile_market_analytics: TTL=3600s, skips DB on cache hit
    - 3 tests: hit within TTL, miss after TTL, separate keys per role_domain

  A4 — Scope compute_job_matches skill fetch:
    - jobs.py: new get_candidate_job_ids_for_skills(skill_keys)
      2-step: skills table → skill_ids, job_skills WHERE skill_id IN → job_ids
    - get_all_job_skill_rows: added optional job_ids param
    - jobs_workflow.py compute_job_matches: pre-filters to matching jobs before fetch

  A5 — Deduplicate _group_job_skills:
    - Moved to job_skills_read_model.py as group_job_skill_rows(rows) (public)
    - Deleted from jobs.py
    - scores.py: import fixed, both call sites updated

  A6 — Tests: pagination + combined filter:
    - test_jobs_list_router.py: added _SearchFakeDB + _FakeQuery for real repo testing
    - pagination offset correctness (page 2 of 60 → correct slice)
    - company + role_domain + skill combined filter
    - skill='' skips skill filter

Verification:
  pytest backend/tests → 209 passed, 0 failed
  (tsc + next lint not run — no frontend changes this session)
```

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

---

## LAST SESSION SUMMARY (2026-05-03 — PLANNING: REPORT INACTIVE + SCRAPER PHASE 3)

```
Date: 2026-05-03 (planning session — no code landed in True_Yodha this session)
Context: work happened in sister repo firecrawl_Supabase (scraper pipeline)

  SCRAPER STATUS:
    - Phase 2 (LM Studio enrichment) complete: 28,815 jobs enriched (99.9%)
    - Output path: /Users/incognito/Mirror CV/firecrawl_Supabase/All_CSV_Outputs_thru_firecrawl
    - Phase 3 (Supabase upload) NOT YET RUN — pending SQL migrations in firecrawl_Supabase
    - Supabase currently has 9,446 rows; will grow to ~28k after Phase 3 runs

  WHAT NEEDS TO HAPPEN IN firecrawl_Supabase FIRST (before working in True_Yodha):
    Task 1 — SQL migrations (run via Supabase MCP):
      - ALTER TABLE jobs ADD COLUMN role_domain TEXT, industry_group TEXT, location_city TEXT
      - CREATE TABLE job_reports (see docs/REPORT_INACTIVE_FEATURE.md for full DDL)
      - Add jobs.report_count INT DEFAULT 0
      - Deactivation trigger: report_count >= 5 → is_active = false
    Task 2 — csv_importer.py changes:
      - Add role_domain to _JOB_FIELDS (bug fix — field extracted but never uploaded)
      - Add industry_group derivation (_INDUSTRY_GROUP mapping dict, 10 super-categories)
      - Add location_city extraction (_extract_city fn)
      - Add apply_url quality gate (null out image/.png URLs)
      - Lifecycle: INSERT sets first_seen + last_seen + is_active=true; UPDATE sets last_seen only
    Task 3 — schema.py: add role_domain, industry_group, location_city to CANONICAL_FIELDS
    Task 4 — run upload: python csv_importer.py --dry-run → then full run

  FEATURE TO BUILD IN True_Yodha (start here after scraper tasks done):
    "Report as Inactive" — community freshness loop
    Full spec: docs/REPORT_INACTIVE_FEATURE.md

    Backend tasks (True_Yodha):
      1. New router: backend/app/routers/jobs/report.py
         POST /jobs/{job_id}/report (auth required)
         Guards: 1 report/user/job (409), max 3/day (429)
         On success: insert job_reports, award +10 XP to daily_logs.skills_delta
         Returns: {report_count, already_reported, xp_earned}
      2. Register router in backend/app/main.py
      3. Tests: backend/tests/test_job_report.py

    Frontend tasks (True_Yodha):
      1. Add jobs.reportInactive(token, jobId) to frontend/lib/api.ts
      2. JobCard in frontend/app/jobs/page.tsx:
         - "Report as Inactive" ghost button beside Track button
         - Show "N users reported inactive" label if report_count > 0
         - Post-report state: "✓ Reported" disabled + optimistic count increment
      3. Diary page (frontend/app/diary/page.tsx):
         - community_reporter entries display as "🛡 Community Contribution +10 XP"

  DECISIONS LOCKED (do not reopen):
    - Single button, no reason dropdown — just "Report as Inactive"
    - Threshold: 5 reports → is_active = false (hidden from default view)
    - Auth required to report
    - 1 report per user per job (UNIQUE constraint enforced in DB)
    - Max 3 reports per day per user (backend guard)
    - XP: +10 per report via daily_logs.skills_delta {taxonomy_key: "community_reporter", xp_added: 10}
    - Scraper NEVER sets is_active = false — community owns that field

Verification needed next session:
  - Confirm firecrawl_Supabase tasks 1-4 complete before starting True_Yodha work
  - Check job_reports table exists in Supabase before writing backend router
```
