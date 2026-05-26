# MYRO — AGENTS.md (Cockpit)
### Session Control File · v5.0 · May 2026

---

## SESSION START RITUAL

1. Read this file top to bottom
2. State your full plan for today and wait for "yes / proceed / go ahead"
3. Work one task at a time — commit after each completed task
4. Before ending: update **Last Session Summary** below

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

Myro is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills extracted + matched against global skill taxonomy (L1–L5) → top 5 job matches found by skill overlap + LLM-ranked → top 3 recommended with explanations → Myro Score (0–100) computed across 10 domains → user sees score, domain breakdown, top 3 jobs, top 5 skill upgrades. XP economy: welcome grant 3000 XP on CV upload (testing inflation 2026-05-21, was 1000), +50 per forge session, +30 per diary entry. Skill levels advance via forge session counts (L0→L1=1, L1→L2=3, L2→L3=9, L3→L4=27 sessions; 25 min/session). Source: `backend/app/services/forge_service.py:LEVEL_THRESHOLDS` ↔ `frontend/lib/level-thresholds.ts`.

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

**Infrastructure:**
- Railway: `True_Yodha` → `Develop` → auto-deploy
- Vercel: `truemirror.vercel.app` → `main`
- Supabase: `gipvxuugajkugntwkeiz` (prod DB)
- LLM chain: OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid

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

## CLOSED — DEFERRED v2 NOTES

- **Shareability v2** — XP-for-referral trigger on `welcome_xp_granted = TRUE AND referred_by_user_id IS NOT NULL`. `referrals_log` analytics table. Mentor/mentee surfacing. Public profile theming. (v1 closed 2026-05-19; archive in `docs/session-history/2026-05.md`.)
- **Process Transparency v2** — see `docs/session-history/2026-05.md` for v1 plan + v2 deferred list.

---

## PARKED OPEN QUESTIONS (from graphify refresh 2026-05-18)

Park-and-solve list. Pick up when working in the related area. Source = `graphify-out/GRAPH_REPORT.md`.

### Cross-community bridge nodes (high betweenness — verify intentional coupling)

2. **`ScoresRepository` — betweenness 0.057.** Bridges 5 communities (CV Upload, CV Compose Hub, Tracker, Job-Skills RPC, LLM Overlap). Solve when: refactoring repository layer or splitting scoring concerns.
3. **`fetch_all_rows()` — betweenness 0.033.** Bridges `CV Compose Hub` → `Tracker Endpoints` → `Job-Skills RPC` → `Lightcast Backfill`. Solve when: query-pattern review (likely a fetch-all hotpath worth specializing).

### INFERRED-edge audit (LLM-guessed connections — confirm or prune)

4. **`JobsRepository` — 30 INFERRED edges.** Sample: `Q7: snooze the 7-day stale prompt by bumping last_stage_changed_at = now()`, `Fire-and-forget: compute first 5 matches after CV upload`. Solve when: touching `repositories/jobs.py` or stale-clock logic. Audit during Backlog #8 (Process Transparency Layer).
5. **`ScoresRepository` — 47 INFERRED edges.** Largest INFERRED footprint. Solve when: scoring refactor.
6. **`CVRepository` — 18 INFERRED edges.** Sample: `CVTextRequest`, `EducationItem`. Solve when: working on CV Builder v2 surface.

### Refresh hygiene

8. **Graphify doc/image refresh deferred.** AST-only update on 2026-05-18 skipped 306 docs + 38 images. DMMT screenshots, design references, and markdown notes still reflect May 13 snapshot. Solve when: budget allows full `--update`, OR when working on landing-page / DMMT-design surfaces, run scoped LLM pass on `frontend/Black_futuristist_frontend/project/uploads/` + repo-root markdown.

### Architecture (deferred deepenings)

10. **Extract `useCVPlayground(jobId)` hook for CV Builder state.** `app/cv/page.tsx` owns scattered `useState` + derivations for the playground state machine: `playgroundDirty`, `selectedVersionId`, `hiddenItems`, edit/polish targets, sync detection. Currently all complexity is local to one page, so the locality gain is moderate. Solve when: a second consumer needs to ask "does the user have unsaved CV changes?" (nav-away warning, mobile preview surface, share-token preview, etc). Today's recommendation: wait for the second consumer before deepening.

---

## LAST SESSION SUMMARY (2026-05-26 - Job Refresh reliability + Jobs card parity)

Closed the refresh-match incident and aligned Jobs card UX with Mission Control card language in one production-hardening slice:

- **Root cause fixed (schema drift):**
  - Added `database/migrations/20260526_user_job_matches_weekly_uniqueness.sql` to reconcile `user_job_matches` uniqueness with the weekly cache contract.
  - Migration now drops any legacy UNIQUE constraints/indexes on `(user_id, job_id)` via catalog introspection (name-agnostic), preserves weekly uniqueness `(user_id, job_id, batch_week)`, dedupes drift rows safely, and reloads PostgREST schema cache.

- **Write-path contract aligned:**
  - `backend/app/services/llm_ranker.py` keeps weekly upsert key and now defensively dedupes repeated `job_id` rows before write.
  - `backend/app/repositories/jobs.py` `upsert_job_match()` now uses `on_conflict=\"user_id,job_id,batch_week\"` so all match writes follow one canonical key.

- **Overlap read-path hardened:**
  - `backend/app/routers/profile/public.py` now prefers current-week match scores first, with ordered historical fallback only when needed.

- **Jobs page card parity shipped (design consistency):**
  - `frontend/components/jobs/JobCard.tsx` redesigned to mirror Mission/Home control card vocabulary and structure:
    - Focused-on header
    - Large Fit score + fit bar
    - Apply row
    - matched skills chips
    - Why-this-fits (LLM) block
    - Tailor CV + Save + Open role actions
  - Match-retained metadata (location/mode/industry/rank/explanation/skills/description/source) is now surfaced directly in each Jobs card.

Validation:

- `.venv/bin/pytest backend/tests -q` → `383 passed`
- `cd frontend && npx tsc --noEmit` clean
- `cd frontend && npm run lint` clean
- `git diff --check` clean

Unrelated workspace state still present and untouched: `CLAUDE.md`, `docs/session-history/2026-05.md`, plus `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-26 - Backlog #17 PR1/PR2 shipped)

Closed both requested Color Theory slices from Backlog #17 in two commits:

- **PR1 (split + alias bridge)** shipped via `588f922`:
  - Added `--tm-brand` and `--tm-interactive` token families in `frontend/app/design-tokens.css`.
  - Kept legacy compatibility by aliasing `--tm-accent*` to interactive tokens so existing UI compiled with zero breakage.
  - Exposed new token names in `frontend/tailwind.config.ts`.

- **PR2 (ramp migration + leak cleanup)** shipped in this session:
  - Added interactive ramp (`--int-01..09` + `--tm-int-*` aliases), OKLCH status ramps, and `--data-1..6` viz palette in `frontend/app/design-tokens.css`.
  - Migrated frontend component usage from raw `--tm-accent*` references to interactive/ramp tokens.
  - Replaced literal cyan leaks (`#00F5D4`, `rgba(0,245,212,...)`) across frontend with semantic tokens.
  - Reassigned milestone-complete visuals to success tokens (e.g. Market step chips, Milestone cards, RightRail achievement chips).
  - Moved chart/radar surfaces to `--data-*` where applicable (Market sparkline/heatmap, radar overlays, score rings/gauges, newsletter chart bars, mission-control sparkline).

Validation:

- `bash "Myro Newsletter/brand-guidelines.skill/validator/lint-color.sh" frontend` → both checks pass (`5-i`, `5-ii`)
- `.venv/bin/pytest backend/tests -q` → `378 passed`
- `cd frontend && npx tsc --noEmit` clean
- `cd frontend && npm run lint` clean
- `git diff --check` clean

Unrelated workspace state still present and untouched: `CLAUDE.md`, `docs/session-history/2026-05.md`, plus `docs/free-llm-api-resources/` local/untracked.

### Brand-guidelines wiring — CLOSED 2026-05-26

All three integration carry-over steps are done:
1. **Pre-commit hook (Codex)** — `.git/hooks/pre-commit` execs `Myro Newsletter/brand-guidelines.skill/validator/pre-commit.sh`.
2. **CI workflow (Codex)** — `.github/workflows/brand-check.yml` copied from the skill's `validator/ci.yml`; gates PRs to Develop + main.
3. **Dependent-skill frontmatter (Claude)** — every weekday newsletter skill + page-anatomy + voice-and-anti-slop + seo-and-distribution + `myro-newsletter.skill` + every `growth-agent/` file carries `reads: brand-guidelines` in frontmatter. Any new LinkedIn/X/Instagram drafting skill must add the line at creation.

Validator now active at all 3 checkpoints. Drafts that bypass it require `--no-verify`, which is forbidden by CLAUDE.md absolute rules.

## OLDER SESSION SUMMARY (2026-05-26 - CV Library vocabulary pass)

Closed the open CV-builder vocabulary blocker that was holding the onboarding discovery layer behind "PR2 vocab swap":

- Used `design-an-interface` with parallel interface sketches plus the `/grill-me` rule to verify the product direction from code/backlog context instead of adding a broad redesign.
- Reframed `/cv` around a familiar document-library model:
  - "commit graph" / branch language → **CV Library** / tailored CV
  - "baseline CV" in user-facing copy → **Main CV**
  - "Save commit" / "version" labels → **Save copy** / saved copy
  - small global labels like `CV v16` → `Copy 16`
- Replaced visible git branch/commit icon usage in the CV builder with folder/save icons while preserving the existing immutable `cv_versions` backend model.
- Updated CV formatter tests so future UI copy regressions keep the student-friendly labels.
- Marked the CV-builder slice as shipped in the canonical beta report while leaving the broader Lightcast/Forge/Intel/Ninja Name vocabulary pass open.

Validation:

- `cd frontend && npx tsx --test tests/cv-version-picker-labels.test.mjs tests/cv-version-ledger.test.mjs tests/cv-baseline-display.test.mjs` → `11 passed`
- `cd frontend && npm run lint` clean
- `cd frontend && npx tsc --noEmit` clean
- `.venv/bin/pytest backend/tests -q` → `378 passed`

Unrelated workspace state still present: `CLAUDE.md` and `docs/session-history/2026-05.md` modified by Claude/onboarding work, plus `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-26 - CI stability hotfix: CV upload + feed timestamp)

Closed the GitHub CI failure set (6 failing tests) with root-cause fixes and regression coverage:

- Fixed CV upload rate-limit fail-open behavior in `backend/app/services/cv_workflow.py` by moving `get_supabase_admin()` inside the existing `try` block in `_enforce_user_upload_rate_limit()`. Missing Supabase env in CI no longer crashes request handling before validation.
- Hardened startup sweep in `backend/app/main.py` to skip orphan-job sweep when Supabase URL/service key are not configured, removing noisy startup exceptions in test/CI contexts.
- Fixed feed timestamp cache cold-start edge case in `backend/app/repositories/jobs.py`: `(0.0, None)` now behaves as an uninitialized cache sentinel instead of a warm cache hit (which previously could return `None` on fresh CI runners with low monotonic uptime).
- Added regression tests:
  - `test_submit_text_rate_limit_fail_open_when_supabase_unavailable` in `backend/tests/test_cv_upload_api.py`
  - `test_get_feed_updated_at_refreshes_when_cache_timestamp_is_zero` in `backend/tests/test_jobs_list_router.py`

Commit:

- `a7c63c4 fix: harden upload rate-limit and feed timestamp cache`

Validation:

- `SUPABASE_URL='' SUPABASE_ANON_KEY='' SUPABASE_SERVICE_KEY='' pytest backend/tests -q` → `378 passed`
- `.venv/bin/pytest backend/tests -q` → `378 passed`
- `cd frontend && npm run lint` clean
- `cd frontend && npx tsc --noEmit` clean

Unrelated workspace state still present: `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-25 - beta closure batch: skills/intel/cv discoverability)

Shipped the selected fixed-scope closure batch for beta feedback, with explicit architecture seams for durability and report-status updates:

- Closed **Skills route gate** with surface-specific no-CV states (`missing | processing | failed`) and clear next actions (`/skills` now preserves Skills context): `e294afd`.
- Closed **CV version discoverability + save confidence** by adding a visible Version Directory entry and durable write receipts for save/polish/edit actions in CV Builder: `b72f04d`.
- Closed **Intel prerequisite resilience** by adding `cv_readiness` + latest upload metadata to `/users/me` and rendering an explicit prerequisite card on Intel when personalization is unsafe: `afaed26`.
- Closed **mobile Skills row overflow regression** for 375px-class layouts by hardening domain accordion grid/width constraints and clipping behavior: `9605f3b`.
- Updated canonical beta report with a new closure tracker section in `docs/beta-testing/2026-05-24-first-beta-testing-report.md` (`D.5 Closure Tracker Update`) so solved/open items are visible and auditable.

Validation:

- `.venv/bin/pytest backend/tests` 371/371 pass
- `cd frontend && npm run lint` clean
- `cd frontend && npx tsc --noEmit` clean

Render QA notes:

- Browser runtime navigation/DOM/console checks ran, but Browser screenshot capture is currently timing out at runtime (including non-localhost pages).
- Playwright fallback screenshots confirm `/market` and `/skills` in this local session are auth/splash-gated without an authenticated test user, so full interaction QA on newly shipped gated states remains partially blocked in this environment.

Unrelated workspace state still present: `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-25 - Razorpay checkout auth + reliability hardening)

Shipped a production-grade hardening pass for Razorpay Standard Checkout after live `POST /api/create-order` failures on Railway:

- Root-cause validated: provided Razorpay test credentials are valid against Razorpay Orders API; failure path was integration handling/deploy-config sensitivity.
- Hardened `backend/app/routers/payments.py`:
  - Added credential normalization (trims whitespace/accidental wrapping quotes) before auth/signature usage.
  - Mapped Razorpay auth failures to `401 Unauthorized` (was `502`) for deterministic operator signal.
  - Added network-failure mapping to controlled `502` with stable message.
  - Added SDK retry config + order request timeout (`RAZORPAY_ORDER_TIMEOUT_SECONDS=12`).
  - Moved blocking Razorpay + Supabase payment calls off the async event loop via `run_in_threadpool` in create/verify paths.
  - Added structured logging on create-order failure modes without leaking secrets.
- Updated `backend/tests/test_payments_router.py`:
  - Auth failure contract updated to `401`.
  - Asserted create-order timeout is passed through to Razorpay SDK.
  - Added regression test for quote/space-trim credential normalization.

Commit: `b30da1c fix: harden razorpay checkout auth and runtime flow`

Verify: `.venv/bin/pytest backend/tests` 369/369 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `git diff --check` clean. Existing unrelated dirty state remains: `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-25 - enterprise CV upload hardening + fallback rail)

Shipped the first enterprise-scale reliability slice for the upload incident and mobile settings overflow regression:

- Hardened the CV upload state machine with deterministic failure codes and retryability semantics (`CVUploadFailureBase` now carries `code`, `retryable`, and `phase`), including transient poll retry handling and terminal `poll_timeout` / `poll_network_interrupted`.
- Added strict client preflight before network upload (`empty_file`, `file_too_large`, `unsupported_format`) with canonical MIME/extension normalization reused by both `/cv` and onboarding upload flows.
- Upgraded upload transport resilience in `frontend/lib/api.ts`: multi-attempt retry/backoff, idempotency-key persistence, resume-safe job persistence, and no state wipe on retryable interruptions.
- Added end-to-end CV upload telemetry pipeline (`pick` → `signed-url` → `put` → `poll` → `parse`) via `POST /v1/telemetry/cv-upload-phase`, with structured failure metrics and rolling failure-rate alert emission.
- Added fallback assignment submission rail: new `POST /cv/upload/fallback`, DB-backed fallback tickets (`cv_upload_fallback_requests`), support token issuance, and alternate submission URL return.
- Added migration `database/migrations/20260525e_cv_upload_observability_and_fallback.sql` to provision telemetry and fallback tables with indexes + RLS policies.
- Fixed iOS mobile settings overflow by forcing single-column modal behavior on small/coarse-pointer devices and tightening overflow constraints.
- Updated beta report and code surface to expose alternate submission path in the CV upload modal after repeated failures.

Verify: `.venv/bin/pytest backend/tests` 368/368 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `cd frontend && npx tsx --test tests/cv-file-detect.test.ts tests/cv-upload-state.test.ts` pass · `git diff --check` clean.

## OLDER SESSION SUMMARY (2026-05-25 - beta batch 5 urgent upload + mobile regressions)

Integrated the newest 25 May intake into the canonical beta report at `docs/beta-testing/2026-05-24-first-beta-testing-report.md` as **Appendix D**.

- Added urgent escalation context: user retried CV upload 5+ times across files/networks and still hit `"Upload was interrupted"`.
- Captured deadline risk explicitly (Intel assignment due **2026-05-26**) and logged need for an alternate submission fallback when upload repeatedly fails.
- Added screenshot-backed findings from `reference/User issues_25th May/`: repeated Android upload interruption and iOS mobile settings/feedback/billing overflow/clipping regression.
- Added immediate backlog deltas (incident re-open, fallback submission rail, retry transparency, phase telemetry, iOS modal fix, upload format contract).
- Added prioritized "Top Coding Fixes To Ship Next" list (8 items) for near-term execution.

Verify: `.venv/bin/pytest backend/tests` 364/364 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `git diff --check` clean.

## OLDER SESSION SUMMARY (2026-05-25 - repo docs + licensing)

Added top-level repository hygiene and contributor onramp docs:

- Added `LICENSE` (MIT, 2026 Shivam).
- Rewrote `README.md` to clearly explain what True_Yodha is, why it exists, how to run it locally (backend, worker, frontend), and where to look for deeper docs.
- Added `CONTRIBUTING.md` with dev setup, required checks, branch/PR conventions, and code-style expectations.

Verify: `.venv/bin/pytest backend/tests` 364/364 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `git diff --check` clean.

## OLDER SESSION SUMMARY (2026-05-25 night - beta batch 4 feedback memory)

Added the latest user feedback into the canonical beta report at `docs/beta-testing/2026-05-24-first-beta-testing-report.md` as Appendix C. Preserved the high-signal themes: `/skills` should not feel like a generic CV upload page when gated, `/intel` mobile loading reads as stuck when "Fetching open jobs..." persists, `/tracker` needs a guided/demo empty state, first-run onboarding is still missing, CV hub value is strong if upload/scoring reliability holds, mobile performance needs route-by-route attention, separate CV version storage is unclear, save/edit confirmations need stronger micro-interactions, and template/layout customization is a retention lever.

Added the second wave of same-session feedback into Appendix C as C.4-C.8. Newest signals: the CV hub is still easy to understand and useful for multi-application users, but CV Hub vs Job Intelligence takes a few seconds to click; scoring needs to say whether it is ATS/AI/recruiter-based or a blend; users want real before/after tailoring examples; mobile public pages are text-heavy and create long-scroll fatigue; trust proof needs to appear earlier; one honest skeptic sees LinkedIn/Internshala as easier and more complete; freshers need `Create New CV` / `Build CV from Scratch`, not only upload; upload still failed for one fresher with a 106 KB PDF and JPG; BetterCV charged INR 195 for PDF download, which is an important competitor wedge for Myro's CV onboarding/export strategy.

Threaded the same signals into the main concerns and priority backlog: route-specific gates, skippable first-run walkthrough, mobile time-to-useful-content audit, progressive loading shells, CV version directory, save confirmations, score-basis clarity, visual proof, before/after tailoring demos, fresher CV creation, BetterCV/LinkedIn/Internshala differentiation, and resume customization. Existing unrelated dirty state remains: `docs/free-llm-api-resources/` local/untracked.

Verify: `git diff --check` clean · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `.venv/bin/pytest backend/tests` 364/364 pass.

## OLDER SESSION SUMMARY (2026-05-25 night - onboarding target-company setup)

Shipped the first onboarding-priority slice on `Develop`: CV upload/text capture now moves to role targeting first, saves target roles/location, then starts CV extraction in the background while the user chooses target companies. Added a new `StepCompanies` onboarding screen that reuses the Market follow/star company contract (`followed_companies`, 10 XP follow cost, 10-company cap) so a first-time user's Market heatmap is seeded before they arrive there.

Design direction followed the referenced LinkedIn + Resend screenshots: focused enterprise setup pane, compact search/selection surfaces, status strip for background CV analysis, responsive 375px mobile stack, and a direct "Change CV" recovery action if extraction fails. Added pure helpers + tests in `frontend/lib/onboarding-company-selection.ts` and `frontend/tests/onboarding-company-selection.test.ts`.

Verify: `cd frontend && npx tsx --test tests/onboarding-company-selection.test.ts` 6/6 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `.venv/bin/pytest backend/tests` 364/364 pass · `git diff --check` clean. Visual check: Chrome/Playwright on `http://127.0.0.1:3020/onboarding`, desktop 1440px and mobile 375px screenshots, no horizontal overflow/offscreen controls; screenshots saved to `/tmp/myro-onboarding-company-desktop.png` and `/tmp/myro-onboarding-company-mobile.png`. Existing unrelated dirty state remains: `docs/free-llm-api-resources/` local/untracked.

## OLDER SESSION SUMMARY (2026-05-25 late - Railway beta fixes + refresh recovery)

Implemented the Railway/Beta Fix Plan in five scoped commits on `Develop`, aligned with Claude's latest pushed state and preserving Claude's aspiration retry/fallback work:

- `12b38b4 fix(db): repair cv upload orphan sweep` — added `20260525_fix_cv_upload_orphan_sweep.sql`, replacing ambiguous `sweep_stale_cv_upload_jobs` output `user_id` with `swept_user_id`, qualifying table aliases, preserving bounded orphan sweep/refund behavior, and reloading PostgREST schema.
- `d9898a8 fix(db): reassert job import schema contract` — added `20260525_reassert_job_import_schema_contract.sql`, guaranteeing `jobs.created_by_user_id`, FK, index, comment, and `NOTIFY pgrst, 'reload schema'` for the Railway `PGRST204` import failure.
- `b51bf81 fix(jobs): surface refresh outcomes` — threaded `outcome_kind` through `MatchComputeOutcome` → refresh state → API schema → frontend API/hook, and moved refresh notices into `frontend/lib/job-refresh-notice.ts` so users see cache-hit, onboarding, or exhausted-pool reasons instead of generic "No new matches".
- `6a78aa7 fix(matches): prevent narrow cvs from exhausting refresh pool` — implemented Claude's Backlog #14 fix direction: tiered skill-overlap floor 3→2 when the strict pool underfills, `top_n=12` for refresh compute, and debug fields `min_skill_overlap` / `qualified_jobs_count`.
- `b799488 fix(frontend): add route failure recovery` — added retryable route error boundaries for `/jobs`, `/tracker`, `/skills`, and public `/intel` via shared `AppRouteError`.

Supabase note: `supabase --version` returned `2.99.0`, but `supabase migration new repair_cv_upload_orphan_sweep` spawned a recursive process chain in this repo. The runaway was killed and migrations were created manually using the repo's timestamp naming convention.

Verify: `.venv/bin/pytest backend/tests` 364/364 pass · `cd frontend && npm run lint` clean · `cd frontend && npx tsc --noEmit` clean · `node --test tests/route-error-boundaries.test.mjs` pass · `npx tsx --test tests/job-refresh-notice.test.ts` pass · `git diff --check` clean. Extra broad `node --test tests/*.test.mjs` still has pre-existing failures unrelated to this work: direct `localStorage` text in `frontend/lib/api.ts`, raw query key in `frontend/app/companies/[slug]/page.tsx`, and two `.mjs` tests importing `.tsx` without a loader. Pre-existing unrelated dirty state remains: `.gitignore` adds `docs/free-llm-api-resources`, and `docs/free-llm-api-resources/` is local/untracked.

## OLDER SESSION SUMMARY (2026-05-24 - Beta feedback memory + fellowship interview prep)

Added new May 24 beta feedback to the canonical report: Bibi's mobile CV editor concerns (touch drag-and-drop, small text boxes, missing draft confidence), User X's Mission/onboarding jargon concern (`Forge Product Family Engineering`, `L0 -> L1`), and User 2's LinkyHost screenshot feedback. User 2 praised the modern CV/skills/job ecosystem but flagged corporate-heavy terminology, gamification pressure, company/job trust, CV upload interruptions, crowded screens, and the need for in-context feedback prompts.

Extracted the new to-do list into the beta backlog: touch-safe mobile CV reordering, larger/full-screen mobile CV editing, visible auto-save and draft recovery, beginner-friendly Mission terminology, gradual career-intelligence disclosure, resilient CV upload/AI processing, clearer role/company match trust, and contextual feedback prompts during onboarding and feature usage.

Created `docs/beta-testing/2026-05-24-fellowship-group-interview-prep.md` for 30-minute group interviews with 10-12 prospective interns. It defines Gemini transcript/note duties, Shivam's human observation checklist, no-AI and AI-assisted rounds, prompts for use-case reality and offline virality, a scorecard, reject signals, and strong fellowship hire signals.

Verify: `git diff --check` clean · `npm run lint` clean · `npx tsc --noEmit` clean · `.venv/bin/pytest backend/tests` 359/359 pass. Pre-existing unrelated dirty state remains under `docs/free-llm-api-resources`.

## EARLIER SESSION SUMMARIES

### 2026-05-23 - Company search incident

Fixed the production company autocomplete incident from `GET /jobs/companies/search`. Root cause was a per-keystroke public autocomplete path running broad PostgREST `ilike.%term%` reads over duplicate `jobs` rows; during a burst (`sc`, `go`, `goo`, `goog`, `googl`, `google`) Supabase returned Cloudflare 1101 HTML, which the Python PostgREST client surfaced as `APIError`/JSON decode and Railway returned as 500. Added `search_job_companies(search_term, result_limit)` RPC plus `pg_trgm` GIN index in production and migration history, moved the repository to the RPC path with a small TTL cache, and mapped upstream company search failures to a controlled 503.

Attribution: the failed search endpoint itself is public and carried no user principal, but Supabase/Railway timing correlates the burst to active user `8347d70c-fd70-4427-a0a8-d38dbc45757d` (`wooden-weaver-r8hx`) around `2026-05-23 17:32:15 UTC`. The Vercel logs only show static/client route hits, so the user identity came from adjacent authenticated backend/Supabase calls, not from the search request itself.

Also fixed a nearby production log issue: `get_feed_updated_at()` was querying nonexistent `jobs.created_at`; it now uses `jobs.last_seen` and caches null/error results for the 5-minute guard window. Frontend settings company search now debounces input by 250ms and only runs on the Following tab.

Verify: production DB RPC/index applied and `search_job_companies('go', 10)` returns `Google`/`Wells Fargo`; local repo search returns `['Google', 'Wells Fargo']`; legacy PostgREST company query now returns 200. `git diff --check` clean · `.venv/bin/pytest backend/tests` 359/359 pass · `npm run lint` clean · `npx tsc --noEmit` clean.

Full detail in `docs/session-history/2026-05.md` (includes 2026-05-20 Feedback Hub redesign + 2026-05-19 Skills card inline CV-pointer edit loop).
