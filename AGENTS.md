# MYRO — AGENTS.md (Cockpit)
### Session Control File · v5.0 · May 2026

---

## SESSION START RITUAL

1. Read this file top to bottom
2. State your full plan for today and wait for "yes / proceed / go ahead"
3. Work one task at a time — commit after each completed task
4. Before ending: update **Last Session Summary** below

---

## LAST SESSION SUMMARY

### 2026-08-03 — Focused first-run onboarding journey

- First-time candidates now stay in one server-driven three-step journey:
  confirm CV evidence, choose a target direction, then select one of up to
  three live roles. The CV editor no longer owns onboarding confirmation, and
  the competing Done, score, and global tailoring actions are gone.
- Skill confirmation no longer crashes when a target-dependent score does not
  exist. It advances to direction selection; onboarding completes only after
  the selected live role is durably saved, with an idempotent receipt that
  survives reload before tailoring becomes available.
- Removed the superseded five-step signup strip, onboarding score reveal, and
  other zero-reference onboarding components. Full backend tests pass (1,777),
  as do frontend tests (557), TypeScript, lint, and UI-drift checks. The local
  `agent-browser` executable remains unavailable, so no authenticated browser
  screenshot check was claimed.

### 2026-08-03 — First-party browse tab keeps the active session

- The new-tab “Browse jobs while Myro works” controls no longer apply
  `noopener`, which had deliberately removed the opener and therefore the
  browser's initial tab-scoped session copy. Each first-party `/market` tab
  now starts authenticated while the upload continues in its original tab.
- The destination immediately clears `window.opener` after that one-time
  handoff; external links retain their `noopener noreferrer` protection.
- Frontend tests (541), TypeScript, lint, and UI-drift checks pass.

### 2026-08-03 — Canonical CV upload entry surface

- The direct pre-signup CV Hub (`/cv-preview`) and post-signup onboarding now
  render the same `CVUploadStep`: the three-step path, file affordance, size
  contract, preflight validation, and error placement cannot drift apart.
- The anonymous entry retains its safe differences below the shared surface:
  paste-CV fallback, open-in-new-tab job browsing, and disclosure that a CV is
  saved only if the visitor creates an account.
- Frontend tests (540), TypeScript, lint, and UI-drift checks pass. The local
  `agent-browser` executable is unavailable, so no browser screenshot check
  was claimed.

### 2026-08-02 — Durable CV intake and finite loading recovery

- CV upload now has one canonical `cv_upload_analysis` workflow: extraction and
  structured-CV persistence complete before the job becomes `done`. New
  uploads no longer dispatch the duplicate structured-enrichment module, and
  cached rows without structured data re-enter intake without a second charge.
- The authenticated root now owns upload reconciliation across route changes.
  Progress follows persisted worker phases, the waiting screen opens `/market`
  in a new tab, and the CV document skeleton ends in a one-retry recovery state
  instead of remaining indefinitely.
- Redis-backed deployments always use the durable RQ worker. Renewable
  20-minute leases and conditional terminal transitions prevent a stale or late
  worker from overwriting swept jobs or reopening lifecycle notifications.
- Applied and verified shared-Supabase migrations
  `20260802173451_cv_upload_job_leases.sql` and
  `20260802173715_cv_upload_job_policy_hardening.sql`. Full backend tests pass
  (1,770); frontend tests (554), TypeScript, lint, and UI drift all pass.
  Commits: `c46d90fc`, `2c85616b`, `389dc866`, `db89a3f4`, `cd0bf0f0`.

### 2026-08-02 — No-CV market browse recovery

- “Browse jobs instead” now opens `/market` in a new tab with an external-link
  icon, on both the upload and experience-preview onboarding paths.
- The empty market was a real backend eligibility defect: a no-CV candidate had
  the safe `entry` seniority default but no career band, so every role was
  rejected. Browse now spans families at intern/entry level until a target is
  known; matching remains role-family strict and executive roles remain hidden.
- Full backend suite passes (1,763), as do frontend onboarding contracts,
  TypeScript, and lint. Commit: `aafa3844`.

### 2026-08-02 — Candidate seniority evidence fix

- Onboarding no longer reuses job-listing title heuristics to infer a person's
  seniority. CV dates remain primary; only explicit title markers are accepted,
  and ambiguous role nouns now ask the user instead of inventing a level.
- A generic contact headline no longer hides explicit seniority evidence in the
  first experience role. Regression coverage also protects `Data Entry
  Operator` and `Staff Nurse` from false entry/lead classifications.
- Full backend suite passes (1,758), as do frontend TypeScript, lint, and the
  heatmap display-label regression test.

### 2026-07-31 — Role-family targeting handover (in progress)

- Applied `20260731_job_role_family.sql` to shared Supabase. It adds
  `jobs.role_family`, corpus role/location/aspiration RPCs, and a `job_skills`
  trigger so future ingestion recomputes only from non-generic L2 evidence.
- Backfilled 55,856 jobs; 6,368 remain correctly unassigned because they have
  no non-generic L2 evidence. Generic families have zero winners.
- The post-skill-confirmation target step now uses real corpus titles, exact
  confirmed-skill overlap, role-scoped live locations, and CV-date seniority
  evidence; score rendering follows target confirmation.
- Local focused backend tests (44) pass, TypeScript and UI-drift pass. Full
  frontend lint remains blocked by pre-existing unrelated unused import in
  `frontend/components/auth/auth-page-shell.tsx`.

### 2026-08-02 — Heatmap display-label regression

- `/market` now passes the canonical `shortHeatmapSkillLabel` formatter into
  its retained heatmap path; the matrix renders the concise label while its
  accessible name and tooltip retain the full skill name. The deprecated
  `max-width: 12ch` label-truncation rule is not present in the market path.

### 2026-08-02 — Shared agent-memory cleanup

- `AGENTS.md` is now an active contract, not a transcript: completed session
  summaries were removed from default agent context and remain recoverable in
  Git and the shared memory graph.
- Read `docs/agent-memory/CURRENT.md` before external Codex or Claude topic
  memory. It names the verified product loop, current sources of truth, and
  the status required before a historical note can guide an implementation.
- Timed Forge XP/session behavior is retired. `forge_service.py` retains only
  level thresholds; practice progression comes from Upskilling quiz clears.

### 2026-07-31 — Supabase migration ledger repair

- Applied and recorded `20260726182212_feedback_submission_idempotency.sql` in
  the shared Supabase project; the idempotency columns, constraint, and unique
  index are live.
- Recorded `20260729113000_job_application_priority.sql` after independently
  confirming its manually applied priority columns and index were already live.
- `backend/tests/test_feedback_idempotency.py`,
  `backend/tests/test_feedback_idempotency_migration.py`, and
  `backend/tests/test_job_application_priority_migration.py` passed (8 tests).
- `database/migrations/` has 143 historical SQL artifacts, many with filenames
  not accepted as Supabase CLI migration versions. They must not be
  mass-recorded or re-run without a separately verified baseline/mapping.

---

## ABSOLUTE RULES

- Never merge to `main` directly — only to `Develop`. `main` = Vercel production.
- Never hardcode API keys — use `.env` files, never commit `.env`
- Never skip tests before marking a task complete
- Web only (mobile-responsive) — use tailwindcss and shadcn
- **Long-term fixes only.** When hitting errors, identify root cause — never patch symptoms with try/except, type casts, `|| undefined`, or workarounds. If trade-offs are unclear, discuss with Shivam before writing code.
- **Design over words.** If the UI state already communicates a fact (disabled, error, loading, locked, success), do not pad with helper text restating it. A `disabled` input does not need "cannot be edited"; a red border does not need "this is an error". Helper text earns its place only when it (a) explains a flow the design can't, (b) discloses a non-visible constraint, or (c) is actionable. Default to stronger visual state — opacity, cursor, color, icon, motion — not microcopy.
- **Newsletter articles: collaborate before drafting.** Do NOT write a full newsletter article without first agreeing with Shivam on angle, dashboards/images, and heading. Two-line confirmation pass minimum. See VOICE-NOTES.md for protocol.

---

## PROJECT IN ONE PARAGRAPH

Myro guides a student through one trustworthy loop: a **Master CV** supplies
confirmed skill evidence; their target role, aspirations, and live job demand
produce honest job matches; then demand-backed learning paths help them close
the next useful gaps. The Myro Score (0–100) reflects the persisted scoring
engine, never a fabricated recruiter or ATS verdict. Learning progress stays
in `skill_assessed_level`; it must not silently change CV evidence,
job-matching, or score truth. Timed Forge XP/session earning is retired:
practice progression is demonstrated by Upskilling quiz clears. Level
thresholds remain a shared legacy scale in
`backend/app/services/forge_service.py` and `frontend/lib/level-thresholds.ts`.

**Tech stack:** FastAPI (backend) · Railway (backend hosting) · Next.js 14 (frontend), Tailwind CSS, Shadcn/ui · Supabase/PostgreSQL (DB) · Vercel (frontend hosting) · OpenRouter API (LLM ranking)

**Architecture deep-dive:** `graphify-out/GRAPH_REPORT.md` (832 nodes, 1247 edges) + `graphify-out/graph.html`

**Beta 1 report:** `docs/beta-testing/2026-05-24-first-beta-testing-report.md` is the canonical fellowship feedback synthesis for both Claude and Codex. It captures what users loved, what confused them, what has already shipped (`e2c7b00`, `4ceab03`), and the shared backlog: CV hub onboarding, mobile usability, trust/privacy/methodology, durable CV delivery, auth recovery, score explainability, and CV version management.

---

## CODING CONVENTIONS

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, Supabase client for all DB ops (no SQLAlchemy/Alembic), `HTTPException` only, 100% test coverage on scoring engine.

**TypeScript:** Strict mode ON, no `any`, functional components only, all API calls via `lib/api.ts`, TanStack Query for server state, Zustand for UI-only state, 375px mobile viewport required.

**Git commits:** `feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope per commit.

**File size:** No file > 300 lines. Split if exceeded.

---

## Codex SKILLS

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

## ENVIRONMENT

- Python venv: `.venv/` (project root) — `source .venv/bin/activate`
- Install deps: `pip install -r backend/requirements.txt`
- Backend dev: `PYTHONPATH=backend uvicorn app.main:app --reload`
- Frontend dev: `cd frontend && npm run dev`

---

## CODEX TWO-AGENT WORKFLOW

| Task type | Best fit |
|---|---|
| Multi-file orchestration, cross-cutting refactors | Codex |
| Mechanical splits / renames once interfaces are agreed | Codex |
| Test scaffolding for new module boundaries | Codex |
| Single-file Python tweaks with clear instructions | Either |

**Shared:** All work on `Develop`. Run `pytest backend/tests` + `tsc --noEmit` + `next lint` before marking complete.

---

## DECISIONS LOCKED

| # | Decision |
|---|---|
| OQ1 | Separate repos. Myro + firecrawl_Supabase stay independent. |
| OQ2 | Token-scoped for user endpoints. Service-role for admin/internal only. |
| OQ3 | Intentional LLM separation. Scraper = local LM Studio. Myro = cloud (OpenRouter→Groq→Gemini). |
| OQ4 | Single canonical scoring. `compute_and_persist_score()` is source of truth. |
| CVJT1 | **CV Playground + Job Tracker + LinkedIn bridge contract is locked.** One active tailored CV per exact `job_id`; deterministic matcher before AI; honest/flexible status flow; immutable submitted-CV snapshots plus application attempts; extension saves/matches/links but editing stays in CV Playground. Canonical memory: `~/.claude/projects/-Users-incognito-True-Yodha/memory/project_cv_playground_linkedin_tracker.md`. |
| S3 | `job_applications.status = 'pending'` means saved/targeted. Every saved job is an intended application. |
| S4 | Intel is ephemeral. Skill targets inferred from saved jobs only. No DB writes. |
| NU1 | Profile auto-provisioned from JWT email + user_metadata.full_name on first authenticated request. Admin client (bypass RLS). |
| NU2 | `update_profile` UPSERTs (defensive). |
| XP1 | XP is permanent — never resets. Wallet the user owns forever. |
| XP7 | Cart is ephemeral Zustand state until diary submit → snapshot as `daily_logs.cart_skills JSONB`. |
| XP9 | Company tab selection reconfigures the WHOLE Mission Control page. |
| XP10 | XP pricing modal is deferred. Pick it up only after XP fairness fixes and the single "How XP Works" modal are shipped. |
| PV1 | **Privacy-first identity.** Myro collects minimum data — only email + password. Any email works (throwaway, alias, anything). No real name required. No forced identity. The share token IS the user's public identity, not their name/email. |
| IH1 | **Intel heatmap = followed companies only.** User builds their own heatmap by starring companies. Empty state on first visit. No global defaults in heatmap. |
| IH2 | **Follow cost: 10 XP. Floor: -30 XP. Cap: 10 companies.** XP burned on follow, never refunded on unfollow (XP1). Star disabled if cap hit OR next deduction would breach -30. |
| IH3 | **Per-company row queries.** Each heatmap row is an independent `useQuery` keyed on `(company, skills)`. Adding a company appends a row without re-fetching others. |
| IH4 | **Heatmap columns = user's CV skills always.** No global top-8 fallback. Skill Lens toggles which CV skills appear. If no CV uploaded → nudge to upload. |
| IH5 | **Row ordering = most recently starred first** (`created_at DESC` from `followed_companies`). |
| SH1 | **Ninja Name = vanity slug** as the public profile ID. `user_profiles.ninja_name TEXT UNIQUE NOT NULL`. Charset `^[a-z0-9-]{3,32}$`. The codename IS the share URL: `/profile/{ninja_name}`. Aligns with PV1 — user controls disclosure, no real-name leakage. |
| SH2 | **Onboarding step is skippable with auto-generated default.** `silent-fox-9k2` pattern (adjective + noun + 4-char suffix). User can accept, retype, or skip → keep default. Zero abandonment risk. Editable later via Settings. |
| SH3 | **Domain Map is the share artifact — fully public, never blurred.** The 12-domain radar from `/skills`, the Myro Score number, the tier label, and aggregate activity counters (forge/diary/tracker counts) are public. Skill names, skill levels, CV, tracker rows, and email NEVER leak through the public surface. |
| SH4 | **Ghost radar is the conversion mechanic.** Logged-out viewer sees an outline-only radar beside (desktop) / below (mobile) the ninja's, with a single `+` icon center and tiny `unlock` label. Whole shape is a single clickable target → `/signup?ref={ninja_name}`. Logged-in viewer with own radar sees their radar overlaid instead of the ghost. |
| SH5 | **Job overlap rows are the logged-in-only accountability surface.** Compact rows of jobs both users have saved (`job_applications.status IN saved/applied/screening/interviewing/final_round`). Max 3 rows, sorted by viewer's own match%. Hide section silently when no overlap. Symmetric — owner doesn't see viewers. |
| SH6 | **Web Share API + auto-OG image** is the share affordance. Single `↗` icon on `/skills` top-right. One tap → native share sheet (WhatsApp first on India mobile). Link unfurls with PNG of the ninja's radar shape + score via `app/profile/[ninja]/opengraph-image.tsx`. Desktop fallback = copy-to-clipboard. No custom share modal. |
| SH7 | **Referral attribution = cookie + permanent DB column.** `myro_ref` cookie 30d TTL set from `?ref=` query. Signup handler resolves cookie → `user_profiles.referred_by_user_id UUID REFERENCES auth.users(id)`. v2 XP credit = single trigger on `welcome_xp_granted` flipping TRUE AND `referred_by_user_id IS NOT NULL`. Self-referral guard. No referrals_log table in v1. |
| SE1 | **Skill-edit creates a NEW `baseline_upload` row.** Baselines stay immutable (Git-commit invariant). `latest_baseline()` returns the new one. |
| SE2 | **Bullet locator = text-match first occurrence (A) + multi-match picker (C).** If >1 verbatim/substring match, router answers 409 with candidates; frontend renders picker; retries with `(section_hint, item_index, bullet_index)`. |
| SE3 | **Skill diff = sync keyword drop (D-sync) + async full LLM re-tag (D-async).** Sync: drop skills whose display_name + evidence_text no longer occur in new body_text. Async: `parse_cv_text` → `record_cv_score` via FastAPI BackgroundTasks. |
| SE4 | **Modal blocks until sync save returns** (~200ms). Score ring shimmers (`tm-score-pulse`) while async runs, via `useRecomputeStore.pendingBaselineId`. |
| SE5 | **Editor scope = single bullet only.** Add-new-bullet + structured editor stay in `/cv`. |
| SE6 | **Skill keyword guard = soft inline hint** when `display_name` not in textarea. Non-blocking. |
| SE7 | **Reference text = greyed mono block under textarea.** No diff view. |
| SE8 | **Ledger title = `Master CV · skill edit · {Skill display name}`.** Orphan baseline (no `parent_version_id`) per existing CVVersionWriteSpec invariant. |
| SE9 | **Tailored versions stay parented to OLD baseline.** No auto-migrate on new baseline. |
| SE10 | **Skill cards stack one-per-row in the expanded domain panel.** No more 200px grid; full width, single column. |
| SE11 | **Card content (top → bottom):** name + L·{Gap/Building/Strong} pill → progress bar → `HOW TO REACH {NEXT_TITLE} (L{n+1})` descriptor → CV pointer as boxed mono `<pre>` → 3 action buttons. |
| SE12 | **3 equal-weight full-label buttons.** Edit CV pointer · Polish with AI · Track in diary. |
| SE13 | **No tap-toggle.** Descriptor + CV pointer always rendered (CV pointer has its own dedicated panel). |
| SE14 | **Mobile (<480px) = icons only.** Labels hidden via `.tm-skill-card-action-label { display: none }`. Buttons keep `aria-label` + `title`. |
| SE15 | **Editable sections = bullets, summary, skills_line, certs.** Education routes to `/cv` (disabled fallback). |
| SE16 | **Backend endpoint = `POST /cv/skill-edit`.** Body `{skill_key, new_text, section_hint?, item_index?, bullet_index?}`. 409 on multi-match with candidate list. |
| SE17 | **Async completion signal = `cv_versions.recompute_finished_at`.** Frontend polls `GET /cv/skill-edit/recompute-status/{baseline_id}` every 3s, cap 30s, clears `useRecomputeStore` + invalidates `userSkills`/`scores` queries. |
| GCS1 | **Growth Command Center = one human-first system of record.** Need signals, canonical content, review-gated distribution, publications, attribution, and product activation share one generic growth model. The standalone distribution tracker becomes an imported legacy cockpit, not the database. North star = useful product activation, not content volume or impressions. |

---

## DB SCHEMA (key tables)

- `user_profiles`: `xp_balance INTEGER`, `welcome_xp_granted BOOLEAN`
- `daily_logs`: `cart_skills JSONB NOT NULL DEFAULT '[]'`
- `forge_sessions`: `(id, user_id, skill_name, skill_id, level_before, level_after, sessions_toward_next, duration_minutes, xp_earned, completed_at)`
- `user_skills`: `forge_sessions_count INTEGER NOT NULL DEFAULT 0`
- `job_skills (job_id FK→jobs, skill_id FK→skills, is_primary BOOLEAN)` — canonical skill source
- `followed_companies (user_id, company_name, UNIQUE(user_id, company_name))` — RLS-protected
- `jobs.location_country / location_city / location_mode / location_quality` — all backfilled
- `cv_history.content_hash TEXT` — SHA-256 of raw extracted text for re-upload short-circuit

**Infrastructure (TOPOLOGY — canonical, verified 2026-06-03):**

**Env split policy: Supabase = 1 env (shared) · Railway = 2 (dev + prod) · Vercel = 2 (prod + preview/dev).** Only the DB is single — deliberate: <10k users, want all real user data in one place. Do NOT split Supabase until scale justifies it.

Railway project = **`clever-embrace`** (`a15c0013-…`), ONE Railway environment object `production` (`f6a22e25-…`). The two "environments" (dev/prod) are the two **backend services**, sharing ONE worker + ONE Redis:

| Railway service | Role | Branch | Public URL | Start cmd |
|---|---|---|---|---|
| **`mirror-backend-dev`** (`149a7bdc`) | **DEV API** — ACTIVE (Vercel preview/dev hits this) | `Develop` | `truemirror.up.railway.app` | `uvicorn app.main:app …` |
| **`mirror-backend-prod`** (`6f9d873b`) | **PROD API** — the live backend | `main` | **`https://api.himyro.com`** (custom domain, LE cert) + `mirror-backend-prod-production.up.railway.app` | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| **`True_Yodha`** (`1b3dca5a`) | **WORKER** — durable RQ runner (ADR-0008), 2/2 replicas, NOT an API. **Shared by both dev+prod.** | `Develop` | internal | `python -m app.workers.jobs_compute_worker` |
| **`Redis`** (`7f3503cf`) | RQ queue + global provider budget (ADR-0008), has `redis-volume`. **Shared by both dev+prod.** | — | `redis.railway.internal:6379` | — |

All services = repo `shivam07-hub/True_Yodha`, root `/backend`, builder RAILPACK.

- **Frontend (Vercel project `truemirror`, 2 envs):** Production env → domain **`himyro.com`** (+`www`, +legacy `truemirror.vercel.app`), `NEXT_PUBLIC_API_URL = https://api.himyro.com`. Preview/Develop env → `NEXT_PUBLIC_API_URL = https://truemirror.up.railway.app` (dev backend). (Prod cutover from `truemirror.up.railway.app`→`api.himyro.com` done 2026-06-03.)
- **Request chain (prod):** `himyro.com` → `api.himyro.com` (mirror-backend-prod, `main`) → Supabase + Redis; heavy LLM jobs → Redis → `True_Yodha` worker.
- **Shared-infra couplings (known, accepted at this scale):** (a) dev + prod jobs share ONE Redis queue + ONE `llm:budget:slots` bucket — a dev test upload competes with prod traffic. (b) Worker tracks `Develop` while prod API tracks `main` → prod jobs are processed by slightly-ahead worker code. Full per-env isolation (separate Redis + `api-dev.himyro.com`) is documented but NOT built — see `docs/runbooks/railway-dev-main-env-split.md`.
- **Supabase: `gipvxuugajkugntwkeiz` — ONE DB, shared by both dev+prod backends + worker.** A dev-env test upload writes to prod Supabase. Single by design (see policy above).
- **CORS:** `ALLOWED_ORIGINS` is live exact-origin configuration. Production startup rejects missing, wildcard, malformed, or non-HTTPS values; configure only the frontend domains assigned to that backend service.
- **DNS:** himyro.com on **GoDaddy**. `api` = CNAME → `rm336p0v.up.railway.app`; `_railway-verify.api` = TXT `railway-verify=<token>` (**single** prefix — a doubled `railway-verify=railway-verify=…` blocks cert issuance; cost real time 2026-06-03). Railway custom-domain cert needs BOTH records verified or it serves wildcard `*.up.railway.app` → TLS name mismatch → curl 000.
- **Railway mgmt = MCP** (`mcp__railway__*`). Pass **snake_case `service_id`** or reads default to the linked service. `remove_service` confirm-boolean is broken via MCP → final service deletion needs a dashboard click.
- **Cutover runbook:** fix DNS → wait cert green (`curl api.himyro.com/health` = 200, not 000) → THEN flip Vercel env + redeploy → verify → only then touch the old service. Flipping Vercel before cert live = outage.
- **LLM chain:** OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid.

---

## OPEN BACKLOG

10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.

11. **Forge widget v2 (deferred, 2026-05-19 design pass):**
   - **Cycle counter** — show "cycle N" badge on widget; track sessions completed in a single login window.
   - **Long-press dismiss** — `×` requires 600ms press when mid-session w/ unclaimed XP; prevents accidental loss.
   - **Haptic equivalent** — scale-pop + soft glow burst on successful claim; navigator.vibrate(10) on mobile PWA.
   - **Streak multiplier** — N consecutive claimed cycles in a session = ×1.25/×1.5/×2 XP multiplier badge; resets on dismiss or 30min idle.
   - Pick up when v1 forge widget has been validated by real usage signals (claim rate, dismiss rate, return-to-forge rate).

12. **Multi-location targeting (parked 2026-05-21):** Allow up to 3 target locations in onboarding StepRole. Requires full-stack change — DB migration (`target_location TEXT` → `target_locations TEXT[]` + `target_location_countries TEXT[]`), RPC `get_candidate_job_ids_for_skills` to accept array + OR across countries, repository `_filter_job_ids_by_location` rewrite, backfill existing users. Mobile UI ready (chip multi-select pattern). Path A (UI lies, only first city filters) rejected on design-over-words rule. Pick up when single-location matching quality is validated and multi-loc backlog signal is real.

13. **B2B recruiter + referral platform phase 2 (parked 2026-07-03):** The frontend slice is closed for now: public recruiter/referral doors + workspace previews + auth-ready app routes are shipped. Remaining work is the real productization layer, not session cleanup.
   - **Role / auth model** — define recruiter vs referral vs internal-ops access, nav visibility, and post-login routing. Today the workspaces are UI-ready, but not role-gated.
   - **Recruiter persistence** — add real JD posts, saved briefs, shortlist actions, pipeline stage writes, and recruiter-side activity history.
   - **Referral persistence** — add warm-path records, connector ownership, intro-status updates, reward ledgering, and repeat-loop visibility.
   - **Mirror dataset contract** — wire the B2B side to the same canonical candidate skill graph as B2C, with L2-cluster-only comparison as the first-pass rule.
   - **Matching engine** — replace demo shortlist math with backend CV↔JD scoring, evidence extraction, and top-3/top-4 recruiter handoff logic.
   - **Go-live rule** — do not pick this up again as “frontend polish.” Next pickup should be a full-stack B2B PRD / plan with DB, API, auth, and ranking scope agreed first.

15. **Learning Ladder content foundation (important product backlog, policy revised 2026-07-27):** Myro's comprehensive learning product follows live job-market demand. After scrape/verifier refreshes, the demand snapshot ranks which missing L1–L5 ladders should be built next. Expand toward roughly 50–60 useful skills × five levels × 10–12 questions per level.
   - **Comprehensive ladder contract:** an available skill is comprehensive when L1–L5 each have at least 10 servable questions. The 50–60 skill figure is a catalog-growth target, not a gate that hides complete ladders or requires “partial”/“beta” user-facing labels.
   - **Source-grounded serving:** an active question may serve without human review when it has a legitimate non-empty source URL, valid four-option answer structure, and a useful explanation. Source-less, malformed, unexplained, retired, or verifier-failed content remains unavailable.
   - **Quality metadata:** preserve source provenance, licensing posture, reviewer, verification date, per-option rationales, and immutable editions when available. Human review and counsel guidance improve quality later; they are not pre-10k serving dependencies.
   - **Publication workflow:** market demand → source ingest → normalize/dedupe → assign L1–L5 → explain → independent verification → activate. Corrections and retirement must not rewrite prior attempt history.
   - **Learning truth boundary:** ladder progress stays in `skill_assessed_level` and must not silently change CV-derived `user_skills`, Myro Score, or job matching. Personalized ladder routing follows once a relevant complete ladder exists.

16. **Production read capacity and speed (important performance backlog, order TBD 2026-07-22):** Preserve speed as a first-class product requirement after the perceived-speed frontend work. The remaining problem is backend queueing under concurrent reads, not cosmetic loading states.
   - **Known evidence:** a real browsing burst made many otherwise-successful endpoints complete together after roughly 5–6 seconds, while `/jobs/analytics` reached 22–25 seconds. CPU stayed nearly idle, pointing to blocked AnyIO/Supabase connection capacity rather than compute saturation.
   - **Measure first:** establish reproducible concurrent-load tests for login bootstrap, company browsing, and expensive analytics; capture p50/p95/p99 plus threadpool, HTTP connection-pool, Supabase pooler, and database wait signals.
   - **Fix order:** verify the Supabase pooler ceiling before raising application pools; then remove hot synchronous reads from the AnyIO threadpool and tune bounded pools. Add a replica only if measurements show capacity still requires it.
   - **Regression contract:** `/jobs/analytics` remains off the login path, a company-browsing burst must not stall unrelated identity/score/feed reads, and saturation must page through a real alert destination.
   - **Not a route-by-route patch:** solve the shared read-capacity seam and publish an operational runbook/SLO. Do not add isolated endpoint workarounds that hide queueing.

17. **End-of-beta feedback closure program (shared Codex + Claude backlog, started 2026-07-26):** The canonical machine-readable registry is `docs/beta-testing/closure-ledger/beta-feedback-closure-ledger.jsonl`; the working runbook is `docs/beta-testing/closure-ledger/README.md`. The current evidence state is **113 unverified, 1 open, 0 fixed**. Completed foundations are not equivalent to verified user-facing closure.
   - **Status contract:** `FOUNDATION CLOSED` means reusable audit/test/backend machinery exists; `BUILT NOT LIVE` means implementation exists locally but is not deployed; `PARTIAL` means some flow exists but the reported journey is not proven end to end; `OPEN` means the concern still needs implementation; `VERIFIED CLOSED` requires merged code, passing regression tests, deployed-version evidence, production validation, relevant metrics, affected-user validation where practical, and a closure date in the ledger.
   - **FOUNDATION CLOSED — feedback inventory:** all 113 Supabase beta records plus Usha Bhatiya's separately attributed PDF feedback are registered without merging identities. Direct email/phone identifiers are redacted. Exact stored feedback remains separate from product interpretation.
   - **FOUNDATION CLOSED — evidence gate:** `backend/scripts/export_beta_feedback_ledger.py` preserves human closure decisions and rejects `fixed` without code, deployment, test, metric, user-validation, and closure-date evidence.
   - **FOUNDATION CLOSED — performance measurement:** `backend/scripts/run_read_load_probe.py` and `docs/runbooks/read-capacity-performance.md` cover login, Jobs, CV, company browsing, and isolated analytics with client/server latency, p50/p95/p99, bounded request counts, and explicit production opt-in.
   - **BUILT NOT LIVE — durable feedback delivery:** commit `b78e7bf7` adds UUID `Idempotency-Key`, payload fingerprinting, replay receipts, changed-payload conflict detection, and concurrent duplicate collapse. Migration `20260726182212_feedback_submission_idempotency.sql` is committed but not applied to shared Supabase; the backend commit is not deployed.
   - **OPEN P0 — production loading speed:** establish current baselines, inspect Supabase pooler/database waits plus AnyIO and HTTP connection pools, remove login-path fan-out and hot synchronous reads, keep `/jobs/analytics` isolated, rerun the probe, and satisfy the published SLO under concurrent browsing. Loading skeletons alone do not close this item.
   - **OPEN P0 — feedback submission recovery:** review the backend contract, push/apply/deploy it, then build a persistent IndexedDB outbox that stores the exact payload and UUID before sending, exposes `Saved / Sending / Sent / Needs attention`, safely replays after reload or reconnect, and handles `409` without silently dropping or duplicating feedback.
   - **PARTIAL P0 — CV upload reliability:** resumable upload, deterministic failure codes, fallback tickets, and phase telemetry exist. Closure still requires onboarding/CV-route resume parity, byte-level progress, weak/mobile-network validation, production phase metrics, retry/fallback verification, and affected-user confirmation.
   - **PARTIAL P1 — mobile navigation and next action:** responsive navigation exists, but Jobs, CV, Tracker, Skills, and Learning still need one state-derived next action that survives route changes and does not overwhelm a first-time mobile user.
   - **OPEN P1 — first-time onboarding:** add a skippable, contextual walkthrough for CV upload, score meaning, job recommendations, saved-job tracking, and learning. Instrument completion, skip, abandonment, and time-to-first-useful-action; do not use a long generic product tour.
   - **OPEN/PARTIAL P1 — plain language and progressive disclosure:** audit corporate/technical terms such as baseline, Intel, Forge, level notation, score methodology, and CV version concepts. Prefer familiar student language, disclose necessary constraints in context, and keep advanced detail behind progressive disclosure.
   - **PARTIAL P1 — clear errors, recovery, and tooltips:** standardize actionable errors with retry/resume paths and correlation IDs while keeping sensitive details server-side. Add tooltips only for non-visible constraints, methodology, or unfamiliar concepts; visual state should communicate ordinary loading, disabled, success, and failure conditions.
   - **PARTIAL P1 — CV parsing, tailoring, and score trust:** make parsing state and evidence visible, explain score basis without overstating recruiter/ATS certainty, show before/after tailoring proof, preserve immutable CV versions, and provide deterministic recovery when extraction or recomputation fails.
   - **PARTIAL P1 — Jobs relevance, filters, and Apply handoff:** persist user filters, explain match reasons from stored evidence, distinguish inventory gaps from ranking defects, preserve explicit listing-liveness boundaries, and validate the external application handoff without claiming Myro submitted an application.
   - **OPEN P1/P2 — Learning and Forge relevance:** expose complete source-grounded L1–L5 ladders now, expand the catalog from verified market demand, and later personalize the best available ladder for each user. Learning progress remains separate from CV-derived matching truth. Make the next learning action understandable without gamification pressure.
   - **PARTIAL P2 — Tracker discoverability and post-application guidance:** provide a useful first-run/demo state, make saved/applied status semantics clear, and route outcomes into follow-up, referral, interview preparation, or no-response recovery without fabricating employer activity.
   - **OPEN — deployment and acceptance:** push the currently local backend/docs commits, review the additive migration, apply it only when backend/frontend contracts are compatible, deploy backend and frontend, run authenticated desktop/mobile smoke tests, run bounded load tests, and record exact deployed versions.
   - **OPEN — user validation and ledger closure:** recontact affected users where practical, record whether the original task now succeeds, attach production evidence, and update individual ledger rows. Theme-level confidence never substitutes for row-level closure.
   - **Execution order:** (1) Claude contract review; (2) push local commits; (3) apply migration and deploy backend; (4) build/deploy feedback outbox; (5) measure and repair shared read capacity; (6) close CV/mobile/onboarding/language/error/trust journeys one vertical slice at a time; (7) validate with users and update the ledger after each slice.
   - **Shared-agent protocol:** Claude and Codex may work on any item in this program. Frontend UX defaults to Claude; backend, migrations, performance, and test scaffolding default to Codex. This is coordination guidance, not an exclusive lock. Before editing, each agent must inspect current Git state and recent commits, announce owned files/scope, preserve unrelated work, avoid duplicate implementations, and leave a commit plus verification notes for review.
   - **Handoff rule:** every handoff must state concern/ledger IDs, files and commits, migrations/deployment state, tests and measurements run, residual risks, and the exact evidence still missing for `VERIFIED CLOSED`. Neither agent may mark an item closed based only on local tests, screenshots, copy changes, or another agent's summary.

---

## CLOSED — BACKLOG #14 CAREER OPS × LISTING-VERIFIER PARITY (2026-07-22)

- `santifer/career-ops` remains the one matching brain; the existing Supabase
  verifier remains the one liveness authority. No verifier, schema, or worker
  was added.
- Skill and role candidate selectors now admit only verifier-active listings
  (`is_active = TRUE`, `listing_confidence = 'active'`). Scraper `last_seen`
  never ages a verified-live listing out; role candidates are ordered by
  `last_verified_live_at`.
- `closed`, `likely_closed`, and `uncertain` remain outside recommendations.
  The live confidence-agnostic verifier queue continues to recheck the corpus,
  reserving priority for tracked, shown, and matched jobs.
- Agent Picks now rejects Career Ops' real `suspicious` legitimacy verdict and
  preserves the legacy `scam | ghost | spam` deny-list for historical rows.
- The Apply contract is unchanged: only an explicit closed verdict blocks the
  handoff. Live read-only verification found 1,030 verifier-active listings with
  pre-July scraper markers that the removed age gate would have hidden.

---

## INTEGRATOR ITEMS

### 2026-05-31 - Post-Application Intelligence + Myrology

- **7-day tracker prompt becomes a branch, not a disappointment loop.** Ask "What happened with this application?" and route into Practice:
  - **No Response Recovery:** mark ghosted/no response, preserve dignity, suggest follow-up/referral path, adjacent targets, and skill practice.
  - **Moved Forward:** update stage, generate company-specific interview prep, case-study practice, and next milestone tracking.
- **Practice becomes the central action router** for post-application work: Skill Practice, Referral Route, Interview Prep, No Response Recovery, and Company Intel.
- **Referral Intelligence = premium tactical loop.** Available from saved/applied jobs, strongest after no response. Initial automated unlock = **500 XP**. Output: ranked referral targets, warm-intro plan, and next actions for the target company/job.
- **Referral data-source tiers are locked:**
  - Tier A: API-backed LinkedIn analysis when approved scopes/data access permit.
  - Tier B: user-assisted fallback via pasted LinkedIn URLs, known contacts, or exported contacts.
  - Tier C: Myro repository of opted-in referrers plus founder/HITL company notes.
  - Hard rules: no scraping, no auto-DMs, and no pretending to access LinkedIn graph data that the API does not provide.
- **Company reports split evidence from advice.** Verified Intel = source-backed facts, founder/HITL notes, hiring-process observations, user-submitted outcomes, referrer availability. Strategy Plan = referral target, case-study angle, skills to practice, follow-up message, interview prep.
- **Pricing boundary:** XP buys automated intelligence and prioritization. Cash buys human attention, deeper premium reports, astrologer/founder consultation, and eventually access to the company/referrer network.
- **Myrology stays separate from core Myro.** It is an opt-in premium subbrand, not part of Myro Score or job ranking. The live `/myrology` surface should remain a simple interest/payment/booking funnel, not a live report engine.
- **Myrology report coverage:** career domains, role archetypes, work environments, abroad/relocation indications, timing/dasha windows, strengths, risks, remedies, and reflection prompts. Requires explicit consent for date, time, and place of birth.
- **Two-lens guardrail:** Myrology may suggest career directions, but never overrides evidence-backed CV/skills/market recommendations. If Myro data and Myrology agree, use that as a narrative moment. If they conflict, show them as separate lenses. No guaranteed job/interview/abroad claims.
- **Implementation follow-up:** live code currently treats Myrology as an INR 499 entitlement. Shivam discussed an INR 200-300 intro fee to close the payment loop before increasing price. Resolve pricing before changing checkout/copy.

---

## SKILL INTELLIGENCE PAGE — REDESIGN TRACKER (Backlog #10)

**Phases 1–3 ✅ DONE 2026-05-16** — SkillCard + Log-to-Forge + CV/Intel links · stat-line reframe · `?skill=` deeplink · color-coded domain strip · ScoreRing hero + WeaknessSpotlight · DomainRadar SVG-only · inspector absorbed into radar card · `components/skills/` extraction (page <300 lines). Dead code deleted: `dashboard/domain-drill-dialog.tsx`, `dashboard/domain-radar.tsx`. Full detail in `docs/session-history/2026-05.md`.

**Defer to v2:** domain layer separation · Rename Mirror→Myro in remaining strings · Pillar pages `/careers/*`

**Mobile QA findings (2026-05-21):**
- `domain-accordion-row.tsx:57` — grid template `20px 1fr auto auto 52px 32px` is 6 cols but row has 5 children + 120px progress bar → overflows 375px viewport. "BIGGEST GAP" badge clipped right edge. Fix: trim unused 32px col + cap progress bar to 70px <720px.
- Three stacked control rows (VIEW / SORT / SHOW) eat vertical space. Consider single "Filter" pill opening a sheet, or moving SORT + SHOW into ⋯ menu.
- Above-fold stat line "6 domains · 17 skills · 0 need proof · 3 below 40%" — dense, candidate for 4 mini stat tiles like intel-pane.

**Shareability / Social — Phased:**
- **v1 (next):** Public profile page (`/profile/{token}`) — live Mirror Score + blurred domain breakdown. Invitation-first (viewer prompted to get their own score). Job co-tracking: two users targeting same job/company see each other's readiness % → accountability loop. Reuses `job_applications` data.
- **v2:** Skill peer matching — suggest users with complementary skill gaps (strong where you're weak).
- **v3:** Mentor/mentee — higher Mirror Score users visible to lower-score users in same domain.

**Defer to v3 — Mobile (Play Store):**
- Extract `lib/api.ts` + `lib/session.ts` into platform-agnostic `packages/api-client/` (inject AsyncStorage adapter for RN, localStorage adapter for web)
- Add `/v1/` prefix to all backend routes before mobile launch (versioning contract)
- Mobile auth via Supabase React Native SDK (same backend, AsyncStorage token storage)
- `device_tokens` table (user_id, fcm_token, platform) + `/push/register` endpoint → FCM/APNs for diary reminders + score update push notifications
- React Native app (Expo) targets Android Play Store first, iOS second
- Prerequisite: shareability (public profiles) must ship before mobile — it's the referral hook

---

## MOBILE — v2 NATIVE APK (Backlog #9, v1 PWA ✅ CLOSED 2026-05-19)

v1 PWA detail archived in `docs/session-history/2026-05.md`. v2 kicks off after 1000 PWA users.

### v1.5 — Android APK via TWA (Play Store NOW, ship current PWA — chosen 2026-07-23)

**Decision (Shivam):** ship a Trusted Web Activity wrapper of the existing responsive PWA to the Play Store now — Path A over the full Expo native rewrite (Path B = the v2 section below). Product is 100% mobile-responsive + already has `mobile/redesign/` surfaces; TWA = zero React rewrite, a signed `.aab` in days.

**✅ STEP 1 BUILT + pushed Develop 2026-07-23 (the pre-flight fixes that make TWA install-clean, not read as a webview):**
- **manifest** (`frontend/public/manifest.webmanifest`) — `start_url` `/home`→`/market` (`/home` is the retired Collections-cutover redirect stub → cold launch was a blank screen then JS-redirect; `/market` is the real Jobs landing + mobile nav tab 1); `background_color`/`theme_color` `#050A18` (pre-#28 navy) → `#F9F9F9` (canonical light Firecrawl paper → correct splash + task-switcher brand).
- **maskable icon** (`frontend/public/brand/icon-512-maskable.png`) — was byte-identical to `icon-512.png` (a fake full-bleed dup → adaptive mask would crop the logo). Rebuilt edge-to-edge dark with the signal-dot ring inside the 80% safe zone → survives circle/squircle masks.
- **service worker** (`frontend/public/sw.js` + `frontend/components/pwa/sw-register.tsx`, mounted in providers) — minimal, prod-only: navigations network-first → cached `/offline` shell fallback; hashed static (`/_next/static`, `/brand`) cache-first; cross-origin API (`api.himyro.com`) untouched. Satisfies install criteria + kills the in-app Chrome error page when offline.
- **offline shell** (`frontend/app/offline/page.tsx`) — self-contained inline-styled, theme-aware, noindex (added to `NON_PUBLIC_SEGMENTS` in the ui-drift guard — utility route, not a nav surface).
- **assetlinks scaffold** (`frontend/public/.well-known/assetlinks.json`) — placeholder `package_name: com.himyro.app` + `REPLACE_WITH_SIGNING_KEY_SHA256_FINGERPRINT`. **Without this file the TWA shows the Chrome URL bar → reads as a wrapper.** Chicken-and-egg: keystore → SHA-256 → fill this → publish on himyro.com → THEN build APK.
- Green: tsc 0 · next lint 0 · `next build` ✓ (`/offline` static) · ui-drift clean.

**OWED (Shivam) — the remaining TWA path, in order:**
1. **`main` merge** (this Develop work → himyro.com must serve the fixed manifest + assetlinks + SW before any APK is built against prod).
2. **⚠️ THE REAL GATE = one real-device authed mobile QA pass** — the whole `mobile/redesign/` surface (Jobs/Collections/CV/Prep/Profile) was built+pushed but NEVER eyeballed on a real authed mobile session (sandbox has no token). Must verify before an APK puts the bugs in Play Store reviews: login → **CV upload on throttled 3G** (BUG-2 TUS resumable path — the #1 funnel action) → 4 bottom-nav tabs → #41 login waterfall → PR-F `/skills` 375px (sticky-pill overlap + SE14 icon-only buttons).
3. **Confirm package name** `com.himyro.app` (or pick another reverse-domain).
4. **Generate upload keystore** → take SHA-256 fingerprint → give it to Claude → Claude fills `assetlinks.json` + commits → merge main.
5. **Build:** Bubblewrap/PWABuilder → signed `.aab` → **Play Console ($25 one-time)**.
6. **Native push (FCM)** — the actual retention hook (diary/score/new-match notifications). Needed under TWA too; = v2 prerequisite 3 (`device_tokens` + `POST /push/register`). Do this AFTER install is live, then decide if native shell (Path B) earns its weeks.

---

### v2 — full Expo native (Path B, still gated on 1000 PWA users)

**v2 prerequisites (all must ship first):**
1. `packages/api-client/` extraction with injectable storage adapter (AsyncStorage/localStorage).
2. All backend routes prefixed `/v1/` — versioning contract.
3. `device_tokens` table + `POST /push/register` — FCM/APNs.

**v2 layout:** `mobile-native/` sibling folder (Expo SDK 51+ TS), NOT inside `frontend/`. Native libs land only in `mobile-native/package.json` (Expo-on-Next bundler pollution = Vercel break).

**Decisions still open:** monorepo tool (lean turborepo), auth flow (deep-link vs `expo-auth-session`), diary push cadence (8pm local default), Android-first.

**Open deepenings:**
- ⏸ `<ResponsiveStack>` primitive — DEFERRED. Trigger: any new page adding 4+ `tm-<page>-*` class hooks.
- `packages/mobile-shared/` extraction — blocked on `packages/api-client/` + turborepo decision.

---

## ACTIVE MEMORY SOURCES

Read `docs/agent-memory/CURRENT.md` before topic-memory files. It is the
cross-agent retrieval contract; code, live schema, and deployed evidence still
win when they conflict with a note. Historical session transcripts were removed
from this file because they caused retired implementation details to be read as
current instruction. Use Git history or the shared memory graph only when a
historical decision is specifically relevant.
