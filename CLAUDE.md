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

**Architecture deep-dive (CODE):** `graphify-out/GRAPH_REPORT_frontend.md` + `graphify-out/graph_frontend.html` (940 nodes · 890 edges · 50 communities · AST-only, refreshed 2026-05-31 — reflects Practice×Skill merge + comments + streaming + 10-min-CV tail). NOTE: the unsuffixed `graphify-out/GRAPH_REPORT.md` / `graph.json` is a SEPARATE docs/feedback corpus graph (`reference/`, `User_feedback_docs`), NOT the codebase.

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
- **CORS gotcha:** `ALLOWED_ORIGINS` env var is **DEAD CONFIG** — not read anywhere. CORS hardcoded `allow_origins=["*"], allow_credentials=False` in `backend/app/main.py:41` (safe: bearer-token auth, no cookies). To lock origins, wire `main.py` (code change → Develop + tests).
- **DNS:** himyro.com on **GoDaddy**. `api` = CNAME → `rm336p0v.up.railway.app`; `_railway-verify.api` = TXT `railway-verify=<token>` (**single** prefix — a doubled `railway-verify=railway-verify=…` blocks cert issuance; cost real time 2026-06-03). Railway custom-domain cert needs BOTH records verified or it serves wildcard `*.up.railway.app` → TLS name mismatch → curl 000.
- **Railway mgmt = MCP** (`mcp__railway__*`). Pass **snake_case `service_id`** or reads default to the linked service. `remove_service` confirm-boolean is broken via MCP → final service deletion needs a dashboard click.
- **Cutover runbook:** fix DNS → wait cert green (`curl api.himyro.com/health` = 200, not 000) → THEN flip Vercel env + redeploy → verify → only then touch the old service. Flipping Vercel before cert live = outage.
- **LLM chain:** OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid.

---

## OPEN BACKLOG

23. **Market filter rework — cleanup debt (logged 2026-06-05, do in dedicated hygiene pass):** The filter rework (GRILL LOCKED, `memory/project_market_filter_rework.md`) deliberately leaves dead config to keep its diff small/low-risk. After the rework ships, rip out in a SEPARATE pass: (a) old sort modes `personal`/`role`/`company` in `backend/app/repositories/jobs.py` `feed_jobs` (superseded by `sort=fit`); (b) `targetRoleOnly` + `freshnessDays` params across API/repo (`lib/api.ts` `JobFeedParams`, `use-job-feed.ts`, repo signature) — UI-unused after the 4-section sheet drops Freshness-cutoff + Target-role-only. Touches feed cache-key tuples + tests, hence decoupled. Trigger: after market-filter-rework PR merges + is verified in prod.

22. **Job-card render contract — new scraper columns (HANDOFF 2026-06-04, ready to code):** The firecrawl_Supabase scraper now produces, on the `jobs` table, a clean LLM **`job_summary` (≤100 words)** plus structured chip columns **`date_posted`, `seniority_level`, `work_mode`, `min_years_experience`, `max_years_experience`** (migration `scraper/sql/add_jobs_summary_cols.sql`, project `gipvxuugajkugntwkeiz`). **Ask:** on the live jobs-card feed, render the card body from `job_summary` (NOT the raw `job_description` blob — that carried scrape junk like `[Skip to main content]`/`Date published`/req-IDs for some ATS), each structured fact as its own chip, and keep full `job_description` reserved for the detail view + Tailor-CV flow. Fall back to truncated `job_description` only when `job_summary IS NULL` (legacy rows not re-enriched; old rows are NOT back-enriched — they age out via 45-day delist). `locations[]` chip array already shipped. Full spec + render skeleton: `docs/HANDOFF_job_card_columns_20260604.md`.

21. **Read-path latency at scale — FLAG for next run (raised 2026-06-04, NOT scoped):** Prod logs during a single user's session show pervasive `metric route.slow`: `/home/bootstrap` 4–6.5s, `/jobs/feed` 5–6s, `/jobs/my-skills/demand` 5–6.7s, `/jobs/analytics/me` 3.8–4.5s, plus the **Intel skill-heatmap thundering herd** — one `useQuery` PER followed company (IH3 by design), so a heatmap fires 10–15 parallel `/jobs/analytics/skill-heatmap?companies=X&skills=<~40 skills>` requests at once; several hit 1.2–3.6s and one died mid-stream with `httpcore.WriteError: [Errno 32] Broken pipe` → 500. At 10k concurrent users these read paths are the next thing to fall over (DB connection pressure + Supabase PostgREST saturation), independent of the refresh-crash already fixed (commit `f334340`). **Concern to resolve next session:** (a) is per-company heatmap fan-out the right shape at scale, or should it be ONE batched `?companies=a,b,c` round-trip? (b) why are bootstrap/feed/demand 5s — N+1 reads, missing indexes, or per-request LLM/derive work? (c) the broken-pipe 500 = client aborted (heatmap row unmounted / navigated) while the server still streamed — needs graceful client-abort handling, not a 500. Needs a perf-profiling pass (EXPLAIN ANALYZE the slow RPCs + count queries per endpoint) before deciding. No code yet — Shivam said "don't fully understand the ask, just note it."

18. **Dashboard `/home` loading redesign (GRILL LOCKED 2026-06-01, NOT built):** Triggered by shivam.mit20 screenshot — generic "Loading your dashboard…" + a LYING "FIRST CV IN 10 min" first-run pill shown to a veteran (firstRun defaults TRUE while `cv.versions` undefined). 14 decisions locked in `memory/project_dashboard_loading_redesign.md`. Model = **section-readiness** (not phases — `/home` is parallel client queries, not a server job). Two PRs: **PR1** = correctness — kill global `blocking` gate (`home/page.tsx:187`), `SectionGate` composition, co-located real-shape skeletons (reuse real `mc-hero`/`db-row` classes; delete orphaned `HomeSkeleton` mirroring pre-merge layout), per-section 6s tail copy, **pill-bug fix** (`isFirstRun(undefined)` → not-first-run + `.tm-cv-promise` gap CSS), delete floating `top:76` text. **PR2** = the "no-shimmer" cursor/touch-reactive **teal-edges playground** — extend `EdgeGlow` into a shared `<TealField mode=full-bleed|masked>` primitive; field-fill behind real-shape teal-edged cards that crossfade per-section; ambient-never-blocking, compositor-only + hard-teardown-on-ready, no gyro on mobile. Needs one "loading model" ADR (after ADR-0009). Sibling of the CV-upload loading redesign (`project_cv_loading_redesign`).

19. **B2B Institutions lane — STEP 1 SHIPPED 2026-06-01, growth steps DEFERRED.** Beta-phase decision: ship only the demand-sensing front door, not the platform. **Done this session (uncommitted, Develop):** (a) `/institutions` canonical marketing route — reuses `<EnterpriseSignup initialMode="institutions">`, indexable, OG, `/signup/institutions` canonical→`/institutions` to dedupe; (b) **header entry** "For Colleges" (`GraduationCap`) in `components/public/top-nav.tsx` + footer "For Colleges" under Product; (c) **CRM hook** — `POST /institutions/apply` now schedules a best-effort email to `settings.institutions_lead_email` via `BackgroundTasks` (mirrors Myrology booking-notify; fail-soft, row persisted first). New env `INSTITUTIONS_LEAD_EMAIL` — set it in Railway or applications stay persist-only/silent. The `institution_applications` table + the rich beta-access form already existed. **Re-skin to light also shipped this session:** `/signup/institutions` forced `data-surface=light` on mount + `--tm-radius-md` defined (cards were rendering 0-radius) + `--es-shadow-sm` retuned off dark `rgba(0,0,0,0.4)`. **DEFERRED until we decide to grow B2B (do NOT build until real applications arrive):** Step 2 = proper CRM/pipeline (HubSpot/Salesforce or a lightweight internal review queue UI over `institution_applications`, Slack alert, status workflow). Step 3 = multi-tenant platform — each college = org/tenant, placement-officer admin console, students as sub-users, SSO/SAML (Workspace/365/IdP), domain verification, bulk/CSV student import, cohort dashboards + placement analytics (the 6 capability cards are promises, not built). Also deferred: dedicated long-form `/for-colleges` marketing page with case studies/ROI (today `/institutions` = the rich signup pane doubling as landing), procurement collateral (security doc, DPA, MSA), pricing. Trigger to pick up: inbound beta applications show real business signal. Reverses ADR-0005 "not a B2B sales tool" NOT. Memory: `project_b2b_institutions_lane`.

20. **Enterprise Polish Sprint — Mobile UX + Core Bug Fixes (PLANNED 2026-06-02, ready to code)** — Triggered by deep audit of `reference/` folder: 100+ screenshots, 20+ user feedback docs, and 6 pre-written `reference/mobile-redesign/*/HANDOFF.md` specs. Goal: make Myro feel like an enterprise-grade B2C product. **Everything below is code-ready — no more grilling needed. Claude Code picks up and executes in order.**

   **Overarching theme from 20+ beta users:**
   - "Don't know what to do first" — no onboarding flow
   - "Feels robotic / AI-generated" — harsh contrast, technical jargon
   - "Confusing on mobile" — 6 specific layout bugs all with HANDOFF docs
   - "Blank or broken states" — Tracker empty state, Intel empty state feel abandoned
   - "What does this platform actually do?" — identity confusion on first visit

   ---

   ### PR-K — Design Token Foundation (LAND FIRST — all other PRs depend on this)
   **Spec:** `reference/mobile-redesign/k-tokens/HANDOFF.md` (complete, self-contained)
   **Files:** `frontend/app/globals.css`, `frontend/tailwind.config.ts`, `frontend/app/cv/cv-builder.css`, `frontend/components/public/public-nav.css`, `frontend/components/public/intel-pane.css`, `frontend/components/skills/domain-accordion-row.css`, `frontend/components/forge/forge-xp-pill.css`
   **What changes:**
   - Page bg `#000` → `--bg-page: #0a0a0c` (near-black, not void)
   - Cards get `--bg-surface: #13141a` (visibly above page — layered depth)
   - Primary text `#fff` → `--text-primary: #e8e8ea` (off-white, eye-safe)
   - Cyan text `#22d3ee` → `--accent-text: #67e8f9` (desaturated when used as text, full saturation for icons/buttons only)
   - Body min-size floor: `16px / 1.55 line-height` everywhere
   - Full token table in HANDOFF. No hex literals in any new/updated CSS.
   **Acceptance:** WCAG AAA primary text vs bg-page. Cards have visual lift without border. Reading a skill card paragraph feels comfortable at arm's length.

   ---

   ### PR-B — Signup Simplification (depends on PR-K)
   **Spec:** `reference/mobile-redesign/b-signup/HANDOFF.md` (complete)
   **Files:** `frontend/app/signup/page.tsx`, `frontend/components/onboarding/NinjaNameStep.tsx`
   **What changes:**
   - REMOVE "SECRET NINJA USER_CODE" field from `/signup` entirely. Real user typed `"dont know it should not be here"` into it — smoking-gun evidence it breaks conversion.
   - REMOVE the "BACKGROUND" light/dark theme toggle from the signup form.
   - Signup = 2 fields only: Email + Password. Plus Google button below "or" divider.
   - Ninja name moves to `NinjaNameStep` in onboarding (already exists per commit `aa7a879`) with auto-generated default (`silent-fox-9k2` pattern) + Skip option.
   - Referral attribution: if `?ref=` present, show subtle 1-line "Invited by @{name}" above form (SH7).
   - Backend: `ninja_name` field in signup payload becomes optional — server auto-generates if absent. Verify `suggest_ninja_name` endpoint (`backend/app/routers/profile/public.py`) handles this.
   - Mirror styling fixes to `/login` for consistency.
   **Acceptance:** 2-field form, no ninja field, no theme toggle, NinjaNameStep has pre-filled default + Skip, input height ≥44px, input font ≥16px (no iOS auto-zoom).

   ---

   ### PR-E — Skills Overview Mobile Header (depends on PR-K)
   **Spec:** `reference/mobile-redesign/e-skills-overview/HANDOFF.md` (complete)
   **Files:** `frontend/app/skills/page.tsx`, `frontend/components/skills/` (score-ring, stat-line), NEW `frontend/components/skills/skills-overview.css`
   **What changes:**
   - KILL the horizontal stat-line `8 domains · 21 skills · 0 need proof · 3 below 40%` that wraps one-word-per-line on mobile (confirmed bug in screenshot, named in 2026-05-21 CLAUDE.md QA).
   - REPLACE with 2×2 stat tile grid on mobile / 1×4 row on tablet+. Each tile: uppercase label (11px, tertiary) + big number (tabular-nums, primary) + thin divider. Pattern = Stripe Dashboard mobile Home. Tap → filtered skill list (`?filter=below-40` etc).
   - Score ring becomes the visual anchor — increase to ≥120px diameter, explicitly stack ABOVE the stat tiles.
   - Score commentary ("Building foundation · Next milestone: 20 — Emerging") sits below the ring.
   - Tab bar (Intel / Map / Audit) stays BELOW the header — never overlapping.
   - Empty state for 0-skills users: calm prompt to upload CV, not "0 domains · 0 skills…"
   **Acceptance:** No single-word-per-line wrapping anywhere. 4 stat tiles tap-targetable. Ring ≥120px. All elements above fold or barely scrolling on 375px.

   ---

   ### PR-G — Intel Heatmap Mobile Layout (depends on PR-K)
   **Spec:** `reference/mobile-redesign/g-intel-heatmap/HANDOFF.md` (complete)
   **Files:** `frontend/app/intel/page.tsx` or `frontend/components/intel/` heatmap component
   **Status:** CLOSED for the Codex-assigned PR-5 heatmap slice by `3daff43 fix(ui)`.
   **What changes:**
   - Title "Where to invest your skill points" wraps one-word-per-line on mobile (same grid-shrink bug as skills). Fix: title stacks ABOVE the heatmap on mobile, not beside it.
   - Rotated column headers (skill names) clip text at 375px. Fix: horizontal-scroll heatmap with non-rotated short labels on mobile OR collapse to list view.
   - Empty cells showing "no roles match" prose → replace with em-dash `—` in cell (tap for explainer).
   - Sticky header offset on first row (company name hidden behind search bar shadow).
   **Acceptance:** Title readable on 375px. Column headers legible. Heatmap scrolls horizontally, nothing clips.

   ---

   ### PR-D — CV Playground Score Ring (depends on PR-K)
   **Spec:** `reference/mobile-redesign/d-cv-playground/HANDOFF.md` (complete)
   **Files:** `frontend/components/cv/builder/playground-view.tsx` + score ring component
   **Status:** CLOSED for the Codex-assigned PR-5 playground slice by `3daff43 fix(ui)`.
   **What changes:**
   - D1: Score ring center text overlap — `0`, `%`, and `JD MATCH` literally layer on top of each other. Fix: explicit vertical layout — numeral row → `%` baseline-aligned right → "JD MATCH" label as separate row BELOW the ring (not inside center).
   - D2: "−17 this session" punitive framing → replace with action-oriented copy ("13 skills to add → Forge them") OR drop the negative delta. The chip list below IS the action already.
   - D3: Job label is generic ("Sciences - Consultant") with no company name — show "Untitled company" explicitly if no company in data.
   - D4: Title-case chip text (`Time Series Analysis And Forecasting`) → lowercase "and" inside chips.
   **Acceptance:** Score ring center has clean 3-row layout. No text overlap at any score value 0-100. No punitive framing.

   ---

   ### PR-F — Skill Card Mobile (depends on PR-K + PR-E for tab bar fix)
   **Spec:** `reference/mobile-redesign/f-skill-card/HANDOFF.md` (complete)
   **Files:** `frontend/components/skills/skill-card-inline.tsx` + CSS
   **What changes:**
   - F1: Sticky "Intel · Map · Audit" tab pill overlaps domain card below it (L3 chip half-hidden). Fix: sticky pill needs solid `--bg-page` background + `box-shadow` to visually detach. OR convert to in-flow element if sticky isn't actually needed.
   - F2+F3: SE14 regression — mobile buttons show full labels ("Edit CV pointer", "Polish with AI · -20 XP") instead of icons-only at <480px. Fix: add/verify `.tm-skill-card-action-label { display: none }` at <480px. Buttons collapse from 3 full-width stacked (~180px) to one icon row (~48px).
   **Acceptance:** Tab pill never overlaps cards at any scroll position. At <480px exactly 3 icon buttons in a row with aria-label + title. SE14 enforced.

   ---

   ### PR-JARGON — Language Humanisation (standalone, no deps)
   **Status:** Codex-assigned feedback jargon slice CLOSED by `3daff43 fix(ui)`; keep the broader checklist below as historical audit context.
   **No HANDOFF doc** — but 15+ users explicitly called this out. Confirmed list of confusing strings:
   - "Forge" → keep the name (brand) but ADD a 1-line descriptor: "Forge · skill practice sessions" in the nav tooltip/label
   - "Immutable commits" → "CV versions"
   - "Terse, be specific" (Feedback Hub) → "Keep it short and clear"
   - "Email me when triaged" → "Notify me when reviewed"
   - "Low cosmetic" (severity) → "Minor visual issue"
   - "AT RISK" domain pill → add hover tooltip: "This domain has skills below 40% — needs practice"
   - "BUILDING" domain pill → add hover tooltip with what building means (L1-L2 range)
   - "Dispatch" anywhere user-visible → plain English equivalent
   - Feedback form bottom-left: verify it's actually functional (user Ravali + user Aditya both reported broken)
   **Files:** `components/nav/`, feedback hub component, domain pill component, anywhere these strings appear.

   ---

   ### PR-EMPTY — Empty State Designs (standalone)
   **Cross-cutting — multiple users reported Tracker + Intel feeling "broken" when empty**
   - **Tracker empty state:** Replace multiple `+ Add manually` buttons with single focused CTA → "Browse matched jobs →" (routes to /market feed). Remove duplicate affordances.
   - **Intel heatmap empty state (no followed companies):** Current state unclear. Add single illustration + "Star a company to track its skill demand" + "Browse companies →" CTA. Per IH1 (heatmap = followed companies only).
   - **Dashboard stats loading:** Section-readiness skeletons (Backlog #18 PR1) — connect to this sprint if not yet built.
   - **Jobs feed empty state (no matches yet):** "Your matches are computing — usually under 2 minutes" with shimmer skeleton rows, not a blank page.
   **Files:** `frontend/components/tracker/`, `frontend/components/intel/heatmap.tsx`, `frontend/app/home/page.tsx`

   ---

   ### PR-FORGE-BG — Forge Timer Background Persistence (standalone)
   **Status:** CLOSED by Codex in `4b28856 fix(forge)`.
   **Bug:** Forge timer stops/freezes when user navigates away from the Forge tab (user Ravali, user feedback report 2). 25-minute sessions that reset on tab switch are unusable.
   **Fix direction:** Store forge session `startedAt` + `pausedAt` in localStorage (or Zustand persist). On any page mount, check if an active forge session exists → re-derive elapsed time from `Date.now() - startedAt - pausedMs`. The timer widget should render on any authed page while a session is running (the forge XP pill / widget is already a global element — verify it consumes persisted time).
   **Files:** `frontend/components/forge/forge-xp-pill.tsx` + forge session state store. Backend `forge_sessions` is already the source of truth for completed sessions — this is a frontend-only time-display fix.
   **Acceptance:** Start a forge session on /forge, navigate to /cv, navigate back — timer shows correct elapsed time throughout. Tab-close + reopen within session window = timer continues from correct position.

   ---

   **Build order:** PR-K → (PR-B, PR-E, PR-G, PR-D, PR-F in parallel, all depend only on K) → PR-JARGON, PR-EMPTY, PR-FORGE-BG (all standalone, can ship any time after K).
   **Codex closure note 2026-06-03:** PR-G/PR-D Codex slices, PR-FORGE-BG, and the feedback-jargon slice are closed. PR-EMPTY remains Claude-owned.
   **Commit pattern:** one PR per item, `fix:` or `feat:` prefix, `tsc --noEmit` + `next lint` clean before merge.
   Memory file: `memory/project_enterprise_polish_sprint.md` (create on session start).

10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.

11. **Forge widget v2 (deferred, 2026-05-19 design pass):**
   - **Cycle counter** — show "cycle N" badge on widget; track sessions completed in a single login window.
   - **Long-press dismiss** — `×` requires 600ms press when mid-session w/ unclaimed XP; prevents accidental loss.
   - **Haptic equivalent** — scale-pop + soft glow burst on successful claim; navigator.vibrate(10) on mobile PWA.
   - **Streak multiplier** — N consecutive claimed cycles in a session = ×1.25/×1.5/×2 XP multiplier badge; resets on dismiss or 30min idle.
   - Pick up when v1 forge widget has been validated by real usage signals (claim rate, dismiss rate, return-to-forge rate).

12. **Multi-location targeting (parked 2026-05-21):** Allow up to 3 target locations in onboarding StepRole. Requires full-stack change — DB migration (`target_location TEXT` → `target_locations TEXT[]` + `target_location_countries TEXT[]`), RPC `get_candidate_job_ids_for_skills` to accept array + OR across countries, repository `_filter_job_ids_by_location` rewrite, backfill existing users. Mobile UI ready (chip multi-select pattern). Path A (UI lies, only first city filters) rejected on design-over-words rule. Pick up when single-location matching quality is validated and multi-loc backlog signal is real.

15. **Job Card Lifecycle Loop (idea, parked 2026-05-27):** Netflix-style lifecycle model for every job card — track `posted_at`, `first_seen_on_platform_at`, `last_seen_on_platform_at`, `delisted_at`. Pair the job-side lifecycle with a user-side application-stage loop: once a user saves/applies, prompt + track stage transitions (saved → applied → screening → recruiter call → interview → final round → offer/reject) and the dwell time in each stage. Aggregate cross-user signal per company/role: median time-to-first-reply, median screening→interview gap, ghosting rate, offer rate, typical funnel shape. Surface back to users as "what to expect from this company" + sharpen our own match ranking + power a future newsletter/intel surface. Pick up when we redesign the job card to make the experience better — this loop is the data engine that justifies the new card layout. Touches: `jobs` schema (lifecycle timestamps), `job_applications` (already has `status` + `last_stage_changed_at` per Q7), new `application_stage_events` event log, a nudge/reminder cadence for stage updates, and an aggregation RPC for company funnel stats.

14. ~~**Match refresh stuck at 2 results**~~ — ✅ **CLOSED, deployed in prod (confirmed 2026-06-05).** Tiered overlap floor live in `job_matcher.get_top_matches` (`min_skill_overlap`→`fallback_min_skill_overlap`, `min_viable_pool = top_n//2`, `top_n=10`, debug surfaces selected floor + qualified count). Verified in code.

17. **Legal hardening for 10k scale (DOCS DONE 2026-06-02, counsel sign-off open):** Entity now = **Myro Career Intelligence Private Limited** (renamed across terms/privacy). Payment T&C shipped on both money surfaces (XP billing modal + Myrology checkout carry Terms+Privacy consent line). Terms §07 **Payments, XP & Refunds** (XP = closed-loop credit, not RBI PPI; funds servers not jobs; Myro = distributor of company listings; **Cancellation & Refunds** — XP final, Myrology full-refund-before-delivery / non-refundable-after). India-compliance pass INTEGRATED via Legal Compliance Checker agent: **DPDP consent microcopy at signup** (`signup-form.tsx`), privacy §06 rights expanded (withdraw/nominate/erase), §03 purpose-limitation, §04 cross-border-transfer, §07 cookie-banner-not-required note, NEW privacy §11 **Grievance Redressal** (24h ack / 15-day SLA, IT Rules 2021), terms §08 operator/grievance disclosure, §10 fraud/gross-negligence carve-out, footer "Cancellation & Refunds"→/terms#payments (Razorpay live-key prereq). Razorpay is **LIVE** — prod backend (`mirror-backend-prod`) env `RAZORPAY_KEY_ID=rzp_live_SuJDCjSGSSkGAP` + secret, tested by Shivam 2026-06-03. Billing badge is key-derived → auto-shows "Secure checkout" (no test-mode warning) on prod. ⚠️ **Verify the matching frontend public key:** Vercel **production** env `NEXT_PUBLIC_RAZORPAY_KEY_ID` must = `rzp_live_…` (same pair as backend) or checkout signature mismatches. Dev backend has no Razorpay key (payments untestable on pre-prod unless test keys added). tsc/lint clean, uncommitted. Files: `frontend/app/terms/page.tsx`, `frontend/app/privacy/page.tsx` (+ `privacy-components.tsx`), `frontend/components/settings-modal.tsx`, `frontend/app/myrology/checkout.tsx` (+ `myrology.css`), `frontend/components/auth/signup-form.tsx`, `frontend/components/public/public-footer.tsx`. Memory: `project_payment_legal_terms`. **OPEN — NEEDS SHIVAM + COUNSEL (placeholders live in code, NOT autonomous):** (a) lawyer review of both docs; (b) **CIN number** → `[to be inserted]` in terms §08; (c) **named Grievance Officer** — section shows designation+`grievance@himyro.com` only, IT Rules want a named individual; confirm the `grievance@himyro.com` mailbox exists + is monitored (24h/15-day SLA is now a public commitment); (d) full registered office address (street+PIN, MCA record); (e) confirm Myro is **not** a Significant Data Fiduciary (so no statutory DPO; "Grievance Officer" label correct); (f) sign off INR 5,000 liability cap; (g) confirm Myrology refund mechanics match booking flow + final price (₹499 vs ₹200-300 intro); (h) EU/UK in-scope check (cookie note assumes auth-only cookies). Razorpay live-key activation needs Terms+Privacy+Refund pages visibly linked (done).

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

## LAST SESSION SUMMARY (2026-06-05 · Backlog audit + close-out — onboarding wiring, dashboard manual-add, stale-listing badge)

User asked to verify (in code) whether the beta-2 backlog items were actually fixed, then close the open ones. **Key finding: the backlog was STALE — most "open" items were already built.** Corrected wrong "NOT built" calls after locating real post-reshuffle file paths. All changes **uncommitted** (user commits): backend → main repo; frontend → nested `frontend/.git`.

- **PR-ONBOARD ✅ FIXED** — root cause: `auth/callback/page.tsx` intentionally routed first-run→`/welcome`, but `/welcome` was reduced to `redirect("/")` when welcome merged into landing → orphaned the complete `/onboarding` 6-step stepper. Flipped the one seam (callback:134 first-run → `/onboarding`). The `/onboarding` flow (cv→role→lens→companies→ninja→score) was fully built, just unreachable.
- **E1 manual-add (per Shivam directive) ✅** — "+ Add a job" now on the **dashboard** header (Myro/Liked feed), opens existing `ManualAddModal`, invalidates apps, auto-switches to Liked. Self-sourced `manual_web` apps already flow into the feed (`applied` ∈ LIKED_STATUSES). Files: `components/dashboard/dashboard.tsx`+`.css`, `app/(authed)/home/page.tsx`.
- **BUG-4 stale-listing ✅ BUILT (21d threshold)** — scoped to the market-feed path where the Apply-404 lives. Backend: `STALE_AFTER_DAYS=21` + `_is_marker_stale` + `last_seen` in `_FEED_COLUMNS` + `_feed_shape_row` exposes `last_seen_at`/`is_stale`; `JobFeedItem` schema. Frontend: type + drawer warning above Apply ("Last seen N days ago — may be filled; apply link could be outdated"). **Reverted** an over-scoped JobMatch (dashboard) path — no external Apply there = dead data. Backend `89 passed`, tsc/lint clean.
- **Verified already-built (my earlier "NOT built" was wrong):** E2 heatmap empty (`market/page.tsx`), E3 jobs-feed empty (`jobs-tab.tsx`), BUG-2 upload retry (api.ts — 3 attempts/90s/backoff/idempotent), BUG-1 filename, BUG-5 session, BUG-6 copy. #18 PR1 (nav.loading gate kills lying pill).
- **#14 match-refresh ✅ confirmed deployed** (tiered floor in code).
- **BUG-2 residual:** Android interrupt needs `_emitCVUploadTelemetry` reasonCode from prod — live data, not code (bumping retries = symptom patch).
- **⚠️ Git topology gotcha:** `frontend/.git` is a nested repo mid progressive-nav reshuffle (renaming `app/home`→`app/(authed)/home`). Main repo's `git status` shows SOME frontend files modified, others clean despite on-disk edits — check BOTH `git status` and `cd frontend && git status` when committing. Memory: `reference_frontend_nested_git`.

---

> **2026-06-04 PM session (refresh reliability — 3 root-cause fixes) shipped & committed to Develop** (`f334340` safe_read fan-out, `619c876` RQ binary-conn worker crash-loop, `6ab34e3` comments 500). Detail in git log. Backlog #21 (read-path latency) added there.

---

## LAST SESSION SUMMARY (2026-06-04 · Claude PR lane CLOSED + memory pruned for beta-2)

Codex/Claude PR split executed. **Codex done — do not redo PR-4/PR-5-slice/PR-6/PR-8** (commits `9e65611`/`3daff43`/`4b28856`/`c92cc2d`). Claude lane closed:

- **PR-3 living-master CV autosave — BUILT, migration APPLIED 2026-06-04.** Main CV edits MUTATE `latest_baseline` in place + snapshot prior content to new `cv_master_revisions` (additive — deliberately DECOUPLED from the locked big-bang collapse, which stays a separate Shivam-supervised hygiene migration). `PUT /cv/master` = cheap mutate (no XP, no LLM, save≠score); reuses skill_edit `render_baseline_text` + `skill_retag` bulk-lane re-score (SE17 `recompute_finished_at`). Frontend: `lib/cv-autosave.ts` (pure, 7 tests) + `lib/hooks/use-master-autosave.ts` (1.2s debounce · saving/saved/error · localStorage refresh-recovery · beforeunload persist · re-score shimmer) + `components/cv/builder/master-editor.tsx`(+css) mounted as inline **Edit** toggle in `library-master.tsx` MasterCVPanel. `cv.saveMaster` client + `MasterSaveResponse`. Backend (cv.py/structured.py/test, 3 tests) committed root `e59a84d`; frontend lives in nested `frontend/.git` (progressive-nav reshuffle in flight — Shivam owns those commits). tsc/lint clean. Memory: `project_living_master_autosave`.
- **PR-2** = 1 line: `forge` → `RequiresCV surface="skills"` (the hub absorbed Skills). Boundary itself already built prior sessions.
- **PR-1** (first-CV SLO) + **PR-9** (StuckBanner "They went silent" vs "I have an update" branch) found **ALREADY SHIPPED** — verified only (47 tests green, no regressions). PR-9 premium Practice-routing (No-Response-Recovery / Interview-Prep / Referral-Intelligence 500XP) = deferred epic; routes to Practice surfaces that don't exist yet, needs a grill.
- **PR-7** legal = coordinate-only, nothing built (counsel-gated, Backlog #17).

**Memory pruned 73→41 files for beta-2 launch:** removed shipped session-build notes (detail in git log + this file), kept durable working rules + governing decisions + active references + unbuilt/parked work. Index regrouped under headings.

⚠️ **Other open pre-deploy migration gate:** multi-location `20260602` NOT applied (`project_location_prefs_multiloc`).

> **Older session summaries pruned for a lean cockpit (2026-05-30).** Sessions ≤ 2026-05-28 were committed/shipped — full detail in `git log` and `docs/session-history/2026-05.md`. Live cross-session context lives in memory (`~/.claude/projects/-Users-incognito-True-Yodha/memory/MEMORY.md`). Only the latest sessions with **uncommitted or unbuilt** carry-over are kept above.

---

## BETA-2 UX HARDENING SPRINT — Backlog #20/#21 (mostly SHIPPED — verified 2026-06-05)

Full `reference/` audit (150+ screenshots, 20+ feedback docs) drove this sprint. **Nearly all shipped.** Detail in git log; only live carry-over kept below.

**Shipped + verified in code 2026-06-05:**
- PR-K tokens · PR-B signup · PR-E stat tiles · PR-D score gauge · PR-G heatmap labels · PR-FORGE-BG · PR-JARGON (Codex slices, prior sessions).
- **PR-ONBOARD ✅ FIXED** — first-run signup→`/onboarding` (callback seam `auth/callback/page.tsx`; `/welcome`→`redirect("/")` had orphaned the complete cv→role→lens→companies→ninja→score stepper).
- **PR-EMPTY ✅ CLOSED** — E1 dashboard "+ Add a job" (manual-add lives on the Myro/Liked feed per Shivam directive → `ManualAddModal`, invalidates apps, auto-switch to Liked); E2 heatmap empty + E3 jobs-feed empty already existed.
- **BUG-1 ✅** filename (cv-export derives `{name}_CV.pdf`) · **BUG-2 ✅** upload retry already built+tuned (3 attempts/90s/backoff/idempotent — residual Android failures need telemetry reasonCode, NOT more retries = symptom patch) · **BUG-4 ✅** stale-listing badge (21d threshold, market-feed `JobFeedItem.is_stale` + drawer warning above Apply) · **BUG-5 ✅** session (refresh-exchange + `/login?next=`) · **BUG-6 ✅** punitive copy (action label, no raw negative).
- **#18 dashboard loading PR1 ✅** — `nav.loading` skeleton gate fires before `nav.firstRun`, killing the lying first-run pill.

**STILL OPEN (carry-over):**
- **BUG-3 (minor)** — old "AT RISK/BUILDING" domain pill was DELETED in the skills redesign; the new per-skill tier label `L{n}·{label}` ([practice-skill-list.tsx](frontend/components/skills/practice-skill-list.tsx)) has no explanatory tooltip. Decide: add tooltip to the tier label, or drop (the pill it targeted is gone).
- **PR-F 375px QA (UNVERIFIED)** — open `/forge` on a 375px browser: confirm (a) Intel/Map/Audit sticky tab doesn't overlap cards, (b) skill-card buttons icons-only at <480px (SE14). If broken → fix.
- **#18 PR2 (NOT built)** — the "no-shimmer" teal-edges `<TealField>` playground (ambient, compositor-only, hard-teardown-on-ready). Sibling of CV-upload loading redesign.
- **BUG-2 next step** — root-cause the residual Android upload interrupt from the `_emitCVUploadTelemetry` reasonCode/network_type in prod logs (needs live data, not code).

---

### NEW DESIGN DECISIONS (Shivam to confirm before coding)

These require a product decision, not just a code fix:

**ND1 — Score framing on landing and first reveal**
Multiple users report the sample "62/100" on landing page makes them feel they're already behind before even signing up. User Aparna: "The sample score highlights what you're missing rather than what you have — discouraging for a new user." Proposal: change landing page score sample copy from "see what you're missing" framing to "see your strengths + your path forward" framing. Also on first score reveal (StepScore in onboarding), frame as "You're {score}% of the way to your first target role" not "Your Myro Score: {score}/100". **Needs Shivam sign-off on copy direction before touching.**

**ND2 — No product preview before signup**
Multiple users (Aparna, Aditya, Arham, honest user) report they wouldn't sign up without seeing the product first. Decision: add a 30-second interactive demo or screenshot carousel on the landing page BEFORE the upload CTA. Could be a static mockup or a video embed. **Needs Shivam decision on format before building.**

**ND3 — Special character corruption in CV parsing**
Reported: "R&D", "Néstor", and other non-ASCII strings corrupt during ingestion. Root cause: likely the CV text extractor (pdfplumber or similar) isn't handling UTF-8 edge cases. **Needs backend investigation — touch `backend/app/services/cv_parser.py` and add a test for special characters before fixing.**

---

### GAME ANALOGY FLAGGED BY USER (important, preserve)

> *(From user_feedback_1st_task.md, flagged as "very important" in the source doc):*
> The XP/streak/gamification system is genuinely clever and keeps people coming back — this is the product's strongest retention mechanic. Every agent and Claude session running should flag this to Shivam: **lean into the game analogy harder**. The platform already has XP, levels, forge sessions, streaks. What it needs is a visible "quest board" on the dashboard showing exactly what to do next to level up — not just Next Moves, but framed as daily/weekly missions. This is the difference between a platform users open once and one they open every day.

---
