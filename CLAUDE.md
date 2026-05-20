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

13. **Frontend loading-time reduction + deep loading module** (locked 2026-05-19 via grill-me) — full plan below. Do NOT code until `/improve-codebase-architecture` pass on the deep module lands first.

16. **Skills card — inline CV-pointer edit loop — carryover:**
   - **Fix-my-level picker.** Old rich `SkillCard` had a 0–5 level-correction picker calling `users.correctSkillLevel`. Still not surfaced. Decide: restore as 4th icon, surface in per-skill modal, or sunset entirely now that forged level-ups give a richer signal. Endpoint + API client still exist.
   - **CV deeplink Mode 3 (tailored playground).** `?skill=` only highlights baseline ledger (Mode 2 — `hasBaseline && !jobId`). If user lands on `/cv?jobId=…&skill=…`, the `BulletRow`s inside `CVPlayground` are not highlighted. Wire `focusSkill` into `CVPlayground` + scroll first matching bullet into view.
   - **Diary log cache invalidation.** `logDiary.onSuccess` only flips local `logged` state. No `queryClient.invalidateQueries` for diary list, daily_logs, scores, or XP balance refresh — diary entry awards +30 XP that won't appear in the wallet until next manual refetch.
   - **`/cv?skill=` deeplink fidelity.** Substring match is naïve — short skill names ("R", "Go") will false-positive. Add word-boundary guard, or pass skill `key` instead of `display_name` and let the CV side resolve to the evidence_text excerpt.
   - **`render_baseline_text` ↔ `parse_cv_text` shape drift.** New baseline body is rendered via `cv_compose.render_deterministic` (capitalised section headers, `•` bullets). The downstream `parse_cv_text` LLM tagger has only been exercised on raw PDF/DOCX text; smoke-check that re-tag still extracts skills correctly from the synthesised body, otherwise add a stripped variant fed to the tagger.
   - **Stale `tailored versions` UX (SE9 carry).** No UI badge yet on tailored rows when a newer baseline lands. Ship `(based on older baseline)` pill in v2.
   - **Author parent_version_id chain on baselines.** SE1=A keeps baselines immutable, but the new baseline is currently orphan (parent_version_id=NULL). Linear history via parent pointer would let the ledger show evolution. Requires loosening `CVVersionsRepository._validate_kind_job_id` to allow `baseline_upload` w/ parent. Defer until ledger UX needs it.

17. **CV Builder three-view redesign — carryover (2026-05-20)** — `/cv` rebuilt from Claude Design handoff into Baseline / Playground / PDF views (see LAST SESSION SUMMARY). Open items:
    - **Per-bullet drag-reorder UI.** Handoff prototype had drag-to-reorder bullets inside the playground. NOT shipped because `cv_versions` schema has no per-bullet order column. To revive: add `bullet_order JSONB` to `cv_versions`, extend `cv.versions.create`/`edit` to accept it, then wire `BulletRow` drag handles + `onDragStart/onDrop` handlers (atoms already structured to accept them).
    - **JD source in intel drawer.** `IntelDrawer` reads `application.job_description` via `jobs.applications()`. Section hides silently when null. Once the scraper backfills JD text for older jobs, no code change needed — chip up.
    - **ATS audit hardcoded 7/7.** `pdf-preview-view.tsx` always renders 7 green ticks. Wire to a real server-side ATS parser (filename heuristics + section-heading sniff + table detection) when budget allows.
    - **`?skill=` deeplink highlight into `LivePreview` BulletRows.** Carry-forward from 2026-05-19 (Mode 3 deeplink fidelity). The skill keyword should highlight matching bullets when arriving at `/cv?jobId=…&skill=…`. Pass `focusSkill` into `BulletRow` and add a `tm-skill-pulse` outline class.
    - **Word-boundary guard on substring match.** `bulletKeywordHits` + `highlightKeywords` use raw `.includes()`. Short skills ("R", "Go", "AI") false-positive. Add `\b{kw}\b` regex variant when kw length ≤ 3.
    - **Match score persistence.** Currently passed via `?score=N` URL param to PDF view. Fine for v1, but lossy on refresh. v2: snapshot into URL state or recompute from `cv_versions.hidden_items` on PDF mount.
    - **Lineage chain in BaselineView.** Commit graph draws threads as flat lists; doesn't draw vertical `parent_version_id` lines between siblings yet. Once `parent_version_id` chains land on baselines (SE1 carryover above), connect the dots.
    - **Inline bullet edit → server.** `BulletRow` has `editable={false}` everywhere in PlaygroundView right now. The inline edit path requires routing through `cv.versions.edit` (which expects `Record<original, next>`). Wire when scope clarified — for now, polish-then-edit-polished modal remains the edit affordance.

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

## LAST SESSION SUMMARY (2026-05-20 · CV Builder three-view redesign)

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

## EARLIER SESSION SUMMARIES

Full detail in `docs/session-history/2026-05.md` (includes 2026-05-20 Feedback Hub redesign + 2026-05-19 Skills card inline CV-pointer edit loop).
