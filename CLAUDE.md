# MYRO — CLAUDE.md (Cockpit)
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

---

## CODING CONVENTIONS

**Python:** 3.11+, async/await, type hints everywhere, Pydantic for validation, Supabase client for all DB ops (no SQLAlchemy/Alembic), `HTTPException` only, 100% test coverage on scoring engine.

**TypeScript:** Strict mode ON, no `any`, functional components only, all API calls via `lib/api.ts`, TanStack Query for server state, Zustand for UI-only state, 375px mobile viewport required.

**Git commits:** `feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope per commit.

**File size:** No file > 300 lines. Split if exceeded.

---

## CLAUDE CODE SKILLS

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
| Multi-file orchestration, cross-cutting refactors | Claude Code |
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
| **XP-DB1** | **Welcome XP grant lives at the DB layer.** `user_profiles` BEFORE INSERT trigger adds 3000 XP + flips `welcome_xp_granted`. App code MUST NOT set those fields in the insert payload. Rationale: the 2026-05-23 deploy gap stranded 4 users at 0 XP — invariants in Python = invariants only held when the right code runs. Migration `20260523b_xp_ledger_and_atomic_rpcs`. |
| **XP-DB2** | **Charge / refund are atomic SQL RPCs, never Python read-then-write.** `charge_xp(user_id, amount, action, floor, ref_table, ref_id)` and `refund_xp(...)` (migration 20260523b). The RPC does `UPDATE...WHERE balance - amount >= floor RETURNING` in one statement so two concurrent uploads cannot both pass the funded check. `app.services.xp_service.charge_or_raise / refund` are thin wrappers. |
| **XP-DB3** | **Every balance mutation writes an `xp_ledger` row.** Append-only audit table keyed by `(user_id, action, ref_table, ref_id)`. Bootstrap snapshot per existing user already loaded. Refund RPC short-circuits on prior `refund_*` entry with the same ref — double-refund is structurally impossible. |
| **XP-DB4** | **Charges are tied to the originating row via (ref_table, ref_id).** Pass them whenever a row owns the charge (e.g. `cv_upload_jobs`). Enables ledger reconciliation and refund idempotency. CV upload ordering: insert job row → charge against job_id → mark_charged. Charge denial marks job `failed/insufficient_xp` before raising. |
| **XP-CTA** | **xp_service raises `InsufficientXPError(amount, balance, action)` with a bare detail string. Callers append the recovery CTA.** Diary nudge is right for CV upload; "unfollow another company first" is right for cosmetic follow. The service stays domain-free. |
| **CVUP1** | **POST /cv/upload supports `Idempotency-Key` header (POST /cv/text: body field).** Client-generated UUID stored in localStorage. Backend `cv_upload_jobs.idempotency_key` has a per-user UNIQUE INDEX — retried POSTs return the existing job_id, never double-charge. |
| **CVUP2** | **Persisted job_id resumes after tab close.** Frontend writes `localStorage["myro_cv_upload_job_v1"]` when phase-1 returns `processing`. `/cv` mount checks for it and calls `pollCVUploadStatus` to reconcile. localStorage cleared on terminal state (done/failed). |
| **CVUP3** | **Orphan sweep on FastAPI startup.** `sweep_stale_cv_upload_jobs(5)` RPC marks any `processing` job > 5min as failed and refunds via the idempotent refund_xp. Runs in `app.main._sweep_orphaned_cv_upload_jobs` so Railway redeploys never strand users on immortal processing jobs. |
| **CVUP4** | **Scanned-PDF guard before charge.** Phase 1 rejects extracted text shorter than 80 non-whitespace chars with HTTP 422, never reaches the charge. Eliminates the charge → no_skills → refund retry loop that bit `thui46348` 3× on 2026-05-23. |
| **METRIC1** | **Refund-rate alert hook.** `xp_service.refund` emits structured `"metric refund.fired action=… reason=… amount=… ref=…/…"` warning. Refund rate > 5% over a rolling window indicates the LLM provider chain is degraded; wire Grafana / log alert when monitoring is set up. |

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

## LAST SESSION SUMMARY (2026-05-23 · ADR-0004 phase 1 + structural hardening A/B/C)

End-to-end overhaul of CV upload + XP economy, kicked off by a mobile-upload bug report. 13 commits to Develop across two arcs.

### Arc 1 — ADR-0004 phase 1 (XP-gated 2-phase upload)
- `docs/adr/0004-llm-actions-cost-xp.md` + sweep tracking stub. Replaces the 3-day baseline-upload cooldown with a single XP-gated economy: every LLM-bearing action costs XP, hash-cached re-runs free, refunds on provider failure, floor 0 for core flows.
- Migration `20260523_cv_upload_jobs_and_xp_pre_grant.sql` — `cv_upload_jobs` table (async LLM parse status surface, mirrors SE17), welcome XP backfill for 73 existing users.
- Backend: 2-phase upload (POST returns 202+job_id in ~1s; LLM runs in BackgroundTask; GET /cv/upload/status/{job_id} polls). `_run_cv_upload_job` refunds on three failure modes (provider_unavailable / no_skills / taxonomy_unmapped) with structured `cv_upload_jobs` audit. Welcome XP pre-grants at signup so the first paid action is uniform.
- Frontend: `lib/cv-upload-state.ts` pure state machine + `lib/cv-file-detect.ts` (Drive picker fix — name/MIME/magic-bytes cascade so extensionless Drive files work). `app/cv/page.tsx` reentry guard + out-of-XP CTA pointing to `/diary`. `useAuth` cold-start refresh-on-mount so expired access tokens don't bounce users.
- Mobile cellular socket-TTL bug solved: phase 1 returns in ~1s, the long LLM wait moves to the polled status endpoint.

### Arc 2 — Structural hardening (Brooks review found app-layer invariants)
A 27-min deploy gap on 2026-05-23 (migration applied at 12:48 UTC, backend code deployed ~13:15 UTC) stranded 4 users at 0 XP because welcome XP was granted in Python, not the DB. That symptom led to a full review of every other app-layer invariant in ADR-0004 phase 1. Three follow-up PRs landed:

**PR A — DB-enforced welcome grant + atomic charge/refund + ledger** (migration `20260523b_xp_ledger_and_atomic_rpcs`)
- `user_profiles` BEFORE INSERT trigger grants 3000 XP + flips `welcome_xp_granted`. No future code path can skip it. App code dropped from setting those fields.
- `xp_ledger` append-only audit table; 106 bootstrap snapshots seeded. Every charge/refund/grant writes a row keyed on (user_id, action, ref_table, ref_id).
- `charge_xp` RPC — single statement `UPDATE...WHERE balance - amount >= floor RETURNING`. Two concurrent uploads can no longer both pass the funded check.
- `refund_xp` RPC — short-circuits on prior `refund_*` ledger entry with the same ref. Double-refund is structurally impossible.
- `xp_service.charge_or_raise / refund` rewritten as thin RPC wrappers w/ new `ref_table` / `ref_id` parameters.
- `cv_workflow._start_async_upload_job` — ordering flipped to insert job → charge against job_id → mark_charged. Charge denial marks the job failed before raising so every attempt is reconcilable.

**PR B — Resilience: idempotency + tab-close resume + orphan sweep** (migration `20260523c_cv_upload_idempotency`)
- `cv_upload_jobs.idempotency_key` w/ partial UNIQUE INDEX on `(user_id, idempotency_key)`. Retried POSTs return the existing job_id, never double-charge.
- `sweep_stale_cv_upload_jobs(minutes=5)` RPC — bounded to 200/sweep, marks orphan rows failed and refunds via the idempotent refund_xp.
- `app.main._sweep_orphaned_cv_upload_jobs` on FastAPI startup recovers any process-restart victims.
- Frontend: UUID-per-upload persisted to localStorage. `job_id` persisted on phase-1 processing return. `/cv` mount checks for the persisted job and calls `pollCVUploadStatus` to reconcile — closing the tab mid-upload no longer loses state.
- Backend route accepts `Idempotency-Key` header (POST /cv/upload) and body field (POST /cv/text).

**PR C — Caller-owned CTAs + refund metric**
- `InsufficientXPError(amount, balance, action)` — typed exception with bare detail string. `xp_service` stops carrying domain-specific recovery copy. Callers append their own CTA (CV upload → "Earn 30 XP in 5min via a diary entry, or complete a forge session for +50 XP"; cosmetic follow at floor=-30 → different recovery path).
- `xp_service.refund` emits structured `"metric refund.fired action=… reason=… amount=… ref=…/…"` warning. Refund rate > 5% over a rolling window = LLM provider chain degraded; wire to Grafana when monitoring stands up.

### Field bugs caught + fixed live
- 4 users (atharv, takarpapang, dhrits, kinzaqazi) backfilled to 3000 XP via re-run of the migration UPDATE.
- User `thui46348` uploaded a scanned PDF 3× — empty-text retry loop. Phase-1 guard added: text < 80 non-whitespace chars → 422 BEFORE charge with "If it's a scanned or photo-based PDF, export a text-based PDF" copy.
- Drive picker accepted extensionless files via the new name/MIME/magic-bytes cascade.

### Tests + verify
355 backend tests pass (24 new across xp_service / cv_upload_api / workflow_seams). Frontend: 14 node:test cases (`tests/cv-upload-state.test.ts` + `tests/cv-file-detect.test.ts`), `tsc --noEmit` clean, `next lint` clean across all commits.

### Commits landed (chronological)
`dc2e707` ADR-0004 docs · `7ffa8a8` cv_upload_jobs + welcome backfill · `c63ee05` backend 2-phase upload · `b1e790a` frontend 2-phase + XP errors · `aa62bf9` Drive picker fix · `26e5919` cold-mount auth refresh · `e5d1407` scanned-PDF guard · `6bf5199` PR A — DB trigger + atomic RPCs + ledger · `ed10e35` PR B — idempotency + sweep + resume · `55e41ae` PR C — caller CTAs + refund metric.

### Open carry-over (next session)
- **ADR-0004 phase 2 sweep** (`docs/adr/0004-sweep-tracking-issue.md`) — migrate other LLM call sites to `charge_or_raise` + `refund` with `ref_table`/`ref_id`: skill-edit re-tag (currently UNCHARGED), `reparse_structured_only` lazy backfill, `ingest_cv_text` parallel path, `get_skill_advice` (add refund-on-fail), match refresh (add refund-on-fail).
- **gh CLI** not installed — file the tracking issue manually from `0004-sweep-tracking-issue.md` once `brew install gh` happens.
- **80-char text guard is heuristic.** OCR-garbage PDFs can still pass and fail at the LLM; valid CVs with > 80 chars of mostly visual layout sail through. Long-term: gate on `skills_detected >= 1` BEFORE finalising the charge (would require charge-after-LLM, breaks "no LLM call without funding" — needs separate ADR).
- **`spend_xp` / `spend_xp_to_floor`** (legacy) still in use by skill advice + follow company. Phase 2 sweep should migrate them onto the new `charge_xp` RPC for consistency.

## OLDER SESSION SUMMARY (2026-05-23 · Saturday-morning mobile audit + 4 deepenings)

End-to-end audit on 12 Saturday-morning screenshots (`reference/Saturday morning phone bugs/`) plus the landing-page WhatsApp shot from the night before. Shipped 7 commits to Develop: `aa7a87...` style mobile QA fixes followed by `d994558` (image 2-12 batch), `28ecf10` (image 5 CompanyDrawer), `b2c0512` (image 7 ForgeChip + LevelDots), `927ee6f` (image 8b FilterBar), `4bd6895` (image 10 triad foundation + ADR 0003), and a final wrap-up commit closing Phase 2 + ubiquitous-language pass.

### Image-by-image (each w/ 3+ findings the user added pointers to)

**Landing page (night before)** — sticky top bar on /about lost when scrolling; outer `minHeight: 100dvh` → `height: 100dvh` so inner becomes the actual scroll container. Tagline restructure ("Career Intelligence Platform" caption · "Career intelligence for professionals who don't compromise." single-line subhead via clamp + nowrap · "Upload CV, map your skills with market, fix CV and Apply" descriptor · MYRO display size -2pt).

**Image 1** — Mobile profile sheet missing theme toggle + swipe-to-dismiss. Mounted `<SurfaceToggle>` (already existed, unmounted on mobile) inside MobileProfileSheet; added swipe-down drag handle (touch handlers translate sheet w/ finger, > 80px closes). Light palette already lived in design-tokens.css under `[data-surface="light"]` — just needed wiring.

**Image 2/3** — XP explainer modal cyan edge rails, X scrolled away. Modal container now flex-column w/ `maxHeight: calc(100dvh - 32px)`. Header is `position: sticky; top: 0` so balance + X stay. Footer pinned. Soft border replaces cyan ring. XP amount column gets `fontVariantNumeric: tabular-nums` + `minWidth: 64` so `+30 XP` and `+3000 XP` line up.

**Image 4** — Home Mission Control. Internal name "Mission Control" eyebrow + "Today's three moves." H1 deleted from `hero.tsx` (ubiquitous-language leak per user's 4a + 4b).

**Image 5** — "Focused on: {company}" now opens a tracker-context drawer (new `components/companies/company-drawer.tsx`). Adaptive: desktop = right side drawer (420px), mobile = bottom sheet (max 85dvh, same swipe-down pattern as MobileProfileSheet). Drawer shows mini stats row (rating · ghost · open count), follow/unfollow toggle with XP cap + floor enforcement, the user's saved jobs at that company in live stages, and a "See reviews + funnel →" footer link to the existing `/companies/[slug]` review page.

**Image 6** — LLM rationale text clipped right edge on narrow viewports. `mc-fit-quote` + `mc-focus-title` get `overflow-wrap: anywhere`. `mc-focus-card` gets `min-width: 0; overflow: hidden`. `mc-focus-head > div` gets `min-width: 0` so a wide descendant can no longer push the whole card past the viewport.

**Image 7 (largest deepening)** — Dominate / Lock in / Locked were three divergent pills funneling to one outcome (open Forge). Replaced with two new primitives in `components/skills/`:
- `level-dots.tsx` — 5-dot ladder, `level` dots solid; if a forge session is running for *this* skill, the (level+1) dot fills bottom-up using `pendingMinutes / 25` from the timer store. Same indicator on desktop and mobile.
- `forge-chip.tsx` — single chip, four states: idle (outline accent) · cart (solid accent) · active (warning wash + pulsing heartbeat dot) · done (success wash, auto when level ≥ 5). Wraps LevelDots + state label.

Wired through `focused-job.tsx::SkillMatchRow` and `mc-skill-build-row`. New `.mc-forge-cart-footer` — full-bleed accent strip appearing when `cartSkillNames.size > 0`, "{N} skill(s) locked → Open Forge" linking to `/forge`. Single funnel CTA, no longer competing with "Tailor CV for this role". Skill-card-inline header also leads with LevelDots now so the ladder is the cross-surface progression vocabulary.

**Image 8** — Heatmap eyebrow ("YOUR SKILLS × COMPANY DEMAND") was overlapping the H2 below it. `marginTop: 2 → 8`, header gets `flex-wrap: wrap` + `lineHeight: 1.25`. Backend names already linked to `/companies/{name}` via existing Link.

**Image 8b** — Top Movers had hardcoded "7D" + a single sort. New `components/ui/filter-bar.tsx` primitive: generic icon-only row with `groups[]` (segmented selects) + `toggles[]` (boolean pills) + `trailing` slot for non-filter UI. Top Movers consumes it with window (7D/30/90, scales the fake delta until backend exposes real windowed data) · sort (most-added / most-roles / latest) · followed-only ★ toggle.

**Image 9** — Skills stat tiles are real `<button>`s but read as static. Added hover bg, focus ring, and a "›" chevron pseudo-element top-right so the four big numbers visibly carry the primary interaction.

**Image 10/11 — small fixes + system pattern.** Mobile sticky bar (Intel/Map/Audit) got darker drop-shadow + backdrop blur so rows scrolling under read as elevated. Ghost left "▸" column removed from domain accordion — single `+/-` on the right is now the only expand affordance. Status pill (AT RISK / BUILDING / STRONG) uses the tier color instead of flat faint — severity gradient restored.

**Image 10 (big deepening — ADR 0003).** Intel/Map/Audit triad codified as system pattern across Skills/CV/Tracker/Home.
- `lib/views/triad.ts` — `TriadView` type, `TRIAD` semantics map (Intel = signal density · Map = spatial layout · Audit = evidence walkthrough), `TRIAD_DEFAULTS` per page (Skills=Intel · CV=Map · Tracker=Audit · Home=Intel), `triadStorageKey()`.
- `components/ui/view-triad-toggle.tsx` — `<ViewTriadToggle page value onChange compact />` segmented control + `useTriadView(page)` hook with localStorage sticky per-user pref.
- `docs/adr/0003-view-triad-intel-map-audit.md` — decision, Brooks rationale (conceptual integrity > local optimization), Phase 2-5 migration plan, parked open questions.
- Phase 2 (Skills rewire to use the shared hook + toggle) shipped in the closing commit. Phases 3-5 (CV / Tracker / Home triads) intentionally deferred — each is its own design discussion and PR.

**Image 12** — CV Master baseline. Dropped `app / cv_builder / baseline` mono breadcrumb (and the matching one on the empty-state upload page). "1 COMPANIES" / "1 JOBS" pluralization fixed. "Pick a target job" CTA promoted to first position before "Rework baseline". `StatCard` now renders as Link or button when given href/onClick — hover bg + accent border + focus ring make the four numbers interactive surfaces, not static text.

### Ubiquitous-language audit (cross-cutting close)

Grepped frontend for backend identifiers leaking into user surface text. Findings + fixes:
- `app/cv/page.tsx` empty-state breadcrumb still had `cv_builder` — deleted.
- `components/cv/builder/playground-view.tsx` version-tab meta-line printed `v.kind` raw (`polished` / `edited` / `deterministic`) — replaced with `humanKind()` helper ("AI polished" / "manually edited" / "auto-tailored").
- `components/cv/builder/intel-drawer.tsx` version row fell back to raw `v.kind` when title was empty — same human-readable fallback.

Internal kind comparisons inside the data model (e.g. `v.kind === "baseline_upload"` for sorting/filtering) intentionally left untouched — those are correct uses of the backend enum and never reach the user surface.

### Open carry-over

- **Image 10 Phases 3-5 (deferred).** Each page needs its own grilling on what Intel/Map/Audit *mean* in that page's domain before we wire the toggle. Per ADR 0003 migration plan: CV (Intel = version list · Map = commit graph · Audit = ATS audit) · Tracker (Intel = open pipeline · Map = stage funnel · Audit = per-app history) · Home (Intel = next moves · Map = score radar · Audit = recent diary). Pick up when product agrees.
- **Top Movers windowed data.** Currently fakes 30D/90D by scaling the existing weekly delta (`WINDOW_SCALE` = 1× / 3.2× / 8.4×). Replace with real windowed deltas when backend exposes `companies?window=...`.
- **Ad-hoc humanKind helper.** Lives in `playground-view.tsx`; intel-drawer.tsx inlined its own version. If a third consumer needs it, hoist to `lib/cv/version-format.ts`.

Verify: `tsc --noEmit` clean across all 7 commits · 11 files in image 2-12 batch · 2 files for image 5 · 5 files for image 7 · 2 files for image 8b · 3 files for image 10 foundation · 6 files for image 10 Phase 2 + ubiquitous-language cleanup.

## EARLIER SESSION SUMMARY (2026-05-21 · Mobile QA pass + Forge continuation model + view-model seam)

End-to-end mobile QA across 16 screenshots in `reference/21May Mobile screenshots/` (fresh-user landing → onboarding → skills → forge → cv). Three commits landed on Develop.

### Commit `aa7a879` — Mobile QA Img 1-12
- **Public nav (`components/public/top-nav.tsx` + `public-nav.css` new)**: auth CTAs (Sign up / Sign in) were clipped off-screen on 375px because `overflowX: auto` let content escape. Refactored inline styles → page-scoped CSS class hooks. `@media (max-width: 720px)` hides About/Newsletter/Intel center nav (still in footer) and pins logo + auth pills visible.
- **ParticleBg (`components/particle-bg.tsx`)**: gated on `useViewport().isDesktop`. On mobile (no cursor) the idle-detection always fired → sphere bloomed at viewport-center, bleeding through translucent cards. Single source of truth for all public pages (`/`, `/about`, `/login`, `/signup`).
- **Intel pane (`components/public/intel-pane.tsx` + `intel-pane.css` new)**: MARKET SIGNAL prose ("27,230 jobs across 145 companies in 10 industry groups") → 3 stat tiles. Dropped redundant "ROLE DOMAIN" label. 4-col filter grid desktop / 2-col mobile. CTA tightened (3× "Myro Score" → 1×). Above-fold copy ~38 → ~12 words.
- **Step-role (`components/onboarding/step-role.tsx`)**: dropped redundant "Gap analysis will use…" prose (chips already showed selection — design-over-words). `placeholder={atMax ? "Max 3 selected"}` bug → uses `MAX_ROLES` const. Location row gets `mask-image` gradient fade so overflow is visibly affordable.
- **Ninja name (`backend/app/services/ninja_name.py` + `routers/profile/public.py` + `components/onboarding/NinjaNameStep.tsx`)**: `suggest_ninja_name` endpoint now returns the persisted `ninja_name` first (auto-provisioned at signup per NU1), else a slug derived from `full_name` (e.g. `shivam-pathak-9k2v`), else random fallback. Fixes "I already gave a name, why is it different?" complaint. NinjaNameStep helper copy 24 → 9 words. Added `slugify_full_name()` and `generate_from_full_name()`.
- **Skills domain-accordion (`components/skills/domain-accordion-row.tsx` + `domain-accordion-row.css` new)**: 6-col grid template with empty trailing 32px slot + 120px progress bar busted 375px viewport — every row's status badge ("BIGGEST GAP", "AT RISK", "BUILDING") clipped right. Fix: 5-col grid `20px minmax(0, 1fr) auto 90px 32px` desktop, 4-col with bar hidden <720px.
- **Skill advice (`components/skills/skill-card-inline.tsx`)**: AI advice panel was a single 250-word paragraph with no word-break — wall of text spilling right. Added `wordBreak/overflowWrap` + "Show more" collapse at 240 chars.

### Commit `5c5379e` — Forge continuation model
User said: "Users should not be punished for not being able to complete 25 mins." Backend rewritten so partial bursts accumulate.
- **Migration `20260521_forge_continuation.sql`** (applied to prod): `user_skills.total_forge_minutes INTEGER NOT NULL DEFAULT 0`. Backfill `COALESCE(SUM(duration_minutes), 25 × forge_sessions_count)` per `(user_id, skill_id)`.
- **`backend/app/services/forge_service.py`**: `complete_forge_session` now logs any-duration burst, increments `total_forge_minutes`, derives `sessions_count = total // 25`. Level-up triggers off derived count. `forge_sessions_count` never decreases (preserves pre-redesign state). New `get_last_forged_skill()` + `GET /users/me/forge/last-skill` for auto-resume. Constants exposed: `SESSION_MINUTES`. Schema: `total_forge_minutes`, `minutes_to_next_session` returned on every complete.
- **`backend/tests/test_forge_service.py`**: rewritten for continuation model. 15/15 pass including new tests for partial-burst-accrues, 25-min-boundary-crossing, count-never-decreases.
- **Mobile top widget (`components/forge/ForgeXpPill.tsx` + `forge-xp-pill.css` new)**: ambient XP+Forge pill. Three states (idle / running / claim-ready). Live mm:ss timer with conic-gradient ring. Animated claim button. Replaces inline mobile XP button in `MobileTopBar`.
- **`mobile/shell.tsx::MOBILE_NAV`**: dropped `/forge` slot (5-slot bottom nav now). Forge is no longer a destination — it's an ambient surface.
- **`store/forgeTimerStore.ts`**: extended with `pendingMinutes`, `lastTickAt`, zustand `persist` middleware (`myro-forge-timer-v1` localStorage key). Tick logic detects whole-minute boundary crossings and increments `pendingMinutes`. Survives reloads.
- **`app/forge/page.tsx`**: tap h1 = start/pause toggle (label changes "Tap to start" / "Running" / "Paused"). `useEffect` resolves last-forged skill via the new endpoint and auto-resumes on entry.

### Commit `d640cd0` — Forge view-model deepening (Candidate 1 from `/improve-codebase-architecture`)
Four renderers (SidebarForgeTimer / ForgeXpPill / ForgeFloatingTimer / `/forge` dial) each owned a `setInterval(tick, 1000)` + claim mutation + ring math + pause/resume wiring. Two visible at once = store ticked twice per real second. Collapsed onto a single seam.
- **`lib/hooks/use-forge-session.ts` (new)** — view-model hook returning `{ state: idle|running|paused|complete, mm, ss, ringPct, pendingMinutes, pendingXp, canClaim, claiming, claimError, startSession, startLastForged, pause, resume, dismiss, claim }`. Hook auto-updates forge store + XP wallet on successful claim; cache invalidation caller-controlled via `claim({ onClaimed })`.
- **`components/forge/ForgeClockDriver.tsx` (new)** — singleton heartbeat mounted ONCE in `AppShell` near `ParticleBg`. Renders nothing. Renderers are now read-only — two-ticks-per-second is no longer expressible.
- **`components/forge/ForgeXpPill.tsx`** + **`app-shell.tsx::SidebarForgeTimer`** refactored onto hook. Visuals unchanged.
- **`components/forge/ForgeFloatingTimer.tsx` deleted** (267 lines, zero imports — dead since commit `5c5379e`).
- **CONTEXT.md** gains a "Forge Session" entry: lifecycle states (timer × claim, two-axis), partial-burst continuation, the four-surfaces-one-engine architecture, the view-model seam contract.

Verify: 342 backend tests pass · `tsc --noEmit` clean · `next lint` 0/0 · `tsx --test forge-progress` 3/3.

Open (carryover):
- `/improve-codebase-architecture` surfaced 2 more candidates worth closing in a follow-up: (a) **Candidate 2 — unify `MOBILE_NAV` + sidebar `NAV_ITEMS` + `PublicTopNav::NAV_ITEMS` into `lib/nav-items.ts`** with `visibility` field. (b) **Candidate 3 — ADR-0003 documenting the page-scoped CSS pattern** now applied across `public-nav.css`, `intel-pane.css`, `domain-accordion-row.css`, `forge-xp-pill.css`, `cv-builder.css`.
- `app/forge/page.tsx` still calls `xp.completeForge` directly with `session_type: "focused"` rather than via `useForgeSession`. Hook hardcodes ambient. Adding a `sessionType` param to `useForgeSession` is the natural next step but parking until forge page redesign returns.
- Skill Intelligence page mobile redesign (Backlog #10) — phases 1-3 done; phase 4 should pick up the `domain-accordion-row.css` extraction pattern for the remaining inline-styled rows.
- Multi-location targeting parked at Backlog #12 (DB migration + RPC change required).

## EARLIER SESSION SUMMARIES — pre-2026-05-21

### 2026-05-20 — CV Builder three-view redesign

Rebuilt `/cv` end-to-end from the Claude Design handoff (`reference/CV page redesign-handoff.zip` → `cv-page-redesign/project/`). Tactical-dark theme + Geist sans + cyan accent. Three views routed by query state: **Baseline** (no `jobId`) shows the master CV at the trunk of a Git-style commit graph with per-company branches + a saved-jobs picker; **Playground** (`?jobId=…`) is the per-job tailoring surface with version tabs, two-pane editor/preview, intel strip + drawer; **PDF preview** (`?jobId=…&view=pdf`) renders an enterprise A4 page with ATS audit card. Existing `useCVPlayground` state machine + `cv.*` API preserved unchanged — no backend touched.

- **Frontend — `lib/cv/version-format.ts` (new)** — formatters extracted from old `version-picker.tsx` / `version-ledger.tsx`: `formatGlobalVersionLabel`, `formatThreadVersionLabel`, `formatVersionContext`, `formatParentVersionLabel`, `summarizeCVVersionLedger`, `sortLedgerVersions`, `getLedgerPreviewText`, `formatLedger*`, `timeAgo`. Tests still import from old paths via re-export shims.
- **Frontend — `app/cv/cv-builder.css` (new)** — page-scoped CSS, loaded by `app/cv/page.tsx`. All `.cvb-*` classes (page head, commit graph, version tabs, two-pane body, bullet rows, intel strip, drawer, modal, PDF page, ATS audit). 3 media queries: ≤1100px (single-column playground + segmented mobile switch), ≤720px (phone polish: 16px padding, narrow version tabs, full-screen modal + drawer), `prefers-reduced-motion`.
- **Frontend — `components/cv/builder/` (new deep module — single import surface)**:
  - `icons.tsx` — 25 inline Lucide-family SVGs (1.6 stroke), tree-shakeable.
  - `score-gauge.tsx` — radial SVG gauge with accent glow + dashoffset transition.
  - `keyword-utils.tsx` — `targetsFromSkillGap`, `highlightKeywords`, `bulletKeywordHits`. Pure helpers shared by preview + bullet meta.
  - `commit-graph.tsx` — `KindDot`, `CommitRow`, `LegendDot`. Buttons (a11y); aria-current + focus rings.
  - `cv-render.tsx` — dark formatted CV body used inside the BaselineView viewer modal.
  - `baseline-view.tsx` — page head + 4-stat row + commit graph + saved-jobs picker (real `jobs.applications()` filtered to live stages) + viewer modal (Esc + scroll lock).
  - `bullet-row.tsx` — checkbox toggle + inline contentEditable + keyword chips + edit button (focus-within reveals).
  - `live-preview.tsx` — deterministic dark mono render with `<mark>` keyword highlight; collapses empty sections.
  - `intel-drawer.tsx` — slide-from-right drawer (full-screen on mobile) with `ScoreGauge`, matched/missing chips, JD source text, lineage list.
  - `playground-view.tsx` — page head + crumbs + version tabs (kind dots + dirty marker) + segmented mobile switch + 2-pane edit/preview + intel strip + sticky save bar. Pulls real `jobs.path`, `jobs.skillGap`, `jobs.applications` (JD text). Live JD-match score recomputed client-side from `useCVPlayground.hiddenItems`.
  - `pdf-preview-view.tsx` — toolbar with filename slug + ATS pill + match-score pill + Download PDF (uses existing `cv.downloadPdf` endpoint) + white A4 `cvb-pdf-page` + 7-check ATS audit card.
- **Frontend — `app/cv/page.tsx`** — collapsed to thin router (3 view modes by `searchParams.jobId/view`). Upload modal + edit-polished modal retained. URL contract: `/cv` → baseline · `/cv?jobId=X` → playground · `/cv?jobId=X&view=pdf&score=N` → PDF.
- **Frontend — `components/cv/version-picker.tsx` + `version-ledger.tsx`** — reduced to formatter re-export shims (visual components retired). `components/cv/cv-playground.tsx` + `cv-commit-pane.tsx` deleted (replaced by the deep module).

Verify: 317 backend tests pass (no backend changes) · `tsc --noEmit` clean · `next lint` 0/0 · `next build` succeeds (route /cv: 16.2 kB / 222 kB First Load) · `tsx --test cv-version-picker-labels + cv-version-ledger` 8/8 pass.

Open (carryover):
- Lineage drawer + viewer modal don't yet surface the JD-source text on jobs that have no `job_description` (drawer hides the section silently). Wire up when scrape pipeline backfills.
- Per-bullet drag-reorder UI from the handoff prototype is intentionally NOT shipped — backend `cv_versions` schema has no order column. Add the schema + endpoint, then bolt UI on top.
- Skill-card `?skill=` highlight inside `LivePreview` BulletRows (Mode 3 deeplink carryover from 2026-05-19).
- ATS audit currently always reports "passes 7 / 7 checks". Wire real audits when a server-side ATS parser lands.
- ADR for Company CV Thread decision (CV2 lock) — still un-authored. Migrate from CONTEXT.md note.

Full detail for sessions before 2026-05-21 lives in `docs/session-history/2026-05.md` (Feedback Hub redesign, Skills card inline CV-pointer edit loop, etc).
