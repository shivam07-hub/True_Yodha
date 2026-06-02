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

**Infrastructure:**
- Railway: `True_Yodha` → `Develop` → auto-deploy
- Vercel: `truemirror.vercel.app` → `main`
- Supabase: `gipvxuugajkugntwkeiz` (prod DB)
- LLM chain: OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid

---

## OPEN BACKLOG

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
   **Bug:** Forge timer stops/freezes when user navigates away from the Forge tab (user Ravali, user feedback report 2). 25-minute sessions that reset on tab switch are unusable.
   **Fix direction:** Store forge session `startedAt` + `pausedAt` in localStorage (or Zustand persist). On any page mount, check if an active forge session exists → re-derive elapsed time from `Date.now() - startedAt - pausedMs`. The timer widget should render on any authed page while a session is running (the forge XP pill / widget is already a global element — verify it consumes persisted time).
   **Files:** `frontend/components/forge/forge-xp-pill.tsx` + forge session state store. Backend `forge_sessions` is already the source of truth for completed sessions — this is a frontend-only time-display fix.
   **Acceptance:** Start a forge session on /forge, navigate to /cv, navigate back — timer shows correct elapsed time throughout. Tab-close + reopen within session window = timer continues from correct position.

   ---

   **Build order:** PR-K → (PR-B, PR-E, PR-G, PR-D, PR-F in parallel, all depend only on K) → PR-JARGON, PR-EMPTY, PR-FORGE-BG (all standalone, can ship any time after K).
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

14. **Match refresh stuck at 2 results (bug, root-caused 2026-05-25):** Account `shivam.mit20@gmail.com` triggers match refresh repeatedly, XP is charged then refunded ("no new matches"), but matches never grow past 2. **Root cause = compound pruning stack inside `job_matcher.get_top_matches`** (commented inline at `backend/app/services/job_matcher.py:73`):
    1. **MIN_SKILL_OVERLAP = 3** — hard floor. Jobs sharing <3 skills with the user are dropped before scoring. Narrow/junior CVs may only ever clear this on 1-2 jobs.
    2. **`top_n=5` cap** in `jobs_workflow.compute_job_matches` (line 213).
    3. **`COMPANY_CAP_RATIO`** anti-bias (30% per company) prunes further.
    4. **`excluded_job_ids` accumulates** across refreshes within the same batch_week (line 189-191) — by refresh N the pool may be empty.
    Not aspirations-related. Independent of the 2026-05-25 retry/fallback PR. Fix path under design: **tiered overlap floor (3 default → 2 if fewer than top_n/2 candidates qualify)**, raise `top_n` to 10-15, surface "pool exhausted" signal to frontend instead of silent refund, reset `excluded_job_ids` on batch_week boundary. Touches `backend/app/services/job_matcher.py` + `jobs_workflow.compute_job_matches` + match-refresh frontend invalidation. Pick up as standalone PR after Shilpa is re-tested with the 2026-05-25 fallback fix in production.

17. **Legal hardening for 10k scale (in progress 2026-05-30):** Privacy + Terms strengthened this session — Terms now carries a **Data Security** section, a **"Myro is not an employer/recruiter"** liability shield (no guarantee of jobs/interviews/responses, employer owns all hiring decisions, third-party listings disclaimed), **Limitation of Liability** cap, **Indemnification**, and **Governing Law = India (Bengaluru courts)**. Privacy gains a Governing Law / DPDP note. Entity = **Myro Career Intelligence**, Vasant Vihar, West Delhi, Delhi; venue = **Delhi, Delhi** (set 2026-05-30). **REMAINING before 10k (NOT autonomous — needs Shivam + counsel):** (a) lawyer review of both docs; (b) India DPDP Act 2023 compliance — consent notice on signup + named Grievance Officer per IT Rules 2021; (c) EU/UK cookie + consent banner if those users are in scope; (d) confirm the INR 5,000 liability cap. Files: `frontend/app/terms/page.tsx`, `frontend/app/privacy/page.tsx` (+ `privacy-components.tsx` TOC).

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

## LAST SESSION SUMMARY (2026-06-02 · Scheduled task: Enterprise Polish Sprint audit + plan)

**Automated Cowork session — no code written. Pure audit → plan.**

Deep-read every file in `reference/` folder: 6 mobile redesign HANDOFF.md specs, 2 user feedback aggregate docs (20+ beta users), 100+ screenshots spanning May 22–June 1. Cross-referenced with existing CLAUDE.md decisions.

**Key findings:**
- 6 mobile layout bugs have complete HANDOFF specs written but **none have been coded yet** (PR-K tokens, PR-B signup, PR-E skills header, PR-G intel heatmap, PR-D playground ring, PR-F skill card). These are blocking the "enterprise feel" every user asked for.
- 15+ users independently flagged: no onboarding, technical jargon, empty states feel broken, identity confusion on landing, harsh contrast on mobile.
- 3 functional bugs confirmed: Forge timer resets on tab switch, Feedback form broken (bottom-left widget), CV playground score ring text overlap.
- **Platform is shipping features faster than polish** — the delta between what's technically possible and what new users experience on day 1 is the primary churn risk.

**Outcome:** Added **Backlog #20 — Enterprise Polish Sprint** with 9 ordered, PR-ready items into CLAUDE.md. The next Claude Code session should read item 20 and execute PR-K first (design token foundation), then the remaining PRs in parallel.

**No commits made** (automated session — read + write CLAUDE.md only).

---

## LAST SESSION SUMMARY (2026-06-02 · Live Job Data feed redesign — SHIPPED to Develop)

`/market` rebuilt from movers+heatmap intel into an Inshorts/Perplexity **job-card feed** (grill-locked). Logged-in only; public landing intel untouched. Commits: `907f651` (filters lead, stats demoted, feed cache cadence), `ce77f9b` / `7fe5c44` (feed + intel-page cache), `5b283a0` (Tracker merged into CV workspace), `bee3f95` (practice×job merge).

- **Backend:** new `GET /jobs/feed` (company-agnostic, paginated; filters cluster→role_domain + location + free-text `q`; 3 sorts fresh/personal/company; no LLM). New `POST /jobs/{job_id}/report` (report-inactive per `docs/REPORT_INACTIVE_FEATURE.md`; `job_reports` table CONFIRMED live in Supabase 2026-06-02). `feed_jobs()`/`user_skill_keys()` in `repositories/jobs.py`.
- **Frontend:** `components/market/jobs-tab.tsx` (clickable stat cards + search + pill filters + 3-mode sort + infinite scroll + detail drawer); `market/page.tsx` gutted to Jobs|Heatmap tabs; `nav-items.ts` → Live Job Data leftmost, `/home` stays landing.
- **Beta-2 follow-ups CLOSED:** #1 feed contract test ✅ · #2 feed perf/caching ✅ (`907f651` raised cache cadence). Memory: `project_market_feed_redesign`.
- **Still open (carry-over):** per-city multi-location (firecrawl backlog #6) — feed shows single location string; `main_skills` legacy-column coupling for skill chips (drop-risk when job_skills supersedes).

> Shipped June sessions ≤2026-06-01 (dashboard card autonomy `527d7c1`, stacked match history `aa34b6d`, mobile job-card accordion, Myrology integrator [now in INTEGRATOR ITEMS], replace-CV modal) pruned for a lean cockpit — full detail in `git log`.


## LAST SESSION SUMMARY (2026-05-30 night · 10-min-CV fix — GRILL LOCKED + PR1 BUILT, master CV download)

Triggered by Shivam's question: does a first-time user actually get a downloadable CV inside the 10-min North Star? Codebase audit said **no** — four structural gaps. Grilled the long-term fix end-to-end (Google-Docs-model architecture), locked it, then built PR1 only. **Uncommitted on Develop** — Shivam pushes. tsc clean · `next lint` 0/0 (4 files) · 5/5 new tests.

### The four gaps surfaced (audit)
1. **No baseline/master download.** `cv/download-pdf` endpoint is content-agnostic (renders any `cv_text`) but the only frontend trigger is `PdfPreviewView`, reachable **only** via `?jobId` (tailored). Master = undownloadable.
2. **Onboarding dead-ends at `/skills`.** `StepScore` final CTA `router.push("/skills")` — score page, not a downloadable CV.
3. **Lying journey strip.** `baseline-view` step `03 "See score — download"` advertised a download with no button behind it.
4. **Add-info is tailored-only.** `playground-view` guards edits with `isEditableSelection = kind !== "baseline_upload"` → master not editable.

### Grill outcome — long-term architecture LOCKED (Google-Docs model)
Shivam asked "what would Google do?" → scanned the norm (Google Docs = one living document + autosave + derived version history + instant export; "Make a copy" branches). Decisions:
- **Q1 scope = B (fat):** full master editor, not just download. → phased.
- **Q2/Q3 = C → C1:** **split the two objects.** Master CV = living Google-Doc (one mutable row, autosave, always downloadable). Tailored versions = immutable commits branched off a master snapshot (SE1 invariant stays for tailored only). C1 = single living master row + new `cv_master_revisions` history table (derived, secondary). Reverses the current append-a-`baseline_upload`-row-per-edit pile — **that pile IS the bug**. `update_structured()` already exists → mutate path half-built.
- **Q4 = A:** tailored stays frozen content snapshot; `parent_version_id` = stable master row id; `baseline_version_id` = master revision id (exact branch-point preserved via history table). `baseline_version_id` already consumed (`cv.py:335` propagates), so wired-ready.
- **Q5 = A:** **save ≠ score.** Typing → autosave text (cheap DB UPDATE, no LLM, no XP, instant). Re-score = debounced async via existing SE17 `recompute_finished_at` + shimmer. Baseline edits stay **UNCHARGED** (matches today's skill_edit).
- **Q6 = A:** full structured editor — every section editable + add/remove (summary, skills_line, certs, experience+bullets, projects, education). Raw-textarea rejected (loses keyword/skill intel that feeds the score).
- **Q7 = A:** download is the **primary CTA at the score reveal** (inline `downloadPdf`, zero nav) — the value moment at the emotional peak. Journey strip step 03 becomes truthful.
- **Q8 = A:** persistent master download in `/cv` header (returning users) + Library hero. Filename `{First}_{Last}_CV.pdf`.
- **Q9 = A:** migration collapses N baselines → 1 master + history. Idempotent (manual-apply safety per `feedback_supabase_migrations_manual`; FK-safe: repoint before delete; data preserved in history table). Dry-run COUNT + backup + branch-DB test before prod.
- **Q10 = A:** **phased PRs**, one at a time. PR1 this session.

### PR1 SHIPPED (uncommitted, Develop) — master download, zero data-model change
**New files:**
- `frontend/lib/cv/download-master.ts` — `masterFilename(fullName)` (`{First}_{Last}_CV.pdf`, fallback `My_CV.pdf`) + `resolveMasterText(baseline, cv)` (persisted `body_text` → `renderDeterministic` fallback).
- `frontend/components/cv/download-cv-button.tsx` — self-contained one-tap PDF download (inline SVG glyph so it mounts on both authed `/cv` + onboarding surfaces; blob+`File`+anchor dance copied from `pdf-preview-view`; `<60`-char guard since endpoint requires `cv_text >= 60`; inline `role="alert"` error).
- `frontend/tests/download-master.test.ts` — 5 cases (filename slug, punctuation strip, 3-token cap, fallback; body_text preference + empty path). 5/5 pass via `tsx --test`.

**Edited:**
- `frontend/components/cv/builder/baseline-view.tsx` — `Download CV` button in the `/cv` header (between "Pick a target job" + "Update Main CV"). Uses existing props (`token`, `currentBaseline`, `cv`, `profile`). Fixes gaps 1+3 for returning users.
- `frontend/components/onboarding/step-score.tsx` — added `token` prop; fetches latest `baseline_upload` (`cv.versions.list` → filter → max `user_version_number`) + profile (`users.me`); renders **`Download your CV`** primary CTA + demotes `See Full Skill Intelligence` to secondary ghost. Fixes gap 2.
- `frontend/app/onboarding/page.tsx` — threads `token` into `StepScore` (`step==="score" && scoreData && token`).

### Verify
- `cd frontend && npx tsc --noEmit` — clean (fixed one TS1501: dropped `\p{L}` unicode-property regex → `[^\w\s-]`, backend `_sanitize_filename` is the final guard anyway).
- `npx next lint` 4 touched files — 0/0.
- `npx tsx --test tests/download-master.test.ts` — 5/5.
- Backend untouched. No migration. `cv/download-pdf` reused as-is.

### ALSO SHIPPED this session — Backlog #16 CLOSED (logged-out blank `/tracker`)
Stabilise win. Root cause wasn't "no redirect" — `useAuth` already bounced no-token → `/login`. Two real gaps fixed:
- **`lib/hooks/use-auth.ts`** — new `loginRedirectTargetFor(path)` (pure, exported, tested) + `loginRedirectTarget()` wrapper. Both redirect sites (cold-start bootstrap + cross-tab `storage` signout) now go to `/login?next=<path>` instead of bare `/login`, so post-login bounces the user back. Same-origin guard (reject `//`, `/\`, non-`/`) mirrors `nextFromQuery`; root + `/login` + `/signup` skipped to avoid redirect loop. Login side already consumes `?next=` (`useNextPath` + `LoginForm` push `next ?? "/home"`) — loop now closed.
- **`components/app-shell.tsx`** — gate widened `if (!m.ready)` → `if (!m.ready || !m.token)`. Stops authed children rendering token-less during the redirect-in-flight window (the actual blank-page cause). `(authed)/layout.tsx` mounts AppShell once for the whole group → this gate covers home/cv/skills/forge/market/xp/myro/mission/tracker uniformly.
- **`tests/login-redirect-target.test.ts`** — 3 cases (preserve path+query, skip root/auth pages, reject open-redirect shapes). 3/3 pass. tsc + lint clean.
- Tracker data already RLS-scoped (IH3/S3) — no service-role read on the user path, policies hold post-login. **Backlog #16 CLOSED.**

### 🔴 NEXT SESSION — FIRST THING: finish the 10-min CV delivery loop (#5)
**10-min CV delivery is Myro's first promise (North Star, [[project_ten_minute_cv_promise]]) — this loop leads next session.** Batch item #5 = "user downloads the improved CV as soon as possible." Status 2026-05-30: the #6 done-morph already delivers the front half (upload → inline score → `Improve {domain}` action). What's left is the **act → tailor → download** tail.

- **It routes through the skill surface — which is being MERGED into Practice (`/forge`).** See [[project_practice_skill_merge_grill]] (GRILL LOCKED 2026-05-30): rich skill cards (Edit CV pointer / Polish with AI) move INTO Practice expand-in-place; `/skills` survives only as overview + bridge link. So before/while building #5, **reconcile the done-morph's `Improve {domain}` target** (`components/cv/cv-score-progress.tsx` → currently `/skills?domain=X`) with the merged Practice surface — the deep link must land on the card where the user actually acts, then flows to tailor → `cv/download-pdf`.
- Build order next session: (a) land/confirm the Practice×Skill merge so the target surface is stable, (b) wire the 10-min lane end-to-end (score → improve card → tailor → download), (c) measure real p90 upload→downloadable-CV before advertising "10 min" externally.
- Infra note: durable dispatch ([[project_durable_dispatch_10k]]) is code-closed; the Redis/worker flip is a Railway **MCP** change ([[reference_railway_mcp_infra]]) — do it anytime, not a manual dashboard step.

### Open carry-over — NEXT, to stabilise
1. **PR2 — C1 living-master refactor** (locked above). New ADR (call it ADR-0008-class — confirm number vs the streaming ADR-0009). Migration is the risky bit: dry-run COUNT, Supabase backup, branch-DB test, idempotent, `NOTIFY pgrst` at end. Touches `cv.py` (latest_baseline → single master), `skill_edit.py` (persist-new-baseline → UPDATE master + snapshot), `cv_workflow._persist_baseline_cv`, `baseline-view.orderRows` (plural masters → single), `commit-graph`/`library-view` master-chain.
2. **PR3 — full structured editor** (Q6 A) — add/edit/remove every section, autosave text (free), debounced async re-score (SE17), baseline edits UNCHARGED. Depends on PR2 (mutable master).
3. **Stabilise-the-app open queue:** ~~dashboard-merge + shell-seam VISUAL QA~~ ✅ done · ~~3 `20260524_*` migrations~~ ✅ **APPLIED 2026-05-30** (+ `20260530d_job_deepenings` applied) · Backlog #14 match-refresh-stuck-at-2 → being fixed this session (free-refresh-on-XP) · Backlog #16 `(authed)` group auth-redirect guard (logged-out → blank `/tracker`) · P1 intel country→city cascade · HIGH mobile ledger (M01/M17/M18/M20/M22/M23/M25/M30/M31/M33) · ~~streaming PR1~~ ✅ shipped (`dd9ac59` FitRationale wired) · ~~Develop→main promotion~~ ✅ done · stale `mirror.vercel.app` purge (Shivam ops).

   **STREAMING VERIFY — OPEN (Shivam to confirm, 2026-05-30):** does Gemini's OpenAI-compat endpoint actually honour `stream=True` in `llm_provider.stream_complete`? OpenRouter + Groq confirmed; Gemini flash-lite leg UNVERIFIED in prod. If Gemini ignores `stream` and returns one blob, the typewriter still works (one big token) but loses the live feel + the pre-first-token fallback window shrinks. Confirm by watching a FocusedJob "Why you fit" stream while the chain is on the Gemini leg. Update this line once confirmed.
4. **Progressive-nav + dashboard-merge + shell-seam still uncommitted/unverified** on Develop — confirm they're in before layering PR1's commit.



Triggered by a job-card screenshot: Shivam asked why the LLM call shows no visible "thinking/working" like Claude — the user stares at a dead `Analyse this role to see Myro's reasoning.` placeholder while the backend computes. Chose **Option A — real token streaming (SSE)** over staged fake-progress. Ran `/grill-me` to lock the whole tree, then saved + drafted ADR-0009 + closed. **No code written** (Shivam said save + draft + close).

### Codebase reality surfaced during grill
- `job.llm_explanation` is the source. Top-3 ranked jobs get it FREE from the bulk ranker; the `0 FIT` placeholder = a saved job that never went through the ranker.
- `POST /jobs/analyse/{job_id}` ([backend/app/routers/jobs/analyse.py](backend/app/routers/jobs/analyse.py)) already exists (overlap → `complete(max_tokens=300)` → charges 10 XP → persists). **But `analyseJob` ([frontend/lib/api.ts:1800](frontend/lib/api.ts)) is called by NOTHING** — the button was never wired. Building = wiring the dead trigger + streaming it.
- **Pre-existing bug:** analyse charges 10 XP even on `LLMProviderError`. Fixed by the charge-on-success lock.
- Providers all `AsyncOpenAI` (OpenRouter/Groq/Gemini OpenAI-compat) → all support `stream=True`.
- No toast/nudge infra; `xpStore` just `setBalance`s silently across ~8 scattered charge sites.

### Locked (full detail → memory `project_streaming_rationale_xp_nudge`)
Auto-on-mount · charge 10 XP once-per-job, **on success only** (fixes charge-on-fail bug; idempotent re-view = cached) · broke (<10 XP) = **silent skip + discoverable `Analyse · 10 XP` button → XPGate on click** (OVERRODE Shivam's "auto-fire modal" pick — it's the 2026-05-28 per-login-hammer anti-pattern, per-cycle would be worse) · `fetch`+`ReadableStream` vs FastAPI `StreamingResponse` (EventSource rejected, bearer auth) · new `LLMProvider.stream_complete()` with **pre-first-token fallback only**, mid-stream death = partial greyed + retry, no charge · **typewriter smoothing** ~40–60 cps. Universal XP nudge = `−10`/`+30` delta **floats off the XP pill** (red spend / green earn, forge claim `silent`) via explicit `xpStore.applyXpChange({newBalance, action})` (NOT auto-diffing setBalance).

### Scope — PHASED (Q10)
- **PR1** — analyse streams **direct** (sync `StreamingResponse`, no Redis) + `useStreamingText()` + typewriter + XP-pill nudge seam. Ships the engagement win fast.
- **ADR-0009** — `docs/adr/0009-progress-stream-protocol.md` DRAFTED (Proposed). Typed envelope `{token|phase|progress|done|error}`, Redis pub/sub → SSE relay. Builds on ADR-0008.
- **PR2** — match-refresh + skill-edit adopt the relay, **drop polling** (ticket-poll + SE17 3s-poll).

### Carry-over (next session)
1. **Build PR1** per locked spec. Start: `LLMProvider.stream_complete()` → `StreamingResponse` analyse endpoint (charge-on-`done`) → wire the dead `analyseJob` trigger (auto-on-mount funded / button broke) → `useStreamingText()` + typewriter → XP-pill `applyXpChange` nudge seam (migrate ~8 sites).
2. Broke-button microcopy → `/ux-copy`. Verify Gemini honours `stream=true`.
3. PR2 is its own ADR-0009-driven PR after PR1 lands.
4. **All prior carry-over still open** — dashboard-merge visual QA (Shivam), progressive-nav commit, etc. None touched.

---

## LAST SESSION SUMMARY (2026-05-29 · progressive-disclosure nav grill COMPLETE + BUILT)

Resumed the paused progressive-nav `/grill-me` (Q1+Q1b were locked), grilled Q2–Q11 to close, then built the whole thing end-to-end. **Nothing committed** (commit when Shivam says). tsc clean · `next lint` 0/0 · 13 cv-upload-api + 6 cv-upload-state tests pass.

### Grill (Q2–Q11 locked) — full spec in `project_progressive_nav_grill.md`
Headline finding: **the `/onboarding/state` backend endpoint never existed** — `lib/api.ts` declared a phantom `onboarding` client + `OnboardingCards` (mounted on /home) that 404'd silently and rendered nothing in prod. "Backend already built" premise was false. → All unlocks now derive client-side from `cv.versions` + `users.me`.
- **Q2** unlocks client-side: cv=`≥1 tailored` · tracker=`≥2 tailored companies` (Shivam: 2 not 3) · myrology=`myrology_unlocked`.
- **Q3** TWO states only, signal `tailoredCount`: first-run (`=0`) vs returning (`≥1`). `onboarding_complete` dead for gating. First-run hero absorbs pre-upload invitation. Global skeleton contract: data-shaped placeholders.
- **Q4** countdown pill hybrid C: pre-upload static "First CV in 10 min" → server clock from `cv_upload_jobs.created_at` → expiry "FINISH CV" gentle nudge (no shame). First-run-only.
- **Q5** retire OnboardingCards + phantom client; CV-centric checklist Upload→Score→Tailor. Dead-code-sweep principle.
- **Q6** base tour DROPPED (friction vs speed). Bottom-right feedback FAB = "show me around". Keep NEW dots.
- **Q7** unlock plumbing subscribe+invalidate+localStorage-seen+queue. Returning nudge folds into state-aware-CTA project (NOT built here). Win metrics: first-run→tailor 1st CV · returning→mark next role.
- **Q8** gate mobile bottom bar; drop Skills; NEW dot only (no popover).
- **Q9** nav-grows panel first-run-only, CV Library + Tracker rows (omit Myrology).
- **Q10** drop wordmark, faint `beta` badge, keep /myro. `--tm-scrim` already existed.
- **Q11** unify authed nav → `lib/nav-items.ts` (stage/unlock/surfaces). Public nav separate. Forge = top pill not bottom slot.

### Built (uncommitted on Develop)
NEW: `lib/nav-items.ts`, `lib/hooks/use-nav-unlocks.ts`, `lib/cv-promise.ts`, `lib/hooks/use-cv-promise.ts`, `components/nav/{topbar-nav,cv-promise-pill}.tsx` + `nav.css`, `components/home/first-run-hero.tsx` + `first-run-hero.css`. EDIT: `app-shell.tsx`, `mobile/shell.tsx`, `app/home/page.tsx`, `app/cv/page.tsx`, `app/onboarding/page.tsx`, backend `cv_workflow.get_cv_upload_status` + `schemas/cv.py` (`started_at`, no migration — reuses created_at). DELETED: OnboardingCards/OnboardingChip/onboarding-cards.css, phantom `onboarding` client + types, `dataKeys.onboardingState`, dead `.tm-topbar-wordmark`/`.tm-topbar-nudge` CSS.

### Open carry-over for NEXT SESSION (discuss all)
1. **Commit** this PR (suggested `feat(nav): progressive-disclosure nav + first-run hero + 10-min CV promise pill`) — Shivam hasn't approved a commit yet.
2. **Visual QA** — dev server + screenshot first-run vs returning at 1280px + 375px; eyeball bg (constellation) + text sizes + coachmark scrim.
3. **Returning-user nudge** — build via the separate `project_state_aware_landing_cta` PR (S4-idle "pick a role to tailor for"). Q7 deferred it here on purpose.
4. **First-run loading flash** — has-cv-no-tailor user briefly sees returning layout during `nav.loading`. Cheap fix: data-shaped first-run skeleton while loading.
5. **Reconcile-from-server** — wire `reconcileCvPromise(status.started_at)` into cv/page `pollCVUploadStatus` resume path (~line 229) for cross-device/tab-close countdown accuracy (optimistic-only today).
6. **First-run-completion XP** — grant on real `tailoredCount` flip (dropped with OnboardingCards). Follow-up.
7. **Skills bridge link** inside Practice Yard (Q1b deferred-with-bridge) — not added this pass.
8. **Backend test** asserting `started_at` in the status payload.
9. **All prior-session carry-over still open** — 3-layer landing CTA, ScoreBreakdownPopover, Vercel build timer, multi-file CV batch, CV detector enrichment, /institutions page, ADR-0005/0007 promotions. None touched.

---

> **Older session summaries pruned for a lean cockpit (2026-05-30).** Sessions ≤ 2026-05-28 were committed/shipped — full detail in `git log` and `docs/session-history/2026-05.md`. Live cross-session context lives in memory (`~/.claude/projects/-Users-incognito-True-Yodha/memory/MEMORY.md`). Only the latest sessions with **uncommitted or unbuilt** carry-over are kept above.
