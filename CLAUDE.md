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

Myro is an Intelligence-as-a-Service platform for job seekers. User uploads CV → skills extracted + matched against global skill taxonomy (L1–L5) → top 5 job matches found by skill overlap + LLM-ranked → top 3 recommended with explanations → Myro Score (0–100) computed across 10 domains → user sees score, domain breakdown, top 3 jobs, top 5 skill upgrades. XP economy: welcome grant 1000 XP on CV upload, +50 per forge session, +30 per diary entry. Skill levels advance via forge session counts (L0→L1=3, L1→L2=9, L2→L3=27, L3→L4=108 sessions).

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

1. ~~**`user_job_matches` design review**~~ ✅ DONE 2026-05-17 — Unique key changed to `(user_id, job_id)`, `action_plan` dropped, endpoint rebuilt.
4. ~~**Intel page — job analytics loading screen**~~ ✅ DONE 2026-05-15 — Progress banner (3-step) + skeleton shimmer rows. Never blank. Banner disappears when all resolve.
5. ~~**Intel page — skill selector panel**~~ ✅ DONE 2026-05-12 — TrackedDigest replaced with SkillSelectorPanel; user-curated heatmap columns.
6. ~~**Intel page — PR2: Run Analysis**~~ ✅ DONE 2026-05-17 — `POST /jobs/analyse/{job_id}`: 50 XP, weighted overlap compute, LLM explanation, upserts to `user_job_matches`. Frontend already wired.
7. ~~**Intel page — TopMovers: all companies**~~ ✅ DONE 2026-05-15 — All companies, scrollable, search, ★ follow on every row with 10 XP cost + cap/floor guards.

8. ~~**Process Transparency Layer**~~ ✅ DONE 2026-05-19 — Company review system shipped. Migration `20260517_tracker_v1.sql` (legacy status remap, `last_stage_changed_at`, `first_offer_at`, review FK ON DELETE SET NULL). Backend `jobs/review.py`, `jobs/stale.py`, `companies.py`. Frontend `/tracker` (tabs, 5 stages + 4 outcomes, StatusPicker, MobileStagePills, StuckBanner with picker overlay, ReviewModal with real stage prefill, ManualAddModal, OutcomeSeal, ScoreSparkle). `/companies/[slug]` page with stats, funnel, reviews. Tracker company names link to `/companies/{name}` in both ApplicationCard + VerdictsTab. `+ Save` toast on `/jobs` with `View in Tracker →`.
9. ~~**Mobile — enterprise polish + PWA**~~ ✅ DONE 2026-05-19 — All v1 PWA items shipped (skeleton lib, manifest, layout fixes, viewport seam). Deepenings #1 (ViewportProvider + useViewport) and #3 (frontend/mobile/ module) shipped. #2 (ResponsiveStack) deferred until friction fires.
10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.
11. ~~**Forge + Diary Loop**~~ ✅ DONE 2026-05-19 — Generic claim-anytime Forge XP shipped across nav/modal surfaces. Visible skill names hidden; claim restarts Forge automatically. Backend resolves hidden Forge skills to canonical tracker rows. Skill Tracker exposes free AI upgrade prompts after forged level-ups, using CV evidence + recent diary notes with 0 XP spend.

   **Forge widget v2 (deferred, 2026-05-19 design pass):**
   - **Cycle counter** — show "cycle N" badge on widget; track sessions completed in a single login window.
   - **Long-press dismiss** — `×` requires 600ms press when mid-session w/ unclaimed XP; prevents accidental loss.
   - **Haptic equivalent** — scale-pop + soft glow burst on successful claim; navigator.vibrate(10) on mobile PWA.
   - **Streak multiplier** — N consecutive claimed cycles in a session = ×1.25/×1.5/×2 XP multiplier badge; resets on dismiss or 30min idle.
   - Pick up when v1 forge widget has been validated by real usage signals (claim rate, dismiss rate, return-to-forge rate).

12. ~~**Shareability v1 — `/profile/{ninja_name}` public profile**~~ ✅ DONE 2026-05-19 — Backend `ninja_name` service + `routers/profile/public.py` (`GET /profile/{ninja_name}`, `GET /overlap`, `POST /ninja-name`, `GET /suggest`). Migration `20260519_shareability_v1.sql` + backfill script. `user_provisioning.ensure_user_provisioned` becomes single profile seed point — generates ninja_name on first insert, honors `myro_ref` (body field, cookie fallback). Frontend: `lib/radar-geometry.ts` extracted, `components/profile/` (GhostRadar, OwnerRadar, RadarOverlay, JobOverlapRows, ShareButton, PublicProfilePage), `app/profile/[ninja]/{page,loading,opengraph-image}.tsx`, `/skills` ShareButton top-right, signup captures `?ref=`, onboarding NinjaNameStep before final. `robots.ts` disallows `/profile/`. 301 backend tests green; tsc + lint clean.

13. **Frontend loading-time reduction + deep loading module** (locked 2026-05-19 via grill-me) — full plan below. Do NOT code until `/improve-codebase-architecture` pass on the deep module lands first.

14. ~~**Company CV Thread + Tracker CV badge**~~ ✅ DONE 2026-05-19 — CV2/CV3/CV4 lock. CONTEXT.md gets `Company CV Thread` concept. Backend `CVVersionsRepository.list_thread / list_thread_for_job / latest_for_thread / latest_for_thread_batch`. `ApplicationResponse.cv_badge` ships per row via batched company-thread lookup. Frontend: `useCVPlayground` hook (kills hidden_items race), `<CVCommitPane>` (persist pane unsaved→saved with scale-pop), `ApplicationCard` renders `◐ Company CV v{n}` pill linking to `/cv?jobId=row`. Per-job filter bug deleted. 294 backend tests green; tsc + lint clean.

15. **Marketing reshuffle — Intel/About** ✅ DONE 2026-05-19 — Intel page (`/`) keeps only IntelPane. About page (`/about`) gets SampleDiagnostic appended. Top-nav order: About · Newsletter · Intel.

16. **Skills card — 3-button upgrade affordance restored** ✅ DONE 2026-05-19 — `InlineSkillCard` (in `frontend/components/skills/domain-accordion-row.tsx`) now renders 3 always-visible icon buttons after the excerpt: ✎ → `/cv?skill=<display_name>` Link, ✦ → `users.skillLevelUpAdvice` (-20 XP, FREE pill when `forged_level_up_available`, advice expands inline), ☆ → `diary.createEntry` (flips to ✓ active). Token threaded from caller. CV deeplink: `CVVersionLedger` accepts `highlightSkill`, splits preview text, wraps matches in `<mark>` with accent ring, auto-scrolls first hit into center. `app/cv/page.tsx` reads `?skill=` searchParam → passes through. tsc + lint clean.

   **Carryover for next session (decide angle before coding):**
   - **Fix-my-level picker.** Old rich `SkillCard` had a 0–5 level-correction picker calling `users.correctSkillLevel`. Dropped from new inline card. Decide: restore as 4th icon (◐?), surface in per-skill modal, or sunset entirely now that forged level-ups give a richer signal. The endpoint + API client still exist.
   - **CV deeplink Mode 3 (tailored playground).** `?skill=` only highlights baseline ledger (Mode 2 — `hasBaseline && !jobId`). If user lands on `/cv?jobId=…&skill=…` (e.g. coming from a tailored-CV surface), the `BulletRow`s inside `CVPlayground` are not highlighted. Wire `focusSkill` into `CVPlayground` + scroll first matching bullet into view.
   - **Diary log cache invalidation.** `logDiary.onSuccess` only flips local `logged` state. No `queryClient.invalidateQueries` for diary list, daily_logs, scores, or XP balance refresh — diary entry awards +30 XP that won't appear in the wallet until next manual refetch.
   - **`/cv?skill=` deeplink fidelity.** Substring match is naïve — short skill names ("R", "Go") will false-positive. Add word-boundary guard, or pass skill `key` instead of `display_name` and let the CV side resolve to the evidence_text excerpt.

---

## FRONTEND LOADING-TIME REDUCTION — PLAN (Backlog #13, locked 2026-05-19 via grill-me)

### Vision
Every navigation page renders something useful in under 1 second and finishes critical content in under 2.5 seconds, on India-mobile reality. No user is ever "left hanging" by a waterfall fetch. Heavy modules stream in below the fold; light/cached modules render real immediately. The loader knows when the backend is mid-deploy or degraded and tells the user instead of spinning silently. One deep, reusable loading module governs all 14 logged-in + onboarding routes — pages consume a single `<RouteLoading kind=... query=... fallback=... />` and never import status codes, deploy state, or polling logic directly.

### Decisions (LD1–LD6)

| # | Decision |
|---|---|
| LD1 | **Scope = 14 routes.** Logged-in app shell (`/home`, `/cv`, `/jobs`, `/tracker`, `/skills`, `/diary`, `/xp`, `/market`, `/mission`, `/companies/[slug]`, `/profile/[ninja]`) + onboarding/auth chrome (`/onboarding`, `/login`, `/signup`). Marketing (`/`, `/about`, `/newsletter`) excluded — SSG, separate problem class. Legal pages excluded. |
| LD2 | **Module split by data shape, not route group.** Two categories: `app-data` (logged-in shell, user-specific async, skeleton-mirror-then-stream) + `flow-step` (onboarding/auth, no user data or step-machine, centered process indicator). One entry point: `<RouteLoading kind="app-data" \| "flow-step" />`. Deep-module per Ousterhout — complex internals, narrow interface. |
| LD3 | **Render priority rule = P(user's next action) × certainty-of-data × inverse-latency.** Three-axis sort: latency band (`instant` <200ms / `light` <1s / `heavy` 1–5s / `compute` >5s) × info density (`high`/`medium`/`low`) × action proximity (`primary`/`secondary`/`ambient`). Placement bands: above-fold = `action=primary` OR (`info=high` AND `latency∈{instant,light}`); below-fold-stream = `action=secondary` AND `latency∈{light,heavy}`; deferred-lazy-on-scroll = `latency=compute` OR `info=low`. Mechanism: Next.js `loading.tsx` per segment + `<Suspense>` per module + TanStack `staleTime` (`instant=5min`, `light=1min`, `heavy=30s`) + `keepPreviousData` on tab/filter switches. |
| LD4 | **Aggressive targets (RUM p75 over 7d):** TTFA ≤ 1.0s · TTI-CC ≤ 2.5s · CLS ≤ 0.05 · stuck-screen rate ≤ 1%. Web vitals (LCP/FCP/INP) logged but not optimized for — TTFA + TTI-CC are the metrics product cares about. |
| LD5 | **Route tiering = activation-weighted, not traffic-weighted.** P0 = `/onboarding`, `/myro`, `/home` (the conversion funnel — one-shot first-impression moments). P1 = `/jobs`, `/skills`, `/tracker` (retention loop). P2 = `/cv`, `/market`, `/companies/[slug]`, `/mission`, `/diary`, `/xp`, `/profile/[ninja]`. P3 = `/login`, `/signup`, `/auth/callback` (regression alarm only, no proactive work). |
| LD6 | **Deploy coupling = A-Lean.** Midnight-IST-only deploys to `main` reduce collision rate but do NOT save the HTTP-status fallback work, chunk-version drift handling, or backend-degradation handling. Compute-optimized: `/v1/status` (merged health+version, 5s in-memory cache) replaces separate endpoints; `useBackendStatus()` polls only on 5xx or tab-refocus-after-5min-hidden (not on timeout — slow LLM ≠ deploy); `useAppVersionWatch` replaced by `visibilitychange` listener (zero polling steady state); `ChunkLoadError` → hard reload. Saves ~95% of status request volume vs naïve polling. |

### Ambient-tier deployment list (the teal particle loader from `components/ui/particle-loading.tsx`)

Fit criteria — ALL four must hold: single hero region · 2–15s bounded wait · no known sub-steps to expose · empty state would feel depressing.

Locked candidates:
- `/jobs` Run Analysis (50 XP) — LLM overlap, 5–15s, single card.
- `/mission` company tab reconfigure (XP9) — single transition, bounded.
- `/cv` polish/tailoring waits — LLM rewrite of section, ~8s, single card. Polish step only, not full builder.
- `/myro` first score reveal — verify `/myro` renders a bounded compute moment >2s; if yes, ambient covers it.

Resist temptation (do NOT add ambient to): `/home`, `/dashboard`, `/tracker`, `/jobs` list (grids → skeleton wins); `/market` heatmap (per-row independent fetches per IH3); `/cv` builder shell (layout-heavy, skeleton wins); onboarding CV parsing (step-machine, `process-loading` wins); `/auth/callback` (sub-second, spinner is honest).

### Backend — New + Modified

**New: `backend/app/routers/status.py`**
- `GET /v1/status` — merged health + version. Returns `{status: "ready"|"degraded", version: <7-char SHA>, ts: <iso>}`. In-memory cache, 5s TTL. Drops the `deploying` state (midnight policy makes it dead code). No auth.

**Modified: `backend/app/main.py`**
- `/health` stays as legacy ping for Railway healthcheck probes. Mount `status.py` router.
- Expose `RAILWAY_GIT_COMMIT_SHA` (or fallback) into status payload.

**New: `backend/app/routers/telemetry.py`**
- `POST /v1/telemetry/route-perf` — receives `{route, ttfa_ms, tti_cc_ms, cls, deploy_id, backend_version, viewport, session_id}` from frontend marks. Writes to `route_perf_events` table. Auth required (token-scoped per OQ2).
- Sample rate: prod 10%, dev 100%. Sampling decision made client-side (cheap), backend just trusts the flag.

**New: `backend/database/migrations/20260520_route_perf_telemetry.sql`**
- `route_perf_events (id, user_id, route, ttfa_ms, tti_cc_ms, cls, deploy_id, backend_version, viewport, occurred_at)`. RLS: service-role write only. Indexed on `(route, occurred_at)` for the p75 query.

### Frontend — New + Modified

**New deep module: `frontend/components/loading/route-loading/`** — the public-facing single export.
- `index.tsx` — `<RouteLoading kind query fallback />`. Pages import only this.
- `route-loading.app-data.tsx` — `app-data` variant. Wraps `<Suspense>` boundary, decodes HTTP status, renders skeleton-mirror or recovery banner.
- `route-loading.flow-step.tsx` — `flow-step` variant. Centered process indicator with step prop.
- `use-backend-status.ts` — hook. Idle when queries happy. Activates on 5xx OR `visibilitychange` after >5min hidden. Polls `/v1/status` with jittered backoff (10s → 20s → 40s, cap 60s). Sleeps on recovery.
- `use-route-perf-marks.ts` — hook. Emits `performance.mark()` at module mount (TTFA = when first real content paints) and at critical-content resolve (TTI-CC). Posts to `/v1/telemetry/route-perf` on unmount, sampled.
- `use-app-version-watch.ts` — hook. Reads `<meta name="app-version">` once at mount. On `visibilitychange` to visible after >5min hidden, fetches `/v1/status.version` and compares. Mismatch → non-blocking toast "New version available — reload". `ChunkLoadError` global handler → hard reload.
- `http-status-fallback.tsx` — pure component. Maps status code to UI: 401→redirect, 403→empty, 404→route-empty, 429→countdown, 5xx→deploy-aware retry banner.
- `skeleton-mirrors/` — per-route shape-matching skeletons. Zero CLS allowed.

**Modified pages (in P0/P1 order):**
- `app/onboarding/page.tsx` — wrap CV parse step in `<RouteLoading kind="flow-step" step="cv-parsing">`.
- `app/myro/page.tsx` — wrap score reveal in ambient `ParticleLoading` (verify >2s wait first). Add `<RouteLoading kind="app-data">`.
- `app/home/page.tsx` — rearrange per LD3: score ring + primary CTA above fold (instant/cached), top jobs grid below fold (skeleton + Suspense), XP banner streams, recent activity lazy-on-scroll.
- `app/jobs/page.tsx`, `app/skills/page.tsx`, `app/tracker/page.tsx` — apply rule, migrate to deep module.
- `app/layout.tsx` — inject `<meta name="app-version" content={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)}>`. Register `ChunkLoadError` global handler.

**Modified: `frontend/lib/api.ts`**
- Add `status.get()` for `/v1/status`. No auth.
- Add `telemetry.routePerf(payload)` — sampled post, fire-and-forget.

**Modified: `frontend/lib/query-client.ts` (or wherever TanStack is configured)**
- Set default `staleTime` semantics per-band. Document with inline JSDoc on the constants.

### Tests

- `backend/tests/test_status_router.py` — payload shape, 5s cache TTL, degraded state on db ping failure, version field non-null.
- `backend/tests/test_route_perf_telemetry.py` — auth required, sample rate honored, deploy_id captured.
- `frontend/tests/route-loading.test.mjs` — kind switching, fallback rendering, status decode for 401/403/404/429/500/503.
- `frontend/tests/use-backend-status.test.mjs` — idle in steady state, wakes on 5xx, sleeps on recovery, `visibilitychange` activation after 5min hidden.
- `frontend/tests/use-app-version-watch.test.mjs` — no polling steady state, mismatch toast on tab-return, ChunkLoadError reload.

### Architecture pass

**Run `/improve-codebase-architecture` on `frontend/components/loading/` BEFORE first migration.** Today's modules (`loading-page.tsx`, `process-loading.tsx`, `particle-loading.tsx`) are shallow + scattered. The deep module replaces them as a single import surface. Pages must not depend on the legacy three separately — they depend on `<RouteLoading />` which internally picks the right tier. This is the deepening that prevents drift as P0 → P1 → P2 migration progresses.

### Out of scope for v1 (logged for later)

- Synthetic monitoring (Lighthouse CI in PR pipeline) — defer until RUM telemetry surfaces enough p75 noise.
- Vercel Pro upgrade — revisit when Speed Insights shows sample dropping or when DAU pushes past ~7k page-views/month.
- Predictive pre-fetch (prefetch likely-next-route on hover) — adds compute, defer until base TTFA target met.
- Per-deploy regression alerts (PagerDuty / Slack) — defer until baseline p75 stable for 2 weeks.
- Mobile-vs-desktop budget split — current targets are mobile-first by default; revisit if desktop measurably faster.

---

## SKILL INTELLIGENCE PAGE — REDESIGN TRACKER (Backlog #10)

**Phases 1–3 ✅ DONE 2026-05-16** — SkillCard + Log-to-Forge + CV/Intel links · stat-line reframe · `?skill=` deeplink · color-coded domain strip · ScoreRing hero + WeaknessSpotlight · DomainRadar SVG-only · inspector absorbed into radar card · `components/skills/` extraction (page <300 lines). Dead code deleted: `dashboard/domain-drill-dialog.tsx`, `dashboard/domain-radar.tsx`. Full detail in `docs/session-history/2026-05.md`.

**Defer to v2:** domain layer separation · Rename Mirror→Myro in remaining strings · Pillar pages `/careers/*`

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
1. ✅ Shareability v1 — referral hook (closed 2026-05-19).
2. `packages/api-client/` extraction with injectable storage adapter (AsyncStorage/localStorage).
3. All backend routes prefixed `/v1/` — versioning contract.
4. `device_tokens` table + `POST /push/register` — FCM/APNs.

**v2 layout:** `mobile-native/` sibling folder (Expo SDK 51+ TS), NOT inside `frontend/`. Native libs land only in `mobile-native/package.json` (Expo-on-Next bundler pollution = Vercel break).

**Decisions still open:** monorepo tool (lean turborepo), auth flow (deep-link vs `expo-auth-session`), diary push cadence (8pm local default), Android-first.

**Open deepenings:**
- ⏸ `<ResponsiveStack>` primitive — DEFERRED. Trigger: any new page adding 4+ `tm-<page>-*` class hooks.
- `packages/mobile-shared/` extraction — blocked on `packages/api-client/` + turborepo decision.

---

## SHAREABILITY v1 — ✅ CLOSED 2026-05-19

Backlog #12 shipped. Full plan + DB migration + design spec archived in `docs/session-history/2026-05.md`. Decisions SH1–SH7 stay in **DECISIONS LOCKED** above.

**v2 (deferred):** XP-for-referral trigger on `welcome_xp_granted = TRUE AND referred_by_user_id IS NOT NULL`. `referrals_log` analytics table. Mentor/mentee surfacing. Public profile theming.

---

## PROCESS TRANSPARENCY LAYER — ✅ CLOSED 2026-05-19

Full plan + Q1–Q9 decisions + v2 deferred list archived to `docs/session-history/2026-05.md`. Migration `20260517_tracker_v1.sql`. Backend `jobs/review.py`, `jobs/stale.py`, `companies.py`. Frontend `/tracker`, `/companies/[slug]`, ReviewModal, ManualAddModal.

---

## PARKED OPEN QUESTIONS (from graphify refresh 2026-05-18)

Park-and-solve list. Pick up when working in the related area. Source = `graphify-out/GRAPH_REPORT.md`.

### Cross-community bridge nodes (high betweenness — verify intentional coupling)

1. ~~**`compute_and_persist_score()` — betweenness 0.083.**~~ ✅ DONE 2026-05-19 — Audited via `/improve-codebase-architecture` + `/grill-me`. Tracker bridge was a false INFERRED edge (0 tracker callers). Function had 6 params + 4 modal flags + 2 contradictory calling modes hidden behind one name. Split into 3 typed facades: `record_cv_score`, `recompute_score`, `project_score`. Engine + persistence stayed canonical (OQ4 invariant preserved). New modules `services/scoring/orchestrator.py` + `aspirations.py` + `market.py`. Deleted `scoring_engine.py` shim + `persistence.py`. See `docs/adr/0002-scoring-facade-split.md`.
2. **`ScoresRepository` — betweenness 0.057.** Bridges 5 communities (CV Upload, CV Compose Hub, Tracker, Job-Skills RPC, LLM Overlap). Solve when: refactoring repository layer or splitting scoring concerns.
3. **`fetch_all_rows()` — betweenness 0.033.** Bridges `CV Compose Hub` → `Tracker Endpoints` → `Job-Skills RPC` → `Lightcast Backfill`. Solve when: query-pattern review (likely a fetch-all hotpath worth specializing).

### INFERRED-edge audit (LLM-guessed connections — confirm or prune)

4. **`JobsRepository` — 30 INFERRED edges.** Sample: `Q7: snooze the 7-day stale prompt by bumping last_stage_changed_at = now()`, `Fire-and-forget: compute first 5 matches after CV upload`. Solve when: touching `repositories/jobs.py` or stale-clock logic. Audit during Backlog #8 (Process Transparency Layer).
5. **`ScoresRepository` — 47 INFERRED edges.** Largest INFERRED footprint. Solve when: scoring refactor.
6. **`CVRepository` — 18 INFERRED edges.** Sample: `CVTextRequest`, `EducationItem`. Solve when: working on CV Builder v2 surface.
7. ~~**`generate_job_cv()` — 22 INFERRED edges.**~~ ✅ DONE 2026-05-19 — Legacy flow removed in cv_versions unification 2026-05-18. Cleanup pass 2026-05-19 stripped trailing historical docstrings in `job_path/__init__.py` + `llm_polish.py`.

### Refresh hygiene

8. **Graphify doc/image refresh deferred.** AST-only update on 2026-05-18 skipped 306 docs + 38 images. DMMT screenshots, design references, and markdown notes still reflect May 13 snapshot. Solve when: budget allows full `--update`, OR when working on landing-page / DMMT-design surfaces, run scoped LLM pass on `frontend/Black_futuristist_frontend/project/uploads/` + repo-root markdown.

### Architecture (deferred deepenings)

10. **Extract `useCVPlayground(jobId)` hook for CV Builder state.** `app/cv/page.tsx` owns scattered `useState` + derivations for the playground state machine: `playgroundDirty`, `selectedVersionId`, `hiddenItems`, edit/polish targets, sync detection. Currently all complexity is local to one page, so the locality gain is moderate. Solve when: a second consumer needs to ask "does the user have unsaved CV changes?" (nav-away warning, mobile preview surface, share-token preview, etc). Today's recommendation: wait for the second consumer before deepening.

### UX systems audit

9. ~~**Loading-state audit across the entire frontend.**~~ ✅ DONE 2026-05-19 — Closed as the foundational loading system, not as the separate verbal-scaffolding copy pass. Shivam's concern was that empty states felt "disappointing and depressing" because users could not tell fetching from genuine emptiness. Decision: keep a 3-tier system. **Shell skeleton** = `AppShellSkeleton` + `react-loading-skeleton` for auth/session chrome. **Process loading** = `components/loading/process-loading.tsx` + `components/loading/loading-page.tsx` + `app/loading.tsx` for route-level and multi-step work; adapters now include `IntelLoadingState` and onboarding CV analysis. **Ambient loading** = `components/ui/particle-loading.tsx` for immersive full-region waits (`/skills`, `/companies/[slug]`). Inline loading remains for tiny surfaces (`Button loading`, small row/card skeletons). Shipped with `/market` heatmap readiness fix and splash-screen token cleanup. Remaining UX copy/emotional tone work belongs to the Category B verbal-scaffolding pass, not this parked audit.

---

## LAST SESSION SUMMARY (2026-05-19 · Skills card 3-button restore + CV deeplink)

Skills page `InlineSkillCard` had lost its upgrade affordance (only name + tag + excerpt rendered). User specced 3 buttons; design choices locked inline via AskUserQuestion (icon-row always visible · keep 20 XP gate w/ free unlock · add `/cv?skill=` deeplink).

- **Skills card — `frontend/components/skills/domain-accordion-row.tsx`** — `InlineSkillCard` rewritten. Now renders 3 always-visible icon buttons after the excerpt: ✎ Edit CV pointer (Link to `/cv?skill=<display_name>`), ✦ Polish with AI for next level (`users.skillLevelUpAdvice`, -20 XP, FREE pill when `forged_level_up_available`, advice expands inline below buttons), ☆ Track upgrade in diary (`diary.createEntry` skill-focused template, flips ☆→✓ on success). New `IconBtn` helper with hover-accent + disabled/active variants. Token threaded through from `DomainAccordionRow`. `useXPStore.setBalance` updates wallet on advice spend.
- **CV deeplink — `frontend/components/cv/version-ledger.tsx`** — new optional `highlightSkill` prop. `buildHighlightedSegments` splits preview text into `{k, v, hit}` segments; `<pre>` body renders `<mark>` (accent bg + ring) for hits, `<span>` otherwise. First hit gets `ref={firstHitRef}` and `useEffect` calls `scrollIntoView({block:'center', behavior:'smooth'})`.
- **CV page — `frontend/app/cv/page.tsx`** — reads `searchParams.get("skill")` → passes `highlightSkill={skillFocus}` to `CVVersionLedger`. Only wired in Mode 2 (baseline, no jobId). Mode 3 (tailored playground) skipped — carryover.

Verify: `tsc --noEmit` clean · `next lint` 0/0. No backend touched, no tests added (frontend-only behavioral change).

Open (carryover from this session — see Backlog #16):
- Fix-my-level picker — restore, modal-ize, or sunset.
- `?skill=` highlight in `CVPlayground` Mode 3 BulletRows.
- Diary log cache invalidation + XP wallet refresh on success.
- Word-boundary guard on substring match (short-skill false positives).

Open (carryover from prior sessions — still standing):
- Backlog #13 code: `/improve-codebase-architecture` on `frontend/components/loading/`, then `<RouteLoading>` deep module + `/v1/status` + telemetry.
- `packages/mobile-shared/` extraction (blocked on `packages/api-client/` + turborepo decision).
- ADR for Company CV Thread decision (CV2 lock).

## EARLIER SESSION SUMMARIES

Full detail in `docs/session-history/2026-05.md`.
