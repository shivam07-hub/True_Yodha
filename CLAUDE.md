# MYRO — CLAUDE.md (Cockpit)
### Session Control File · v3.1 · April 2026

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

Myro is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills are extracted and matched against a global skill taxonomy (L1–L5 levels determined by comparing CV evidence to taxonomy benchmark definitions) → top 5 job matches are found by skill overlap and LLM-ranked → top 3 are recommended to the user with explanations and a 7-day action plan to align their CV to each job → a Myro Score (0–100) is computed across 10 domains → user sees their score, domain breakdown, top 3 recommended jobs, and top 5 skill upgrade priorities. Application tracking records whether the user applied, received a response, and status at the 1-week check-in. Rank, tier, and percentile are computed internally.

**Tech stack:** FastAPI (backend) · Railway (backend hosting) · Next.js 14 (frontend), Tailwind CSS, Shadcn/ui · Supabase/PostgreSQL (DB) · Vercel (frontend hosting) · OpenRouter API (LLM ranking) · Chrome Manifest V3 (browser extension at `/Chrome_extension/` — captures jobs from any URL into the user's Application list)

**Reference docs:**
- Full tech stack + architecture: `docs/TECH_STACK.md`
- Scoring algorithm: `docs/SCORING_ALGORITHM.md`
- Deployment guide (Git → GitHub → Vercel): `docs/DEPLOYMENT_GUIDE.md`
- Chrome extension code: `/Chrome_extension/` (Manifest V3, captures `JobPosting` JSON-LD → backend)

---

## CODING CONVENTIONS (always apply)

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, Supabase client for all DB operations (no SQLAlchemy/Alembic), `HTTPException` only (never raw exceptions), 100% test coverage on scoring engine.

**TypeScript:** Strict mode ON, no `any`, functional components only, all API calls via `lib/api.ts`, TanStack Query for server state, Zustand for UI-only state, 375px mobile viewport required.

**Git commits (Conventional Commits format):**
`feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope per commit.

**File size:** No file > 300 lines. Split if exceeded.

---

## CLAUDE CODE SKILLS (available via `/skill-name`)

> **For Codex:** These are Claude Code slash-command skills. When handing off to Claude Code, reference the trigger to invoke the relevant skill.

| Skill | Trigger | Purpose |
|---|---|---|
| `improve-codebase-architecture` | `/improve-codebase-architecture` | Find deepening opportunities, ADR-informed refactor suggestions |
| `graphify` | `/graphify` | Any input → knowledge graph (HTML + JSON + audit report) |
| `triage-issue` | `/triage-issue` | Root-cause a bug, file GitHub issue with TDD fix plan |
| `request-refactor-plan` | `/request-refactor-plan` | Interview-driven refactor plan → GitHub issue |
| `to-issues` | `/to-issues` | Break plan/spec/PRD into vertical-slice GitHub issues |
| `to-prd` | `/to-prd` | Turn conversation into a PRD, file as GitHub issue |
| `review` | `/review` | Review current branch PR |
| `security-review` | `/security-review` | Security review of pending branch changes |
| `tdd` | `/tdd` | Red-green-refactor TDD loop for features/bug fixes |
| `simplify` | `/simplify` | Review changed code for reuse, quality, efficiency |
| `brooks-design` | `/brooks-design` | Brooks' design philosophy — conceptual integrity audit |
| `ousterhout-design` | `/ousterhout-design` | Ousterhout deep module principles — complexity audit |
| `init` | `/init` | Initialize CLAUDE.md with codebase documentation |
| `qa` | `/qa` | Interactive QA session → GitHub issues |
| `grill-me` | `/grill-me` | Relentless interview to resolve plan/design ambiguities |
| `github-triage` | `/github-triage` | Label-based GitHub issue triage state machine |
| `git-guardrails-claude-code` | `/git-guardrails-claude-code` | Block dangerous git commands via hooks |
| `setup-pre-commit` | `/setup-pre-commit` | Husky + lint-staged + type check + tests pre-commit hooks |
| `frontend-design` | `/frontend-design` | Production-grade frontend interfaces, high design quality |
| `baseline-ui` | `/baseline-ui` | Animation, typography, accessibility, layout audits |
| `fixing-accessibility` | `/fixing-accessibility` | ARIA, keyboard nav, focus, contrast audits + fixes |
| `fixing-motion-performance` | `/fixing-motion-performance` | Animation perf: layout thrashing, compositor, scroll-linked |
| `fixing-metadata` | `/fixing-metadata` | HTML metadata: titles, OG tags, Twitter cards, canonical |
| `design-an-interface` | `/design-an-interface` | Multiple radically different interface designs via subagents |
| `schedule` | `/schedule` | Schedule recurring or one-time remote agents |
| `loop` | `/loop` | Run a prompt on a recurring interval |
| `claude-api` | `/claude-api` | Build/debug/optimize Claude API / Anthropic SDK apps |
| `archon` | `/archon` | Run Archon AI workflows from Claude Code |
| `obsidian-vault` | `/obsidian-vault` | Search, create, manage Obsidian vault notes |
| `edit-article` | `/edit-article` | Restructure, clarify, tighten prose in articles |
| `write-a-skill` | `/write-a-skill` | Create new agent skills with proper structure |
| `caveman` | `/caveman` | Ultra-compressed communication mode (~75% token reduction) |
| `find-skills` | `/find-skills` | Discover and install agent skills |
| `karpathy-guidelines` | `/karpathy-guidelines` | Reduce common LLM coding mistakes |
| `update-config` | `/update-config` | Configure Claude Code harness via settings.json |
| `fewer-permission-prompts` | `/fewer-permission-prompts` | Add allowlist to reduce permission prompts |
| `scaffold-exercises` | `/scaffold-exercises` | Create exercise directory structures |
| `migrate-to-shoehorn` | `/migrate-to-shoehorn` | Migrate `as` type assertions to shoehorn |
| `keybindings-help` | `/keybindings-help` | Customize keyboard shortcuts |

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

---

## NEXT SESSION FOCUS (POST-PHASE-7 HARDENING)

**Phase 5 complete:** frontend prototype references moved to `reference/` and no live `BF_*` imports remain in production frontend code.

**Phase 6 complete (workspace):** routers split and kept mount surface unchanged:
- `backend/app/routers/jobs/{list,detail,match,apply,milestone}.py`
- `backend/app/routers/cv/{upload,history,variants}.py`
- Top-level router exports preserved via package `__init__.py` so `app.main` still mounts `jobs.router` and `cv.router`.

**Phase 7 complete (workspace):**
- `compute_and_persist_score()` remains the single canonical scoring path.
- Enforced CV upload/text invariant: require at least one persisted skill row.
- Updated `docs/SCORING_ALGORITHM.md` with canonical-flow documentation.
- Phase 7 CLI wrapper scripts removed (backfill embedded in SQL migrations per design policy).

**Universal skill taxonomy enforced + production smoke-tested (this session):**
- Created `job_skills` join table: `job_id → jobs.job_id`, `skill_id → skills.id`, `is_primary`.
- Trigger on `jobs` syncs `main_skills`/`side_skills` → `job_skills` (scraper backward-compat).
- SQL migrations run in production: `20260427_fix_jobs_skills_rls.sql` + `20260427_job_skills_table.sql`.
- 16,342 rows backfilled. All code reads from `job_skills JOIN skills` — canonical taxonomy end-to-end.
- Fixed `job_path/_db.py::_get_job` to read from `job_skills` → overlap_score and readiness_pct now use identical skill source.
- Fixed `max(len(main), 1)` denominator bug that inflated scores for sparse-indexed jobs.
- Fixed `is_cache_valid` to invalidate when `user_skills.last_updated > computed_at` — prevents stale scores after CV re-upload.
- Fixed `find_role_skill_rows` (last path still on legacy TEXT arrays) to use `job_skills`.
- Deleted stale `user_job_matches` rows computed against partial backfill window.
- **Production verified**: `POST /jobs/compute` returns correct matches. Job cards show honest overlap %.

**Next session priorities:**
1. **Diary/Progress flow** — three known structural bugs (see ARCHITECTURE DECISIONS below):
   - `routers/diary.py` LLM signal extraction hardcoded `signals: list = []` → skills_delta never fires
   - Skill-cart URL drops `job_id` + `milestone_date` between Job page and Diary page
   - `user_milestones` table deprecated — migrate writes to `job_application_milestones`
2. **Scraper update** (separate session): write to `job_skills` directly, then drop trigger + legacy TEXT columns.
3. **Smoke test continuation** — resume from step 4 (tracker → diary → score recompute loop).

Verification:
```
pytest backend/tests -q   → 179 passed
tsc --noEmit              → exit 0
next lint                 → no errors
Production smoke test     → CV upload ✓  score ✓  job matches ✓  overlap % correct ✓
```

---

## REFACTOR ROADMAP (drafted 2026-04-26 from /graphify audit)

Eight modularity issues tackled across seven phases. Each phase = one session, one commit, smoke-tested before any merge to `main`.

**Phase 1 — Scoring engine split.** ✅ DONE (`fedb32e`)
  Split `services/scoring_engine.py` (455L) → `services/scoring/{formulas,gap,persistence}.py`.

**Phase 1b — `job_path.py` split.** ✅ DONE (`0ccb804`)
  Split `services/job_path.py` (961L) into `services/job_path/{plan,milestones,cv_generator,quality_gate,llm_polish,_db,_helpers,_content}.py`. All files ≤ 300L.

**Phase 2 — Repository layer.** ✅ DONE (`5f9a95c`)
  Owner: Codex (behavior-preserving seams with token-scoped constraint per OQ2).
  Create `backend/app/repositories/{scores,skills,users,diary,cv,jobs}.py`. Move every direct Supabase call out of routers/services into repos. Inject via FastAPI `Depends`.
  **Token-scoped client for all user-facing routes. Service-role for admin/internal only.**
  Removes the #1 god node `get_supabase_admin()` (degree 33) from user-facing paths.

**Phase 3 — Unified LLM provider abstraction.** ✅ DONE (`90f8639`)
  Created `services/llm_provider.py`: `LLMProvider` class, `async complete(messages, max_tokens=4096) -> str`, `LLMProviderError`, `get_llm_provider()` Depends factory.
  Migrated `llm_ranker.py` + `llm_polish.py` to LLMProvider. Made `call_llm`, `rank_and_persist`, `_call_ai_polish`, `generate_job_cv` async.
  Scope: Myro cloud stack only. Scraper (`skill_tagger.py`) intentionally excluded.
  Post-Phase-3 migration pending: `cv_parser.py` and diary processor.

**Phase 4 — Cross-repo taxonomy + jobs schema contract.**
  Owner: Claude Code (cross-repo, needs careful coordination).
  Lightcast taxonomy lives in TWO places: `backend/lightcast_skills_taxonomy.json` AND `firecrawl_Supabase/scraper/lightcast_skills_taxonomy.json`. Promote to a versioned shared artefact + checksum check on boot. Add a contract test that asserts the `public.jobs` table shape matches what `csv_importer.py` writes.
  Repos stay separate (independent deploy cadence). The contract test lives in Myro and runs in CI.

**Phase 5 — Frontend prototype cleanup.** ✅ DONE
  Owner: Codex.
  `frontend/Black_futuristist_frontend/` references moved to `reference/`. Confirmed no live `BF_*` imports in production `.tsx`.

**Phase 6 — Router file-size triage.** ✅ DONE (workspace)
  Owner: Codex.
  Split monolith routers into feature modules:
  `routers/jobs/{list,detail,match,apply,milestone}.py`, `routers/cv/{upload,history,variants}.py`.
  Top-level router re-exports preserved for unchanged `app.main` mounting.

**Phase 7 — Dual scoring entry-point consolidation.** ✅ DONE (workspace)
  Owner: Claude Code.
  `compute_and_persist_score()` is the single canonical scoring entry point.
  Added thin wrappers `database/backfill_scores.py` and `database/restore_skills_from_cv_text.py`.
  CV upload/text now enforce that at least one skill is persisted before completion.
  `docs/SCORING_ALGORITHM.md` updated to reflect canonical scoring flow.

**Stretch (Phase 8) — Domain layer separation.**
  Owner: Claude Code.
  Pydantic schemas currently double as API contracts AND DB row shapes. Introduce DTO ↔ entity ↔ row mapping where the divergence is real. Only do this if Phases 1–7 surface concrete pain.

---

## DECISIONS LOCKED (2026-04-26)

All open questions from the graphify audit and progress flow planning resolved. Do not reopen without explicit user instruction.

### Refactor decisions

| # | Question | Decision |
|---|---|---|
| OQ1 | Repo split vs monorepo | **Separate repos** — Mirror/Myro and firecrawl_Supabase stay independent for deploy cadence. Contract tests in Phase 4. |
| OQ2 | `get_supabase_admin()` scope | **Token-scoped for user endpoints.** Service-role for admin/internal only. Enforced in Phase 2 repo adapters. |
| OQ3 | Two LLM stacks | **Intentional separation.** Scraper = local-only (LM Studio). Myro = cloud (OpenRouter→Groq→Gemini). Phase 3 unifies Myro internals only. |
| OQ4 | Dual scoring entry points | **Single canonical flow.** `compute_and_persist_score()` is the source of truth. Scripts become thin CLI wrappers. Every CV must have skills. |

### Progress flow schema decisions (Tier 1 — all resolved)

| # | Question | Decision |
|---|---|---|
| S1 | Two milestone tables | **Deprecate `user_milestones`.** One survivor: `job_application_milestones`, `job_id` nullable for personal milestones. |
| S2 | `daily_logs` ↔ milestone binding | **Join table.** One diary entry can complete milestones across multiple job-paths simultaneously. |
| S3 | Saved-job semantics | **Reuse `job_applications.status = 'pending'`** to mean saved/targeted. Every saved job is an intended application. |
| S4 | Intel "pick target skill" | **Ephemeral.** Skill targets inferred from saved jobs only. Intel writes nothing to DB. |
| S5 | Active job-path cap | **No cap.** Surface only "next due" milestone in diary regardless of how many active jobs. |

---

## ARCHITECTURE DECISIONS — PROGRESS FLOW UNIFICATION

> **Read this before writing any spec or migration for the Job → Diary → Milestone → CV chain.**
>
> Target flow:
>
> ```
> Intel    → pick target skill / company (ephemeral — no DB write)
> Jobs     → save a target job (job_applications.status = 'pending')
>            ↳ seeds job_application_milestones (7 rows) behind a CTA
> Progress → "next due" milestone surfaced at top of /diary (no cap on active jobs)
>            ↳ submitting an entry:
>               • appends to daily_logs.entry_text
>               • join table links entry → milestone(s) across job-paths
>               • runs LLM signal extraction → fills skills_delta
>               • upgrades user_skills.matched_level
>               • explicit "Mark complete" button completes milestone
>               • copies proof/impact onto that milestone row
> CV       → when ≥3 milestones for a job have proof,
>            deterministic CV variant auto-regenerates;
>            AI polish is opt-in CTA (costs money)
> Dashboard → trajectory view (score Δ, jobs in flight, milestones done, CV vN)
> ```
>
> **Known structural bugs to fix as part of this work:**
> 1. `user_milestones` table deprecated — migrate to `job_application_milestones` with nullable `job_id`. Diary writes to the survivor.
> 2. `backend/app/routers/diary.py` has `signals: list[dict] = []` hardcoded — the LLM signal-extraction step is dead. `daily_logs.skills_delta` and `user_skills` upgrades from diary never fire.
> 3. The skill-cart URL (`frontend/lib/diary-skill-cart.ts`) drops `job_id` and `milestone_date` between the Job page and the Diary page — binding context is lost.

### Tier 2 — Surface-by-surface decisions (answer as each surface is built)

**Jobs page — when user saves a job:**

6. **Seed milestones automatically, or behind a "Build my 7-day plan" CTA?**
   *Lean: CTA. Auto-seed risks spamming users who are still browsing.*

7. **Milestone content source — LLM, template library, or user picks?**
   `template_id` + `proof_prompt` + `impact_prompt` columns already exist on `job_application_milestones`.
   *Lean: hybrid — template if `template_id` matches, else LLM-generated.*

8. **Skill selection per path — all gap skills, top N, or user picks?**
   *Lean: top 3 gap skills, user can swap.*

9. **Plan start date — today, next Monday, or user-picked?**
   *Lean: today, with a "shift to next Monday" toggle.*

**Progress page — diary ↔ milestone binding:**

10. **Binding mechanism — auto-bind today's entry to next-due milestone, or explicit dropdown?**
    *Lean: auto-bind with a one-tap "this isn't about that milestone" override.*

11. **Auto-complete the milestone on submit, or explicit "Mark complete" button?**
    *Decision: explicit. Milestone completion is a meaningful event.*

12. **Where do `proof` and `impact` come from?**
    Options: (a) LLM-summarised from entry text; (b) two extra form fields; (c) entry text becomes proof, impact is a separate prompt using existing `proof_prompt` / `impact_prompt` columns.
    *Lean: (c).*

13. **Confidence score — user slider, LLM-rated, or derived from word-count/specificity?**
    *Lean: LLM-rated with a user override.*

**LLM extraction — diary signal pipeline:**

14. **Provider chain.** Same as `cv_parser` (OpenRouter free Llama → Groq → Gemini → OpenRouter paid). Confirm or override after Phase 3.

15. **Sync vs async.** Sync blocks submit (~2–4 s); async returns instantly and updates `skills_delta` in background.
    *Lean: sync for v1, switch to async if latency hurts.*

16. **Cost cap per submit.** Free Llama and Groq are free; Gemini and paid OpenRouter cost money. Cap at one paid call per submit?

17. **Degradation policy when all providers fail.**
    *Decision: save entry without `skills_delta`. Diary must not fail because the LLM is down.*

18. **Skill-source attribution conflict.** When diary upgrades a skill originally `source='cv'`:
    Options: (a) overwrite; (b) `source='cv+diary'`; (c) keep `cv`, stamp `last_diary_evidence_at`.
    *Lean: (c).*

**CV builder — variant regeneration:**

19. **Threshold N — milestones-with-proof needed before regenerating `job_cv_variants`.**
    *Decision: 3. Fast feedback loop.*

20. **Auto-regenerate on threshold, or explicit CTA?**
    *Decision: auto for deterministic version, CTA for AI polish (costs money).*

21. **AI polish — always, opt-in per draft, or first-N-free?**
    Existing `ai_polish_used_at` column suggests opt-in. Confirm before building.

22. **`job_cv_variants` ↔ `cv_history` relationship.**
    *Lean: polished variant becomes a `cv_history` row with `version_type='generated_draft'` — single source of truth.*

23. **Where does the user view / edit / download a variant?**
    *Lean: inline drawer on `/cv` — CV surface is canonical.*

**Dashboard — trajectory view:**

24. **Metric set.** Myro Score line + jobs in flight + milestones-completed-this-week + latest CV variant.
    *Lean: those four for v1.*

25. **Time range.**
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

## LAST SESSION SUMMARY (2026-04-27 — CV SKILL JOURNEYS + MILESTONE SOURCE_TYPE)

```
Date: 2026-04-27
Milestone: CV skill correction + diary tracking from CV page. source_type on milestones.

Commits this session:
  6cc04f8  feat(cv+diary): skill level correction + milestone source_type + CV journey 2/3

What landed:

  Backend:
    - PATCH /users/me/skills/{taxonomy_key}/level — corrects user_skills.matched_level,
      stamps source='user_correction', recomputes score via compute_and_persist_score
    - UsersRepository: get_skill_id_by_taxonomy_key(), correct_skill_level()
    - MilestoneResponse.source_type field ('personal' | 'job')
    - progress.list_progress_milestones: stamps source_type on both table results
    - diary._to_milestone_response: passes source_type from row (was defaulting to 'personal')

  Frontend:
    - CV SkillRow Journey 2: "Track upgrade in diary" → creates user_milestone →
      navigates to /diary; invalidates dataKeys.milestones
    - CV SkillRow Journey 3: inline L1–L5 level picker → PATCH skill level →
      updates pill + progress bar; invalidates dataKeys.userSkills + dataKeys.scores
    - api.ts: users.correctSkillLevel(), Milestone.source_type typed
    - diary/page.tsx: personalMilestones filter (source_type==='personal') feeds milestonesByDate

  Tests:
    - test_users_skill_correction.py — 5 tests (200 body, 422 on 0/6, 404 unknown, writes correct skill_id)
    - test_diary_source_type.py — 3 tests (personal/job source_type on GET /diary/milestones)
    - Total: 187 passed

Architecture decisions locked this session:
  - Bug 1 (signals hardcoded []): resolved — keyword matching IS live; LLM was intentionally removed
  - Bug 2 (skill-cart drops job_id): lower priority; tracker passes jobId directly
  - Bug 3 (user_milestones deprecated): kept alive as personal milestone store (no schema change)
  - user_milestones = personal milestones; job_application_milestones = job-path milestones
  - Merge at service layer only (list_progress_milestones)

Verification:
  pytest backend/tests -q   → 187 passed
  tsc --noEmit              → exit 0
  next lint                 → no errors

Next session — pick up in this order:
  1. Scraper update (separate session): write to job_skills directly,
     then drop trigger + legacy main_skills/side_skills columns
  2. Full smoke test steps 4–10 (tracker → diary → score recompute loop)
  3. diary/page.tsx: render jobMilestones section (currently filtered but not displayed)
```

---

## PREVIOUS SESSION SUMMARY (2026-04-27 — TAXONOMY NORMALISATION + PRODUCTION SMOKE TEST)

```
Date: 2026-04-27
Milestone: Universal skill taxonomy enforced end-to-end. Production smoke test passed.

Commits this session:
  38feb10  feat(taxonomy): normalise job skills into FK-enforced job_skills join table
  8351c25  fix(taxonomy): unify overlap_score and readiness_pct to same skill source
  e0045b2  fix(jobs): invalidate match cache when user skills updated after compute

What landed:

  Taxonomy normalisation:
    - Created job_skills (job_id FK→jobs, skill_id FK→skills, is_primary)
    - Trigger syncs jobs.main_skills/side_skills → job_skills on INSERT/UPDATE
    - SQL migrations run in production; 16,342 rows backfilled
    - repositories/jobs.py, repositories/scores.py, taxonomy_loader.py,
      job_matcher.py all read from job_skills JOIN skills
    - Deleted database/backfill_scores.py and restore_skills_from_cv_text.py
      (backfill logic belongs in SQL migrations)

  Bug fixes:
    - RLS on jobs + skills + job_skills: FOR SELECT USING (true) — fixed
      POST /jobs/compute 404 (token-scoped client couldn't read public tables)
    - job_path/_db.py::_get_job: reads job_skills JOIN skills instead of
      jobs.main_skills TEXT[] — overlap_score and readiness_pct now use
      identical skill source (was 100% vs 17% on same job)
    - job_matcher.py: removed max(len(main), 1) denominator hack that inflated
      scores for jobs with sparse indexed skills
    - scores.py::find_role_skill_rows: migrated from legacy TEXT arrays to job_skills
    - llm_ranker.is_cache_valid: now compares user_skills.last_updated vs
      computed_at — stale scores auto-invalidated after CV re-upload

  Production evidence (user abc@gmail.com, Wells Fargo job):
    - job_skills: 5 main + 8 side = 13 rows ✓
    - User has 2 of 13 skills → overlap = 16.7% = 17% readiness ✓ (was 100%)
    - POST /jobs/compute: returns matches ✓
    - Stale user_job_matches rows cleared from DB ✓

Verification:
  pytest backend/tests -q   → 179 passed
  tsc --noEmit              → exit 0
  next lint                 → no errors

Next session — pick up in this order:
  1. Diary/Progress structural bugs (all three are blocking the full loop):
       a. diary.py: `signals: list[dict] = []` hardcoded → LLM extraction dead,
          skills_delta and user_skills upgrades never fire
       b. diary-skill-cart.ts: drops job_id + milestone_date in URL → binding lost
       c. user_milestones deprecated → migrate diary writes to job_application_milestones
  2. Scraper update (separate session): write to job_skills directly,
     then drop trigger + legacy main_skills/side_skills columns
  3. Full smoke test steps 4–10 (tracker → diary → score recompute loop)
```

Next:
  - Run authenticated production URL smoke path (CV upload → score → jobs/diary) with dedicated test account.
```

---

## PREVIOUS SESSION SUMMARY (2026-04-27 — PHASE 5/6 FRONTEND CLEANUP + ROUTER SPLIT)

```
Date: 2026-04-27
Milestone: Phase 5 completed and Phase 6 implemented in workspace.

Commits this session:
  (pending) no commit yet in this session

What landed:
  Phase 5:
    - Frontend prototype references moved to `reference/`
    - Confirmed no live `BF_*` imports in production frontend code

  Phase 6:
    - Split `backend/app/routers/jobs.py` into:
      `backend/app/routers/jobs/{list,detail,match,apply,milestone}.py`
    - Split `backend/app/routers/cv.py` into:
      `backend/app/routers/cv/{upload,history,variants}.py`
    - Added package-level router aggregators in:
      `backend/app/routers/jobs/__init__.py`
      `backend/app/routers/cv/__init__.py`
    - Preserved import/mount compatibility:
      `from app.routers import jobs, cv` and `jobs.router` / `cv.router` unchanged
    - Preserved test monkeypatch surface:
      `jobs.job_importer` and `jobs.job_path_service` exported from `jobs/__init__.py`

Verification:
  - `pytest backend/tests -q` → 170 passed
  - `wc -l backend/app/routers/jobs/*.py backend/app/routers/cv/*.py` → all files <= 214L

Next: Phase 7 — Dual scoring entry-point consolidation.
  Canonicalize on `compute_and_persist_score()` and turn score scripts into thin wrappers.
```

---

## PREVIOUS SESSION SUMMARY (2026-04-27 — PHASE 3 LLM PROVIDER ABSTRACTION)

```
Date: 2026-04-27
Milestone: Phase 3 complete. Unified LLMProvider abstraction created; llm_ranker + llm_polish migrated.

Commits this session:
  90f8639  refactor(llm): Phase 3 — unified LLMProvider abstraction, async fallback chain

Design decisions (grilled + locked before implementation):
  - Interface: async complete(messages: list[dict], max_tokens: int = 4096) -> str
  - No model_pref param — all callers use same provider order, Brooks: no premature generality
  - Raises LLMProviderError on total failure — callers decide degradation (ranker: overlap-only, polish: None)
  - Class-based LLMProvider injected via Depends(get_llm_provider)
  - skill_tagger.py intentionally excluded (scraper / local LM Studio stack)

What landed:
  backend/app/services/llm_provider.py (92L) — LLMProvider, LLMProviderError, get_llm_provider()
    Provider chain: OpenRouter gpt-4o-mini → Groq llama-3.3-70b → Gemini flash-lite → OR free llama

  backend/app/services/llm_ranker.py — async call_llm + rank_and_persist; provider injected
  backend/app/services/job_path/llm_polish.py — async _call_ai_polish; provider injected
  backend/app/services/job_path/cv_generator.py (299L) — async generate_job_cv; provider param added
  backend/app/routers/jobs.py — Depends(get_llm_provider) on /compute + /applications/{id}/cv

  Tests:
    test_job_path_service.py — 3 generate_job_cv tests made async (@pytest.mark.asyncio)
    test_jobs_path_api.py — fake generate_job_cv updated to async with provider param
    Also fixed pre-existing bug: _snapshot_hash referenced via job_path, now via _cv_generator_mod

  All 166 tests pass. tsc --noEmit OK. next lint clean. All files ≤ 300L.

Known follow-ups (carried):
  [ ] cv_parser.py + diary processor migration to LLMProvider (post-Phase-3)
  [ ] Smoke test production URL end-to-end
  [ ] Regenerate Signal Dot particle logo in amber for Forge mode
  [ ] Replace TMLogo SVG with new Signal Dot mark in sidebar + About modal
  [ ] Rename Mirror → Myro in code (API strings, UI labels, env var comments)
  [ ] Verify RLS on public.jobs allows authenticated reads

Next: Phase 4 — Cross-repo taxonomy + jobs schema contract (Claude Code)
  Lightcast taxonomy lives in TWO places: backend/lightcast_skills_taxonomy.json AND
  firecrawl_Supabase/scraper/lightcast_skills_taxonomy.json. Promote to versioned shared artefact
  + checksum check on boot. Add contract test asserting public.jobs table shape matches
  what csv_importer.py writes.
```

## PREVIOUS SESSION SUMMARY (2026-04-27 — PHASE 2C JOBS REPOSITORY)

```
Date: 2026-04-27
Milestone: Phase 2C complete. JobsRepository seam created; all user-facing jobs routes now token-scoped.

Commits this session:
  5f9a95c  refactor(repos): Phase 2C — JobsRepository seam, all jobs routes token-scoped

What landed:
  backend/app/repositories/jobs.py (196L) — JobsRepository class with:
    - fetch_analytics_rows(), search_jobs_by_filters()  ← public/global reads (admin client)
    - get_user_skills_with_taxonomy(), get_all_jobs_skills(), get_user_target_roles()
    - get_user_matches_for_week(), get_user_skill_rows(), get_user_profile_targeting()
    - get_user_applications(), upsert_application(), get_application_with_job()
    - delete_tracker_rows(), get_job_skills(), get_user_skill_map()
    Factory functions: get_public_jobs_repository() (admin), get_token_jobs_repository() (token-scoped),
                       get_admin_jobs_repository() (ops only)

  backend/app/routers/jobs.py — all 15 endpoints updated:
    - Public endpoints (analytics, search) → get_public_jobs_repository (admin, no JWT)
    - All user-facing endpoints → get_token_jobs_repository (token-scoped)
    - Service calls (job_path_service, job_importer, job_matcher, llm_ranker) pass repo.client
    - Removed inline get_supabase_admin() / get_supabase_for_token() calls from router
    - Hoisted datetime/JobSearchItem imports to module level

  Tests updated to use app.dependency_overrides[get_token_jobs_repository]:
    - test_jobs_applications.py → _FakeJobsRepository with delete_tracker_rows()
    - test_jobs_path_api.py → _FakeJobsRepository with .client property
    - test_jobs_import.py → _FakeJobsRepository with .client property
  All 166 tests pass. tsc --noEmit OK. next lint clean. All repos ≤ 300L.

Phase 2 repository layer complete (2A scores/skills/users/diary + 2B cv + 2C jobs).
get_supabase_admin() no longer appears in any user-facing router.

Known follow-ups (carried):
  [ ] Smoke test production URL end-to-end
  [ ] Regenerate Signal Dot particle logo in amber for Forge mode
  [ ] Replace TMLogo SVG with new Signal Dot mark in sidebar + About modal
  [ ] Rename Mirror → Myro in code (API strings, UI labels, env var comments)
  [ ] Verify RLS on public.jobs allows `authenticated` reads (needed for scores, jobs, matches endpoints)

Next: Phase 3 — Unified LLM provider abstraction (Claude defines interface, Codex implements)
  Three files (skill_tagger.py, llm_ranker.py, job_path/llm_polish.py) each re-implement
  the same OpenRouter → Groq → Gemini fallback chain. Consolidate into services/llm_provider.py.
  Interface: LLMProvider.complete(prompt, model_pref) -> str with built-in fallback + rate-limit detection.
  Scope: Myro cloud stack only. Scraper (LM Studio) stays separate.
```

---

## PREVIOUS SESSION SUMMARY (2026-04-26 — MODULARITY REFACTOR PHASE 1B/2)

```
Date: 2026-04-26
Milestone: Phase 1b cleanup completed; Phase 2 Repository layer started (later lost in reset).

Commits:
  fedb32e  refactor(scoring): split scoring_engine.py → scoring/{formulas,gap,persistence}
  0ccb804  refactor(job-path): split job_path.py (961L) into job_path/ package (Phase 1b)

Work done:
  Claude split services/job_path.py into:
    services/job_path/plan.py          (283L)
    services/job_path/milestones.py    (212L)
    services/job_path/cv_generator.py
    services/job_path/quality_gate.py  (63L)
    services/job_path/_db.py           (49L)
    services/job_path/_helpers.py      (44L)
    services/job_path/_content.py      (33L)
    services/job_path/__init__.py      (re-exports full public API)

  Codex completed Phase 1b:
    services/job_path/llm_polish.py    (AI Polish Provider Chain)
    services/job_path/cv_generator.py  ≤ 297L after split
    tests/test_job_path_service.py     patches cv_generator._call_ai_polish

  Codex started Phase 2 (later lost):
    repositories/{scores,skills,users,diary}.py
    Corresponding router rewrites + tests
    job_feed/{importer,taxonomy}.py
    docs/adr/0001-job-feed-firecrawl-crawler-contract.md
```

---

## PREVIOUS SESSION SUMMARY (2026-04-25 / 2026-04-26 — IA REORDER + ARCHITECTURE AUDIT)

```
Date: 2026-04-25 (UI work) + 2026-04-26 (architecture audit)
Milestone: Nav reorder shipped. Architecture audit produced graphify-out/GRAPH_REPORT.md.

Commits (UI):
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
  5. <CVRequiredNudge /> component — banner + block variants on /market, /tracker, /jobs, /diary, /dashboard

Architecture audit (2026-04-26):
  - 832 nodes, 1247 edges, 94 communities.
  - Eight modularity issues identified.
  - Six open questions parked → all resolved this session.
  - Outputs: graphify-out/{GRAPH_REPORT.md, graph.html, graph.json}
```

---

## PREVIOUS SESSION SUMMARY (2026-04-20 — PRODUCTION DEPLOYMENT + FULL TOKEN PASS)

```
Date: 2026-04-20
Milestone: All pages token-compliant. First full production push to main (Vercel).

Commits:
  ba679f6  feat(auth): redirect to /market after login; TMLogo CSS-var fix
  c28cb5f  feat(ui): tm-page-enter + TM spacing on /mission
  f516299  feat(ui): token pass — /jobs, /onboarding, score-gauge; .gitignore cleanup
  a36960a  feat(ui): token pass — skill-upgrade-card, job-tracker-card, /tracker, /market
  f34d16c  chore: remove csv_importer.py

Infrastructure state:
  Railway: True_Yodha → Develop branch → auto-deploys on push
  Vercel: truemirror.vercel.app + preview URLs
  Supabase: gipvxuugajkugntwkeiz (prod DB)

LLM fallback chain (production):
  CV extraction:   OpenRouter free llama → Groq llama-3.1-8b → Gemini 2.0 flash-lite → OpenRouter gemini-flash-1.5
  Job ranking:     OpenRouter free llama → (graceful degradation)
  Diary:           LM Studio → Groq → Gemini → OpenRouter

Brand state: all pages token-compliant. Signal/Forge accent toggle wired everywhere.
Login redirect: → /market
```

---

## PREVIOUS SESSION SUMMARY (2026-04-18 — FIRST PRODUCTION DEPLOYMENT)

```
Date: 2026-04-18
Milestone: First successful end-to-end deployment on Railway + Vercel.

Key fixes:
  1. LLM routing for production (cv_parser, llm_ranker, diary_processor)
  2. lightcast_skills_taxonomy.json moved into backend/ (Docker path fix)
  3. CORS: allow_origins=["*"], allow_credentials=False (Bearer JWT doesn't need credentials mode)
  4. Railway env vars: OPENROUTER_API_KEY, GROQ_API_KEY, GOOGLE_API_KEY added

Deployment result:
  CV upload: 201 ✓ · Scores: 200 ✓ · Jobs: 200 ✓ · All GETs: 200 ✓ · Auth: working ✓
```
