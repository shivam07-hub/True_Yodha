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

**Tech stack:** FastAPI (backend) · Railway (backend hosting) ~ Next.js 14 (frontend) , Tailwind CSS, Shadcn/ui · Supabase/PostgreSQL (DB) ·  · Vercel (frontend hosting) · OpenRouter API (LLM ranking) · Chrome Manifest V3 (browser extension at `/Chrome_extension/` — captures jobs from any URL into the user's Application list)

**Reference docs:**
- Full tech stack + architecture: `docs/TECH_STACK.md`
- Scoring algorithm: `docs/SCORING_ALGORITHM.md`
- Deployment guide (Git → GitHub → Vercel): `docs/DEPLOYMENT_GUIDE.md`
- Domain glossary (canonical terms): `UBIQUITOUS_LANGUAGE.md` — read before any new feature or refactor
- Skill Timer UX reference: `WhatsApp Image 2026-04-26 at 20.14.07.jpeg` — per-skill progress card aesthetic to replicate in Application Path, Diary, and Progress dashboard
- Chrome extension code: `/Chrome_extension/` (Manifest V3, captures `JobPosting` JSON-LD → backend)

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

## WORKING WITH CODEX (ChatGPT) — TWO-AGENT WORKFLOW

We have two coding agents on this codebase: **Claude Code** (this session) and **Codex / ChatGPT**. Treat Codex as a peer engineer on the same team.

**Division of labour by strength**

| Task type | Best fit | Why |
|---|---|---|
| Multi-file orchestration, cross-cutting refactors | Claude Code | Has `graphify-out/graph.json` context, subagents, persistent memory of architecture. |
| Investigating uncertain code paths ("what does X do?", "where is Y called?") | Claude Code | Subagent + grep + graph queries. |
| Mechanical splits / renames once interfaces are agreed | Codex | Faster on pure code transformation. |
| Test scaffolding once new module boundaries are defined | Codex | Boilerplate-heavy, low-context. |
| Coordinated commits, PR descriptions, smoke checks | Claude Code | Lives inside the git workflow. |
| Single-file Python tweaks with clear instructions | Either | Pick whoever is free. |

**Handoff contract — Claude → Codex**
When Claude writes a refactor plan for Codex it specifies:
- target file(s) and exact line ranges (`file_path:line_number`)
- new module names and public function signatures
- which tests must pass after the move
- any imports that need rewriting

**Handoff contract — Codex → Claude**
When Codex finishes a chunk: commit on `Develop`, push, and update the **LAST SESSION SUMMARY** block in this file with what landed. Claude picks up from that summary on the next session.

**Branch hygiene shared by both agents**
- All work on `Develop`. Never push to `main` without explicit user approval.
- One conventional-commits scope per commit.
- Run `pytest backend/tests` + `tsc --noEmit` + `next lint` before marking a task complete.

**Architecture audit artefact (refer to often)**
- `graphify-out/GRAPH_REPORT.md` — knowledge-graph audit report (832 nodes, 1247 edges, 94 communities, generated 2026-04-26).
- `graphify-out/graph.html` — interactive graph viewer.
- Both agents should consult these before kicking off a refactor phase.

**Reference workspace**
- Local reference codebases, screenshots, and image exports live under `reference/`.
- `reference/` is intentionally `.gitignored`; production code must not import from it.
- Current reference codebase: `reference/codebases/black-futurist-frontend/` (moved from `frontend/Black_futuristist_frontend/`).

---

## NEXT SESSION FOCUS (MODULARITY REFACTOR PHASE 2)

**Phase 1 shipped `fedb32e` (scoring engine split). Phase 1b shipped `0ccb804` (job_path split), then Codex recovered the missing `llm_polish.py` cleanup after an accidental reset. Phase 2 is in progress and should be committed before starting new work.**

**Phase 2 — Repository layer.**
Repository Modules now exist for `scores`, `skills`, `users`, and `diary`. The corresponding routers no longer create Supabase clients or call `.table(...)` directly. The current admin vs token-scoped Supabase behavior was preserved through Repository adapters; Open Question #3 remains a policy/security decision before changing those adapters, but it no longer blocks behavior-preserving structural work.

**Next exact Codex pickup after the recovery commit: Phase 2B — CV Repository seam.**
Create `backend/app/repositories/cv.py` and move `routers/cv.py` Supabase calls behind it. Keep behavior unchanged. The CV slice should cover:
- Baseline CV profile read (`user_profiles.cv_raw_text`, `cv_parsed_at`)
- CV History reads/writes and next version number
- Upload/text-submit profile update + `cv_history` insert
- Evidence summary reads from `user_milestones`, `daily_logs`, `user_skills`, `mirror_scores`
- Generated-draft/save-draft insert and user skill count
- Rate-limit adapter access to `cv_history.uploaded_at`

After CV is green, pick up **Phase 2C — Jobs Repository seam**. That is the largest remaining slice and should not be mixed with CV in the same patch.

**Claude pickup:** review the completed Repository interfaces for policy intent, especially which routes should use service-role vs token-scoped adapters. Do not rewrite the seams unless changing that policy deliberately.

---

## REFACTOR ROADMAP (drafted 2026-04-26 from /graphify audit)

Eight modularity issues tackled across seven phases. Each phase = one session, one commit, smoke-tested before any merge to `main`.

**Phase 1 — Scoring engine split.** ✅ DONE
  Owner: Claude Code (orchestration) + Codex (mechanical move).
  Split `services/scoring_engine.py` (455L) → `services/scoring/{formulas,gap,persistence}.py`.
  *Codex pickup:* given final interface, do the file moves + import rewrites + run tests.

**Phase 1b — `job_path.py` triage** ✅ DONE
  Split `services/job_path.py` (961L, 3.2× the 300-line limit) into `services/job_path/{plan,milestones,cv_generator,quality_gate}.py`. Defer until we confirm with user that the per-job-CV-tailoring feature is still in scope.
  Codex follow-up completed the missing `services/job_path/llm_polish.py` split so every file in `services/job_path/` is now under the 300-line cap.

**Phase 2 — Repository layer.** 🔄 IN PROGRESS
  Owner: Codex for behavior-preserving seams; Claude Code for policy review.
  Create `backend/app/repositories/{jobs,cv,scores,diary,users,skills}.py`. Move every direct Supabase call out of routers/services into repos. Inject via FastAPI `Depends`.
  Removes the #1 god node `get_supabase_admin()` (degree 33) and decouples tests from Supabase row shape.
  Completed so far: `scores`, `skills`, `users`, `diary`.
  Remaining next: `cv`, then `jobs`. Small follow-up after those: decide whether `auth` and `feedback` need Repository Modules or stay direct auth/event adapters.

**Phase 3 — Unified LLM provider abstraction.**
  Owner: Codex (after Claude defines the interface).
  Three files (`skill_tagger.py`, `llm_ranker.py`, `job_path.py`) each re-implement the same OpenRouter → Groq → Gemini fallback chain with their own constants. Consolidate into `services/llm_provider.py` exposing `LLMProvider.complete(prompt, model_pref) -> str` with built-in fallback + rate-limit detection.
  After Phase 3, `cv_parser.py` and the diary processor should also migrate to the same abstraction.
  *Codex pickup:* mechanical migration of all callers once the new class exists + passes its own unit tests.

**Phase 4 — Cross-repo taxonomy + jobs schema contract.**
  Owner: Claude Code (cross-repo, needs careful coordination).
  Lightcast taxonomy lives in TWO places: `backend/lightcast_skills_taxonomy.json` AND `firecrawl_Supabase/scraper/lightcast_skills_taxonomy.json`. Promote to a versioned shared artefact + checksum check on boot. Add a contract test that asserts the `public.jobs` table shape matches what `csv_importer.py` writes (job_id, job_title, job_description, company_name, Industry, Location, apply_url, main_skills[], side_skills[], batch_date).
  Direction: do not bulk-copy `/Users/incognito/Mirror CV/firecrawl_Supabase` into this repo. The deep Job Feed module lives at `backend/app/services/job_feed/`: canonical row contract, taxonomy checksum, quality report, and one Supabase upsert adapter. Decision recorded in `docs/adr/0001-job-feed-firecrawl-crawler-contract.md`.
  Open Questions #1 and #5 must be resolved before this phase.

**Phase 5 — Frontend prototype cleanup.**
  Owner: Codex.
  `frontend/Black_futuristist_frontend/` moved to ignored `reference/codebases/black-futurist-frontend/` so production frontend tooling cannot import or index it by accident. Production `.tsx` files currently have no live `BF_*` imports.

**Phase 6 — Router file-size triage.**
  Owner: Codex.
  Split `routers/jobs.py` (592L) and `routers/cv.py` (446L) along feature-area lines: `routers/jobs/{list,detail,match,apply,milestone}.py`, `routers/cv/{upload,history,variants}.py`. Keep top-level `__init__.py` re-exports so `app.main` mounting stays unchanged.

**Phase 7 — Dual scoring entry-point consolidation.**
  Owner: Claude Code.
  `backfill_scores.py`, `restore_skills_from_cv_text.py`, and `compute_and_persist_score()` are three entry points to roughly the same flow. Pick `compute_and_persist_score()` as canonical; convert the standalone scripts into thin CLI wrappers. Document final flow in `docs/SCORING_ALGORITHM.md`.
  Open Question #6 must be resolved before this phase.

**Stretch (Phase 8) — Domain layer separation.**
  Owner: Claude Code.
  Pydantic schemas currently double as API contracts AND DB row shapes. Introduce DTO ↔ entity ↔ row mapping where the divergence is real. Only do this if Phases 1–7 surface concrete pain.

---

## OPEN QUESTIONS PARKED (FOR /grill-me — NOT to ask user yet)

These came out of the 2026-04-26 graphify audit. Save for a focused `/grill-me` session before kicking off **Phase 4** (which is when most of them become blocking).

1. **Repo split vs monorepo.** Mirror and `firecrawl_Supabase` are separate repos sharing a Supabase schema implicitly. Keep separate (and add contract tests in Phase 4), or merge scraper into Mirror as `services/ingest/`? Trade-off: independent deploy cadence vs schema-drift safety.

2. **`black-futurist-frontend/` lifecycle.** Resolved for Phase 5: keep as ignored reference material at `reference/codebases/black-futurist-frontend/`. Do not import from it in production code; copy ideas into production modules intentionally.

3. **`get_supabase_admin()` injection scope.** Service-role key is currently used in user-facing endpoints. Intentional (RLS bypass for cross-user reads), or accidental (should be the user-scoped client)? Phase 2 can continue structurally by preserving current behavior inside Repository adapters, but Claude should review this before changing any adapter from admin to token-scoped.

4. **`job_path.py` (961L) status.** Confirmed: powers the 7-day-plan + tailored-CV-per-job feature. Is this feature in the active roadmap, or ripe for aggressive trimming? Phase 1b needs to know how much we can cut.

5. **Two LLM stacks.** LM Studio (local-only) in scraper, OpenRouter+Groq+Gemini (cloud) in Mirror. Intentional per the scraper's `CLAUDE.md` ("no cloud AI APIs are permitted"), or should we unify to one provider abstraction in Phase 3 with a `local_only=True` mode for the scraper?

6. **Dual scoring entry points.** `backfill_scores.py` + `restore_skills_from_cv_text.py` + `compute_and_persist_score()` — one canonical flow with two ops scripts, or do they have meaningfully different behaviour we need to preserve? Phase 7 needs the answer.

---

## ARCHITECTURE DECISIONS — PROGRESS FLOW UNIFICATION (Part 2)

> **Read this in the architecture-planning phase before writing any spec or migration for the Job → Diary → Milestone → CV chain.**
>
> Target flow:
>
> ```
> Intel    → pick target skill / company
> Jobs     → save a target job
>            ↳ writes job_application_skill_targets
>            ↳ seeds job_application_milestones (7 rows)
> Progress → today's milestone featured at top of /diary
>            ↳ submitting an entry bound to that milestone:
>               • appends to daily_logs.entry_text
>               • runs LLM signal extraction → fills skills_delta
>               • upgrades user_skills.matched_level
>               • marks job_application_milestones[today].completed_at
>               • copies proof/impact onto that milestone row
> CV       → when ≥N milestones for a job have proof,
>            regenerate job_cv_variants (deterministic + optional AI polish)
> Dashboard → trajectory view (score Δ, jobs in flight, milestones done, CV vN)
> ```
>
> **Known structural bugs to fix as part of this work:**
> 1. Two parallel milestone tables (`user_milestones` and `job_application_milestones`) — only the latter feeds `job_cv_variants`. Diary writes to neither.
> 2. `backend/app/routers/diary.py` has `signals: list[dict] = []` hardcoded (~line 34) — the LLM signal-extraction step is dead. `daily_logs.skills_delta` and `user_skills` upgrades from diary never fire.
> 3. The skill-cart URL (`frontend/lib/diary-skill-cart.ts`) drops `job_id` and `milestone_date` between the Job page and the Diary page, so the binding context is lost.

**Process to use during architecture planning:**
- Run a focused `/grill-me` walking Tier 1 first (those 5 block migrations).
- Once Tier 1 is settled, draft the migration + write the formal ADR at `docs/adr/0001-progress-flow-unification.md`.
- Then walk Tier 2 surface-by-surface as each spec is written.
- Tier 3 stays parked until v1 ships and we have user feedback.
- The "*Lean*" notes are starting suggestions, **not decisions**. Confirm each one with the user.

### Tier 1 — Schema decisions (BLOCKING — answer before any migration)

1. **Collapse `user_milestones` into `job_application_milestones`?**
   Options: (a) deprecate `user_milestones`, make `job_id` nullable on the survivor; (b) keep both, formally split as "job-bound" vs "personal"; (c) keep both and copy across.
   *Lean: (a). Two tables doing the same thing is the root cause.*

2. **Add `daily_logs.milestone_id` (nullable FK), or a join table?**
   Options: (a) single FK — one entry binds to one milestone; (b) join table — one entry can complete multiple milestones; (c) no FK — match by date + user.
   *Lean: (b) join table. A user might log "shipped feature X" that proves milestones for two saved jobs at once.*

3. **Saved-job semantics — new state or reuse `job_applications.status`?**
   Options: (a) reuse `status='pending'` to mean "saved/targeted"; (b) add new status `targeted` between `pending` and `applied`; (c) new `job_paths` table tracking lifecycle (active / paused / abandoned / converted).
   *Lean: (c). Paths and applications are different things; conflating them will hurt later.*

4. **Where does Intel "pick a target skill" persist?**
   Options: (a) ephemeral — pure browse, no persistence; (b) new `user_target_skills` table; (c) infer targets from saved jobs only — Intel writes nothing.
   *Lean: (a) for v1. Real persistence comes from saving a job.*

5. **Cap on concurrent active job-paths?**
   A user with 8 saved jobs would have 56 milestones competing for daily attention.
   Options: (a) cap at 3 active; (b) no cap, surface only "next due" in Diary; (c) cap at 1 active "primary" path, others archived.
   *Lean: (a) at 3. Mirrors the existing "top 3 recommended jobs" pattern.*

### Tier 2 — Surface-by-surface decisions (answer as each surface is built)

**Jobs page — when user saves a job:**

6. **Seed milestones automatically, or behind a "Build my 7-day plan" CTA?**
   *Lean: CTA. Auto-seed risks spamming users who are still browsing.*

7. **Milestone content source — LLM, template library, or user picks?**
   `template_id` + `proof_prompt` + `impact_prompt` columns already exist on `job_application_milestones`, suggesting templates are intended.
   *Lean: hybrid — template if `template_id` matches, else LLM-generated.*

8. **Skill selection per path — all gap skills, top N, or user picks?**
   *Lean: top 3 gap skills, user can swap.*

9. **Plan start date — today, next Monday, or user-picked?**
   *Lean: today, with a "shift to next Monday" toggle.*

**Progress page — diary ↔ milestone binding:**

10. **When user has multiple active paths, which milestone is "today's featured"?**
    Options: next-due, oldest-incomplete, primary-path-only, show all.
    *Lean: stack — primary path's milestone hero, others as quiet rows below.*

11. **Binding mechanism — auto-bind today's entry to today's featured milestone, or explicit dropdown?**
    *Lean: auto-bind with a one-tap "this isn't about that milestone" override.*

12. **Auto-complete the milestone on submit, or explicit "Mark complete" button?**
    *Lean: explicit. Milestone completion is a meaningful event we don't want to fire by accident.*

13. **Where do `proof` and `impact` come from?**
    Options: (a) LLM-summarised from entry text; (b) two extra form fields on the diary; (c) entry text becomes proof, impact is a separate prompt — uses the existing `proof_prompt` / `impact_prompt` columns.
    *Lean: (c).*

14. **Confidence score — user slider, LLM-rated, or derived from word-count/specificity?**
    *Lean: LLM-rated with a user override.*

**LLM extraction — diary signal pipeline:**

15. **Provider chain.** Default: same as `cv_parser` (OpenRouter free Llama → Groq → Gemini → OpenRouter paid). Confirm or override?
    *(Note: this overlaps with refactor Phase 3 — the unified LLM provider abstraction. Coordinate.)*

16. **Sync vs async.** Sync blocks submit (~2–4 s); async returns instantly and updates `skills_delta` in the background.
    *Lean: sync for v1, switch to async if latency hurts.*

17. **Cost cap per submit.** Free Llama and Groq are free; Gemini and paid OpenRouter cost money. Cap at one paid call per submit?

18. **Degradation policy when all providers fail.** Save entry without `skills_delta`, or 503?
    *Lean: save entry. Diary must not fail because the LLM is down.*

19. **Skill-source attribution conflict.** When diary upgrades a skill that was originally `source='cv'`, today the value gets overwritten.
    Options: (a) keep overwrite; (b) add `source='cv+diary'`; (c) keep `cv` but stamp a new `last_diary_evidence_at` column.
    *Lean: (c).*

**CV builder — variant regeneration:**

20. **Threshold N — milestones-with-proof needed before regenerating `job_cv_variants`.**
    Options: 3 / 5 / 7.
    *Lean: 3. Fast feedback loop; user sees progress early.*

21. **Auto-regenerate on threshold, or explicit "Generate tailored CV" CTA?**
    *Lean: auto for the deterministic version, CTA for the AI polish (it costs money).*

22. **AI polish — always, opt-in per draft, or first-N-free?**
    Existing `ai_polish_used_at` column suggests opt-in. Confirm.

23. **`job_cv_variants` ↔ `cv_history` relationship.**
    Does a polished variant become a `cv_history` row with `version_type='generated_draft'` (column already exists)?
    *Lean: yes — single source of truth for "all CVs the user has".*

24. **Where does the user view / edit / download a variant?**
    Options: new page (`/cv/job/[job_id]`), inline drawer on `/cv`, or in `/tracker`.
    *Lean: inline drawer on `/cv` — keeps the CV surface as the canonical place.*

**Dashboard — trajectory view:**

25. **Metric set.** Mirror Score line (have `mirror_score_history`) + jobs in flight + milestones-completed-this-week + latest CV variant — anything else?
    *Lean: those four for v1.*

26. **Time range.** Last 30 days fixed, or user-pickable?
    *Lean: 30-day fixed, expand later.*

### Tier 3 — defer to v2 / first user feedback

- Pause / abandon / resume job-path flows
- Daily reminder notifications
- Per-job progress detail views
- Multi-user comparisons / leaderboards
- Sharing CV variants externally
- Undoing a milestone completion
- Source attribution UI ("this skill was credited from your diary entry on…")

---

## LAST SESSION SUMMARY (2026-04-26 — MODULARITY REFACTOR RECOVERY)

```
Date: 2026-04-26
Milestone: Recovery after accidental reset; Phase 1b cleanup and Phase 2 Repository seams restored.

Commits this session:
  fedb32e  refactor(scoring): split scoring_engine.py → scoring/{formulas,gap,persistence} [Phase 1, prev session]
  0ccb804  refactor(job-path): split job_path.py (961L) into job_path/ package (Phase 1b)
  de0977e  refactor(architecture): recover repository seams
  3037454  docs(claude): record recovery commit

Work done:
  Claude completed the mechanical split of services/job_path.py into:
    services/job_path/plan.py          (283L)
    services/job_path/milestones.py    (212L)
    services/job_path/cv_generator.py
    services/job_path/quality_gate.py  (63L)
    services/job_path/_db.py           (49L — shared Supabase reads)
    services/job_path/_helpers.py      (44L)
    services/job_path/_content.py      (33L)
    services/job_path/__init__.py      (re-exports full public API for back-compat)

  Codex restored the missing Phase 1b cleanup:
    services/job_path/llm_polish.py    (AI Polish Provider Chain + rate-limit lookup)
    services/job_path/cv_generator.py  under 300L
    services/job_path/plan.py imports _latest_polished_cv from llm_polish
    tests/test_job_path_service.py patches cv_generator._call_ai_polish

  Codex also landed job_feed/ contract module (Phase 4 groundwork):
    services/job_feed/__init__.py
    services/job_feed/contract.py
    services/job_feed/importer.py
    services/job_feed/taxonomy.py
    tests/test_job_feed_contract.py
    tests/test_job_feed_importer.py
    tests/test_job_feed_taxonomy.py
    ADR: docs/adr/0001-job-feed-firecrawl-crawler-contract.md

  Codex restored Phase 2 Repository layer:
    repositories/scores.py + router/tests
    repositories/skills.py + router/tests
    repositories/users.py + router/tests
    repositories/diary.py + router/tests
    routers/scores.py, skills.py, users.py, diary.py no longer call Supabase directly.
    Existing admin vs token-scoped behavior preserved inside adapters.

Verification before recovery commit:
  pytest backend/tests -q                         166 passed
  focused recovery tests                           42 passed
  frontend/node_modules/.bin/tsc --noEmit          passed
  frontend/node_modules/.bin/next lint             passed
  wc -l backend/app/services/job_path/*.py         all <= 300L
  wc -l backend/app/repositories/*.py              all <= 300L

Known follow-ups (carried):
  [ ] Smoke test production URL end-to-end after Phase 1 ships
  [ ] Regenerate Signal Dot particle logo in amber for Forge mode (from 2026-04-20)
  [ ] Replace TMLogo SVG with new Signal Dot mark in sidebar + About modal (from 2026-04-20)

Next for Codex:
  1. Phase 2B — create repositories/cv.py and move routers/cv.py Supabase calls behind it.
  2. Phase 2C — repositories/jobs.py and routers/jobs.py sweep.

Next for Claude:
  1. Review Repository adapter policy: which seams should stay service-role and which should become token-scoped.
  2. Do not alter behavior unless making that policy decision deliberately.
```

---

## PREVIOUS SESSION SUMMARY (2026-04-25 / 2026-04-26 — IA REORDER + ARCHITECTURE AUDIT)

```
Date: 2026-04-25 (UI work) + 2026-04-26 (architecture audit)
Milestone: Spec docs/superpowers/specs/2026-04-25-nav-reorder-and-cv-nudge.md shipped.
           Architecture audit run on 2026-04-26 produced graphify-out/GRAPH_REPORT.md.

Commits this session (UI):
  7ce0acd  Reordering-dashbaord
  8e06969  feat(ui): cv-required nudge + remove first-run CV gates
  46db81b  feat(onboarding): add gentle close button to escape onboarding
  76753dc  feat(ui): drop Market position subtitle on score pill
  a11f9aa  feat(ui): reorder sidebar (Intel→Jobs→Progress→CV→Dashboard)

UI work shipped:
  1. Sidebar order = Intel → Jobs → Progress → CV Builder → Dashboard
  2. Score block: "Market position" subtitle dropped; MYRO SCORE + number only
  3. Onboarding: × close button top-right; skips to /market
  4. First-run CV gate removed; users without CV browse freely
  5. <CVRequiredNudge /> component added — banner + block variants
     rendered on /market, /tracker, /jobs, /diary, /dashboard

Architecture audit (2026-04-26):
  - Resumed an interrupted /graphify run on True_Yodha (832 nodes, 1247 edges, 94 communities).
  - Surveyed firecrawl_Supabase/ (scraper, csv_importer, weekly_run) for cross-repo handoff.
  - Outputs: graphify-out/{GRAPH_REPORT.md, graph.html, graph.json}.

  Eight modularity issues identified:
    1. Supabase client god object (get_supabase_admin, degree 33, touches 5 communities)
    2. Scoring engine doing 4 jobs (formulas + gap + persistence + diary merge in one 455L file)
    3. CV parsing duplication across cv_parser, restore_skills_from_cv_text, backfill_scores
    4. Frontend prototype contamination (BF_* symbols still imported by production .tsx)
    5. Cross-repo skill taxonomy duplication (no version pinning, silent drift risk)
    6. Two LLM provider stacks (skill_tagger + llm_ranker + job_path each reimplement fallback)
    7. No domain layer (Pydantic schemas double as API contract + DB row shape)
    8. Implicit scraper handoff contract (no schema test on public.jobs)

  Six open questions parked for /grill-me (see OPEN QUESTIONS PARKED above).

  File-size violations vs. CLAUDE.md 300-line cap:
    services/job_path.py        961 lines   3.2x limit
    routers/jobs.py             592         2.0x
    scoring_engine.py           455         1.5x
    skill_tagger.py             452         1.5x
    routers/cv.py               446         1.5x
    cv_parser.py                334         1.1x

Known follow-ups (carried):
  [ ] Smoke test production URL end-to-end after Phase 1 ships
  [ ] Regenerate Signal Dot particle logo in amber for Forge mode (from 2026-04-20)
  [ ] Replace TMLogo SVG with new Signal Dot mark in sidebar + About modal (from 2026-04-20)
```

---

## PREVIOUS SESSION SUMMARY (2026-04-20 — PRODUCTION DEPLOYMENT + FULL TOKEN PASS)

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
