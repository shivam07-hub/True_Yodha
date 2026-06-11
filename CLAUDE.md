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
| CVJT1 | **CV Playground + Job Tracker + LinkedIn bridge contract is locked.** One active tailored CV per exact `job_id`; deterministic matcher before AI; honest/flexible status flow; immutable submitted-CV snapshots plus application attempts; extension saves/matches/links but editing stays in CV Playground. Full contract: `memory/project_cv_playground_linkedin_tracker.md`. |
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

26. **CV Playground redesign — Phases 4 & 5 (LOGGED 2026-06-08, Phases 1–3 BUILT this session, uncommitted).** Full spec: `docs/DESIGN_cv_playground_redesign.md` (§6, §8). Phases 1–3 shipped: toolbar Action-Law re-zone (one state-driven primary, duplicates killed), page-fill meter + soft-block + auto-trim (`lib/cv/page-fill.ts`), per-bullet Mentor Rewrite with the no-fabrication guard (`backend/app/services/cv_rewrite.py`, `POST /cv/rewrite-bullet[/apply]`, `components/cv/builder/bullet-rewrite.tsx`). Remaining:

   - **Phase 4 — "Restructure with Mentor" (whole-CV).** A higher-order action (in the primary's "⋯ More", or auto-offered when page-fill > 100% or JD-match is low): Mentor proposes a reordered/merged/cut version targeting one page + the JD — reorder sections, merge weak bullets, drop lowest-impact lines — shown as a **reviewable proposed `cv_version`** (existing `polished` lineage), accept creates it, reject discards. Never auto-overwrites. **Why build it:** Phase 3 fixes ONE bullet at a time; a CV that's 1.4 pages or structurally weak (wrong section order, buried impact, 6 bullets where recruiters read 4) needs a whole-document pass. Auto-trim (Phase 2) only *hides* lowest-impact bullets — it can't *reorder or merge*. Restructure is the single action that turns a sprawling CV into a recruiter-ready one-pager, which is the core JTBD ("customise the CV fast for any job"). It's also the natural home for the user's explicit ask: "restructure their resume with specialised prompts from the Mentor playbook DB." Bounded (one proposed version, reviewable) so it's safe.
   - **Phase 5 — swap rewrite grounding to live Mentor RAG.** Replace the static playbook rules injected in `cv_rewrite._build_messages` with live pgvector retrieval over the authored CV playbook shelf (ADR-0013/0014). **No API/UI change** — only the message-assembly step changes. **Why build it:** Phase 3 ships on a static prompt, so every rewrite leans on the same hard-coded XYZ/ATS rules. RAG lets the rewrite cite the *specific* playbook passage relevant to THIS bullet/role/JD ("per the Google XYZ formula…"), which is the whole differentiator in the Myro Tutor thesis (grounded, citable, not generic ChatGPT). It also means new playbook content improves rewrites the day it's published (design §2) without a code change. Blocked on the Mentor retriever infra (pgvector + embeddings, ADR-0014) — that's the prerequisite epic. **Superseding grill decisions locked 2026-06-12:** exact A4 preview; suggested cuts may hide individual experience/project bullets only and are always reversible; Rewrite is free; Restructure costs 20 Myro Coins only when kept; one active tailored CV belongs to one exact job; application attempts preserve the exact CV used. Full contract: `memory/project_cv_playground_linkedin_tracker.md`. **Verify before commit:** run `pytest backend/tests/test_cv_rewrite.py` + `npx tsx --test tests/page-fill.test.ts` in the real toolchain (sandbox had a macOS/Linux `node_modules` mismatch so `tsx`/backend deps couldn't run there; `tsc`/`eslint`/`py_compile` were clean + logic validated standalone).

25. **Rename "XP" / "Tokens" → "Myro Coins" — FULL deep rename (LOGGED 2026-06-07, not started).** Product decision: "Token" is a misnomer (collides with auth/LLM tokens) and "XP" over-gamifies; the canonical name is **Myro Coins**. This is a cross-cutting rename across user-facing copy, internal identifiers, API field names, and DB semantics — NOT a blind find-replace. Owner repo: True_Yodha (the scraper repo only produces job/skill data; it has no XP concept). **Scope discovered via grep (do a fresh grep before starting — counts drift):** dedicated modules `backend/app/services/xp_service.py`, `frontend/lib/xp-policy.ts`, the `frontend/app/(authed)/tokens/` route, the `frontend/components/xp/` folder (`XPGateModal.tsx`, `xp-explainer-modal.tsx`) and `frontend/components/forge/ForgeXpPill.tsx` (+ `forge-xp-pill.css`); heavy hit-count files `frontend/lib/api.ts` (~127), `home/page.tsx`, `forge/page.tsx`, `market/page.tsx`, `settings-modal.tsx`, `cv/page.tsx`, plus `backend/app/deps.py` and `backend/app/services/cv_workflow.py`. DB/earn semantics: XP is written to `daily_logs.skills_delta` keyed e.g. `community_reporter` (+10) — those keys + any `xp`-named columns/RPC params are part of the rename. **Execution order (locked):** (1) Land a user-facing **copy/label pass first** — every visible "XP"/"Tokens"/"points" string → "Myro Coins" (and any unit abbreviation), tests in `frontend/tests/brand-system.test.ts` updated; this is low-risk and shippable alone. (2) Then the **identifier/contract pass** behind it — rename files, vars, components, API request/response field names, and DB columns/keys, each with a migration and a back-compat read shim where an API or column is renamed (avoid a flag-day break: accept both old+new field for one release, then drop old). Keep the `/tokens` route working via redirect to the new path. (3) Update memory + ADR note. **Do NOT** rename internal identifiers and user copy in the same PR — split so the risky contract changes are reviewable in isolation. Cross-link: this is the naming half of the broader Myro currency model; the earn-rate policy lives in `xp-policy.ts` → renamed `myro-coins-policy.ts`.

24. ~~**Set `SUPABASE_JWT_SECRET` on prod → kill per-request auth round-trip**~~ — ❌ **VOID/DANGEROUS. Superseded by #24b (CLOSED 2026-06-07).** Original premise (set HS256 shared secret → local verify) was wrong: Supabase project signs user session tokens with **ES256 (asymmetric, ECC P-256)**, proven by dashboard screenshot 2026-06-07. Setting an HS256 `SUPABASE_JWT_SECRET` on the old code → local HS256 verify rejects every real ES256 token → **total auth outage.** Do NOT set that env var. The perf goal (kill the per-request Supabase Auth round-trip) is delivered correctly by #24b below.

24b. **Alg-aware local JWT verify (ES256/JWKS) — ✅ BUILT + CLOSED 2026-06-07. Awaiting prod deploy.** Replaces the dead #24. [deps.py](backend/app/deps.py) `_decode_local_jwt` now branches on the token's `alg`: ES256/RS256 → public key fetched from **JWKS** (`PyJWKClient`, `cache_keys=True`, refetch only on unknown `kid` → steady state network-free, [deps.py:72](backend/app/deps.py)); HS256 → existing `supabase_jwt_secret` (legacy, still supported); no key material / JWKS unreachable → `_LocalVerifyUnavailable` → **remote fallback** `get_supabase().auth.get_user(token)` (zero-outage, [deps.py:55](backend/app/deps.py)); genuine bad-sig/expired/wrong-aud → 401. `config.jwks_url` derived from `supabase_url` ([config.py:95](backend/app/config.py)) → **zero config needed.** `requirements.txt` pins `PyJWT[crypto]`. Tests: `test_local_jwt_auth.py` 14 passed (incl. ES256 sig/exp/aud/unavailable cases). Same perf win as #24 (removes the ~1.3s Supabase Auth round-trip on every authenticated request → compounds the #21 slow reads), **without** the outage risk. **Deploy-safe anytime, no ordering constraint:** prod (`mirror-backend-prod`) has NO `SUPABASE_JWT_SECRET` set → old code already on the safe remote path → nothing to unset. **REMAINING (Shivam): (a)** commit backend root + merge `Develop`→`main` so prod (tracks `main`) picks it up; **(b)** after deploy `curl https://api.himyro.com/...` an authed route → confirm sub-second + no `AuthApiError` in logs. Memory: `project_auth_jwks_local_verify`. Cross-link #21.

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

## LAST SESSION SUMMARY (2026-06-12 · CV Playground + tracker + LinkedIn contract locked)

Completed the point-3 `/grill-me` product interview and locked the end-to-end CV/application workflow. No production code was changed.

- One active tailored CV now belongs to one exact job, survives cross-device use, and keeps 14 days of autosave/conflict revisions.
- The matcher is deterministic and free; Rewrite means one bullet; Restructure means the whole job-specific CV and costs 20 Myro Coins only when kept.
- Comparison stays above the CV; mobile uses stacked cards, exact A4 preview, and one state-driven sticky action.
- Library organization, grouping/sorting/search, draft visibility, archive/restore, and job-description refresh behavior are locked.
- Application attempts preserve the exact immutable CV used. Users can correct the linked CV, upload an external submitted PDF for Myro Engine analysis, and retain every reapplication in history.
- The existing extension is the LinkedIn bridge: deduplicate by listing, save/match without leaving LinkedIn, open the exact CV Playground for editing, return to the listing to apply, and ask `I submitted this application`. No private scraping or fictional two-way sync.
- LinkedIn's official June 2026 tracker documentation was checked to confirm the honest automation boundary: LinkedIn-observed submissions can update automatically; external applications require a prompt or manual stage change.

Durable full contract: `memory/project_cv_playground_linkedin_tracker.md`.

---

## OLDER SESSION SUMMARY (2026-06-10/11 · Landing page "Myro Engine" redesign — BUILT, uncommitted)

Cowork session. Spec written (`docs/DESIGN_landing_myro_engine.md`) → Shivam ran it through Claude Design → handoff confirmed (`reference/building landing page.zip`, tweaks locked: bg `#0a0a0c`, Signal teal, roadmap line KEPT, 150+ directive) → **implemented in full**.

**Frontend (nested git, uncommitted):** `components/public/landing-page.tsx` rebuilt as 7-section engine page; new `components/public/landing/` (hero w/ mini-engine SVG + real-data company marquee, engine pipeline + merge + count-up counters, dark sample readout, surfaces w/ `← ENGINE:` lines + quiet Myrology card, loop ring (static 7-node trig layout, mobile chain), proof = live intel teaser + quotes + newsletter strip wired to `newsletter.subscribe(email,"landing")`, FAQ accordion + closing CTA; 4 scoped CSS files; `use-reveal.ts` IO reveal **with the fail-open failsafe**). Landing forces `data-surface="dark"` on mount (myrology pattern) + remaps `--tm-*` inside `.tm-landing` so reused PublicTopNav/PublicFooter/SignupModal go terminal-dark. Fonts: Space Grotesk + JetBrains Mono via next/font in `app/page.tsx` (vars `--font-grotesk`/`--font-jbmono`). New metadata ("Myro — The Career Intelligence Platform") + per-page `viewport.themeColor #0a0a0c` + JSON-LD (SoftwareApplication + FAQPage from shared `landing-copy.ts`). `lib/api.ts`: + `publicStats.get()`. DELETED: `sample-diagnostic.tsx`, old `landing-page.css`. Footer descriptor line updated (all public pages). Dropzones route through `useSignupGate` (`surface:"about_hero"`, `next=/cv?upload=1`). Counters/marquee/intel single-source live data: `/public/stats` → fallback `jobs.analytics()` → static floors (4,000+/150+/32,000+/950+), floored display so numbers never shrink. **tsc --noEmit exit 0 · next lint clean.**

**Backend (root repo, uncommitted):** NEW `app/routers/public.py` — `GET /public/stats` (no-auth, 1h in-process cache, reuses snapshot-backed `compile_market_analytics()` + `user_profiles` exact count, static `SKILLS_MAPPED=32000`), registered in `main.py`. Tests: `tests/test_public_stats.py` (3 tests, fake repo/admin — NOT RUN here, macOS venv unusable in sandbox).

**Deliberate deviations from handoff (flag to Shivam):** (a) intel teaser column says "{n} roles · live" not "· 30d" — `by_company.count` is active listings, not a 30d window; honesty > locked copy. (b) Marquee names come from live `analytics.by_company` (real corpus) instead of a hardcoded MNC list; marquee hidden until data arrives.

**Shivam open items:** (1) `pytest backend/tests/test_public_stats.py` in real toolchain. (2) Eyeball landing at desktop + 375px (+ reduced-motion). (3) Commit both repos (frontend nested git!), deploy backend for `/public/stats` (landing works without it via analytics fallback). (4) Follow-ups parked: regenerate OG image to show Engine diagram; **global dark-mode token migration** to the landing palette (`#0a0a0c/#13141a/#67e8f9` etc.) across the app per Shivam's "entire website" intent — separate PR, touches `design-tokens.css` + `tests/brand-system.test.ts` + 5 hardcoded `#050505` spots, needs visual QA.

---

## OLDER SESSION SUMMARY (2026-06-10 · Upskilling + Myrology completion audit)

Confirmed Claude's June 9–10 implementation against git, the live database, deployed APIs, and the full local checks.

**Upskilling core is shipped.**
- Slices 1–6 landed in `d6713cf`; the home-bootstrap contract fix landed in `1811502`. Both are on `Develop` and production through PR #115 (`ab45199`).
- The four quiz tables and `user_skills.correction_count` cleanup are live in Supabase.
- Prod and dev OpenAPI expose the Upskilling skill, activity, and gap-assessment routes.
- The time-based Practice earn, appeal, and separate advice paths are gone; activity now comes from submitted Upskilling attempts.
- Full verification: `575 passed, 13 warnings`; frontend `tsc --noEmit` and `next lint` clean.

**Boundary still open outside the shipped core:** the sister `firecrawl_Supabase` repo has no question-bank publisher yet, and the live `skill_questions` count is `0`. Surface B is implemented but has no direct test coverage. Until the publisher fills the bank, the UI correctly shows its empty state. Do not describe the end-to-end Upskilling content system as complete until those two items close.

**Myrology payment reliability is deployed.**
- Webhook reconciliation, shared exactly-once fulfilment, lifecycle transitions, delivery timestamps, and corrected refund copy landed in `d6713cf` and are live in prod.
- The lifecycle columns are live in Supabase.
- Prod webhook and admin routes are configured: unsigned calls return `401`, not the unconfigured `503`; dev intentionally leaves these prod-only secrets unset.
- Resend sender/API configuration is present on prod and dev according to the completed Railway operations. The Razorpay dashboard registration itself is a provider-side setting and is not independently visible from this repo; treat Shivam's completion confirmation as the source for that final dashboard action.

Remaining for this workstream: run one real payment/webhook delivery smoke when making the next Myrology purchase. No implementation or deployment task remains.

---

## OLDER SESSION SUMMARY (2026-06-09 · Upskilling overhaul — Slices 1–2 + api clients BUILT, verified)

All work UNCOMMITTED on `Develop` (Shivam commits — backend=root repo, frontend=nested `frontend/.git`). This session executes the PRD from the 2026-06-08 entry below (`docs/PRD_practice_upskilling_skillgap.md`), driven by a Claude-Design handoff prototype the user supplied at `reference/Overhauling practice design-handoff.zip` (unzipped → `/tmp/overhaul_design/overhauling-practice-design/`; **re-unzip if /tmp cleared** — it is the pixel-source for the UI port). The prototype is a self-contained React/CSS mock of the redesigned `/forge` (Spirit/light theme) whose tokens already match `frontend/app/design-tokens.css` 1:1.

**DEC-1…6 LOCKED by Shivam this session (all the PRD's recommended options):**
- **DEC-1a** — Upskilling clears DRIVE the headline skill level (replacing the deprecated time-based forge counter), grandfathered `max(legacy_forge_level, assessed_level)` so nobody regresses. One number on screen.
- **DEC-2** — RETIRE the free-text "Prove it" appeal; leveling is earned by demonstration (clearing the Lₙ set).
- **DEC-4** — pass bar **8/10**; tiers **10→+50, 9→+30, 8→+20, ≤7→0**.
- **DEC-6** — pilot bank = top `job_count_30d` skills.
- **Gap entry (Surface B)** lives on BOTH the Job Tracker AND the Market drawer.
- (DEC-3 keep the lone "Edit in CV Playground →" nav link; DEC-5 first-clear-only — both recommended defaults.)

**Plan = 7 vertical slices, one PR each → `Develop`. Done this session: Slices 1, 2, and the Slice-3 API clients.**

**Slice 1 — data model (DONE, NOT RUN).** `database/migrations/20260609_upskilling_quiz_bank.sql` — 4 tables: `skill_questions` (scraper-written, **service-read only — NO RLS SELECT policy so the answer key can't leak to a browser**), `quiz_attempts`, `quiz_answers`, `skill_assessed_level`. `skill_id` is **INT REFERENCES skills(id)** (PRD §6 said bigint — that was illustrative; live taxonomy is INT, matches job_skills/user_skills). Idempotent. ⚠️ **Shivam runs it manually via Supabase dashboard** (project `gipvxuugajkugntwkeiz`) per the manual-migration rule — agent did NOT execute it.

**Slice 2 — backend (DONE, 5 tests pass).**
- `backend/app/services/xp_policy.py` — added `UPSKILLING_SET_SIZE=10`, `UPSKILLING_PASS_BAR=8`, `UPSKILLING_CLEAR_TIERS`, `upskilling_award_for(score)`.
- `backend/app/schemas/upskilling.py` — full Surface A + Surface B contracts (served-set schemas carry NO `correct_index`).
- `backend/app/services/upskilling_service.py` — Surface A: `list_skills`, `start_set` (serves key-stripped), `submit_set` (grades server-side, idempotent replay, awards + advances).
- `backend/app/routers/upskilling.py` — `GET /upskilling/skills`, `POST /upskilling/sets`, `POST /upskilling/sets/{id}/submit`. Registered in `backend/app/main.py`.
- `backend/tests/test_upskilling_service.py` — **5 passing** (tier table; perfect first-clear pays +50 & unlocks; re-clear of already-paid level pays 0; below-bar pays 0 & no unlock; same-attempt re-submit replays without re-award). Uses an in-memory fake of the supabase fluent client.
- **TWO deliberate divergences from the PRD's literal text (both correctness wins, keep them):**
  1. **No new `award_upskilling_clear` RPC.** The existing `reward_xp` RPC (`20260528_reward_xp_rpc.sql` / `xp_service.reward`) already does atomic, idempotent, ledger-audited credit keyed by `(action, ref_table, ref_id)`. Reused it.
  2. **First-clear idempotency key = `(skill_id, level)`, NOT `attempt_id`.** PRD said `ref_id=attempt_id`, but that only dedupes retries of ONE attempt; D5 ("first clear of each skill+level") requires the level as the key so re-clearing via a *different* attempt pays 0. Implemented as `action='upskilling_clear'`, `ref_table='skill_level_clear'`, `ref_id=f"{skill_id}:{level}"`.
- **DEC-1a wired in `submit_set`:** a pass upserts `skill_assessed_level` and bumps `user_skills.matched_level = max(prev, level)`.

**Slice 3 (API clients only, DONE).** `frontend/lib/api.ts` — added `upskilling.skills/startSet/submitSet` + types (`UpskillingSkill`, `ServedQuestion`, `StartSetResponse`, `SubmitSetResponse`, …). **`tsc --noEmit` exit 0.**

**⚠️ Local-env gotcha:** `app.main` won't import in the agent venv — `playwright` missing, eagerly pulled by the unrelated `cv` export router via `app/routers/__init__.py`. Pre-existing; NOT caused by this work. New modules `py_compile` clean and the service imports fine (tests pass). Verify full `from app.main import app` in the real toolchain (where playwright is installed).

**NEXT — pick up Slice 3 component port (in progress), then 4–6, plus the scraper-repo pipeline:**
1. **Slice 3 UI port (BIGGEST remaining):** port the prototype's `primitives.jsx / home.jsx / quiz.jsx / results.jsx` → TS components under `frontend/components/skills/upskilling/`; fold the `up-*` CSS from the prototype `styles.css` into `frontend/app/(authed)/forge/practice.css` (tokens already match); replace mock `BANK`/`SKILLS`/`drawSet` with the new `api.upskilling.*` clients; swap the prototype `ParticleBurst` for the real `useParticleMoment` (reduced-motion gated); source the skill list from real `buildPracticeSkills` (`frontend/lib/practice-skills.ts`) merged over the backend `/skills` progress; gate with `RequiresCV surface="skills"`; mount into `frontend/app/(authed)/forge/page.tsx`. Honor PRD §10.7 partial-bank states (`max_bank_level`/`locked`) and §9 WCAG (the prototype already implements radiogroup/arrow-keys/role=status — preserve it).
2. **Slice 4:** delete the time-based forge XP earn (the `useForgeTimerStore` dial / `forgeAmbientRate`·`forgeFocusedRate` in `page.tsx` + `xp.completeForge`), keep `forge_service.py` ↔ `level-thresholds.ts` in sync; DEC-1a leveling already lives in `upskilling_service`.
3. **Slice 5 (Surface B):** build the gap endpoints in `upskilling_service`/router (schemas already exist: `StartGapResponse`/`SubmitGapResponse`/`ReadinessRow`) — reuse `GET /jobs/{job_id}/skill-gap`, rank gap skills by `gap_score × job_count_30d`, cap ~5–6, 3 Qs/skill, **diagnostic (no tokens)**, write `skill_assessed_level`. Port `gap.jsx` → readiness map; add the "Assess my readiness" entry on BOTH Tracker and Market drawer.
4. **Slice 6 (Part C, ships alone):** strip CV-authoring out of `frontend/components/skills/skill-card-inline.tsx` (evidence/Ask-Mentor/Edit-in-CV/comment-thread) into the CV Playground reusing `POST /cv/skill-edit`; replace "Prove it" appeal per DEC-2; lean card = name + ladder + assessed badge + Start set + one nav link.
5. **Scraper-repo pipeline (separate repo `firecrawl_Supabase`):** hybrid scrape→LLM-clean→verifier→publish into `skill_questions`. **RAG source = `reference/Interview Prep/`** (user-attached; ~461 PDFs/167 docx — Shivam's MBA/consulting/PM corpus: guesstimates, profitability cases, PM interviews, budget docs). NOTE this corpus is **consulting/product/finance**, NOT the SQL/Python/ML in the prototype mock — pilot skill domain should follow the corpus + top `job_count_30d`.

**Shivam open items:** (1) run the migration on the branch DB. (2) `pytest backend/tests/test_upskilling_service.py` in real toolchain. (3) confirm full `app.main` import once playwright present. (4) commit both repos.

---

## LAST SESSION SUMMARY (2026-06-08 · Practice/CV split — Upskilling PRD + CV Playground redesign Phases 1–3 BUILT)

All work UNCOMMITTED (Shivam commits — backend=root repo, frontend=nested `frontend/.git`). Frontend `tsc --noEmit` exit 0 + `next lint` clean on every touched file; backend `py_compile` clean (backend deps + `tsx` NOT runnable in agent env — macOS `node_modules` on Linux sandbox; pure logic validated standalone).

**Two strands this session.**

**(A) Practice → Upskilling split — PRD ONLY (another agent builds it).** `docs/PRD_practice_upskilling_skillgap.md`: move ALL CV-rewrite logic OUT of Practice into the CV Playground; rebuild Practice as an **Upskilling** module — MCQ (auto-graded), L1–L5 sets of 50–60 questions per skill, sourced **hybrid (scrape → LLM-clean)**, **strictly performance-based** rewards (first-clear-only, 8/10 bar, server-held keys, idempotent via `xp_ledger`), plus a job-anchored **skill-gap assessment**. Aligns to the Myro Tutor ADRs (§11 "earn on quiz cleared"). Deprecates the time-based forge earn (= the participation reward being removed). Decisions DEC-1…6 open.

**(B) CV Playground redesign — DESIGN + Phases 1–3 BUILT.** `docs/DESIGN_cv_playground_redesign.md` + `docs/mockups/cv-playground-redesign.html`. The Action Law: **context left, actions right, object-actions on the object, one state-driven primary, no verb twice.**
- **Phase 1 — toolbar re-zone** (`components/cv/builder/playground-view.tsx` + `cv-builder.css`): Save collapsed 3→1 (killed the save-bar button + the `+` version-tab dup); one state-driven primary **Save → Export PDF**; dropped duplicate "CV Library" + IntelStrip "View live job data" (removed dead `onOpenDrawer`); match-% moved off the button into the meter; lexicon tightened (Intel/Polish/Edit text/Save). New `.cvb-action-group` (44px mobile). **Editor consistency:** Edit modal in `cv/page.tsx` → "Edit CV text" / "Save". Master editor already compliant (autosave + status-only).
- **Phase 2 — page-fill meter** (NEW `lib/cv/page-fill.ts` + `tests/page-fill.test.ts`): deterministic **line-budget** model (`IDEAL_CV_SPEC`: A4/10.5pt/0.6in/~98 cpl/50-line budget) — NOT pixel measurement. `role="meter"` pill in the IntelStrip; **soft block** on Export when it spills (confirm → **Auto-trim** lowest-impact bullets / Export anyway). ⚠️ `lineBudget=50`/`charsPerLine=98` need ONE eyeball-calibration vs a real export (soft, so can't trap).
- **Phase 3 — per-bullet Mentor Rewrite** (NEW `backend/app/services/cv_rewrite.py`, `POST /cv/rewrite-bullet[/apply]` in `routers/cv/skill_edit.py`, NEW `components/cv/builder/bullet-rewrite.tsx`, `backend/tests/test_cv_rewrite.py`): `✦ Rewrite` on each visible bullet → before→after diff. **No-fabrication guard (ADR-0016):** bullet w/o a metric → Mentor asks for the real number (with a "reframe qualitatively" opt-out via `allow_no_metric`), never invents. Ships on `get_llm_provider()` (Phase 5 swaps to RAG, no UI change). **Accept writes a NEW Main-CV baseline** — reuses `cv_skill_edit.locate_bullet`+`apply_bullet_edit`+the SE1–SE17 write/async-retag verbatim, keyed by raw bullet text → rewrite flows to every tailored copy. Free in v1 (`REWRITE_BULLET_XP_COST=0`, DEC-H pending).

**Phases 4 & 5 → Backlog #26** (Restructure-with-Mentor; RAG grounding swap) with rationale.

**Shivam's open items:** (1) run `pytest backend/tests/test_cv_rewrite.py` + `npx tsx --test tests/page-fill.test.ts` in real toolchain. (2) Calibrate page-fill `lineBudget`/`charsPerLine` vs a real export. (3) Confirm DEC-G (tailor opens all-visible vs AI-proposed cut), DEC-H (rewrite price; v1 free), and the Phase-3 baseline-write behavior (rewrite edits the master → propagates; OK or scope per-copy?). (4) Commit both repos (frontend nested git + backend root).

---

## LAST SESSION SUMMARY (2026-06-08 · CV export — server-PDF WYSIWYG + close-the-loop + Geist parity)

Closed the **CV export/download** chapter (NOT the CV building page — see open items). All UNCOMMITTED. Frontend `tsc --noEmit` exit 0 + eslint 0 on every touched file; CSS + woff byte-synced. Backend not runnable in agent env (no fastapi/playwright) — syntax OK, tests written skip-safe w/o Chromium. Memory: `project_cv_export_redesign`.

**The redesign:** PDF download was `window.print()` → manual "Save as PDF" (worst on mobile) and dead-ended at download. Now it's a **server render** (the Google Docs pattern — model→server→blob, which the DOCX path already did) + **download→apply→track**.

- **Phase 1 — server PDF.** Frontend posts the EXACT previewed `.cvb-pdf-page` outerHTML; headless Chromium renders it with the shared sheet CSS → byte-faithful PDF, no dialog, mobile==desktop. NEW `cv-sheet.css` (canonical sheet styling extracted from cv-builder.css; `backend/app/assets/cv_sheet.css` byte-identical copy, drift-guarded). NEW `backend/app/services/cv_pdf_html.py` (`render_html_to_pdf`, sync Playwright, network-blocked, script-stripped, 512KB cap, reproduces @media print form). `POST /cv/export-pdf` → **503 on fail so client auto-falls back to `printCvPage`** (nothing regresses pre-deploy). `cvApi.exportPdf` + `CVExportView` swap (grabs sheet via `display:contents` ref — transforms must NEVER go on `.cvb-pdf-page` or they pollute the posted outerHTML).
- **Phase 0 — image (built, Shivam deploys).** Dockerfile `playwright install --with-deps chromium` + `fonts-liberation`; requirements `playwright==1.44.0`. **Server PDF is DEAD until the image is rebuilt** — print() fallback carries it until then.
- **Phase 3 — close-the-loop.** Tailored export records the application via existing `jobsApi.updateApplication(jobId,{status:"applied"})` (PUT upserts + stamps `applied_at`). Post-download "Mark as applied" nudge → "Applied to {company} on {date}"; export page seeds state from `jobsApi.applications()`. Tracker infra (saved→…→offer) already existed.
- **Phase 4 — resilience + clarity.** `withRetry` (2 attempts, backoff) wraps exportPdf/exportDocx (weak IN networks); DOCX error invites retry; format guidance "PDF suits most ATS — pick DOCX only if the portal asks for Word"; killed stale "Save as PDF in the print dialog" copy.
- **Option B — real Geist parity.** NEW `cv-fonts.css` (@font-face from vendored variable woff) + backend base64-embeds the SAME woff (`cv_pdf_html._font_face_css`, vendored `backend/app/assets/fonts/Geist*.woff`, byte-synced + test-guarded).
- **⚠️ FONT CORRECTION:** earlier-session claim "Geist never loaded / falls back to Helvetica" was WRONG — a pre-existing Google Fonts `@import` (`cv-builder.css:6`, `family=Geist:wght@300..700`) already loaded Geist. So the preview was always Geist → Phase 0's Arial-on-server would have DRIFTED, making Option B **necessary, not optional.** Now **two frontend Geist sources** coexist: Google CDN (cv-builder.css:6, parses last → wins weights 300–700) + local woff (cv-fonts.css); server embeds the local woff. Minor frontend(Google)/server(woff) version nuance. **Recommend: pick ONE Geist source** (drop the Google `@import` and rely on local woff = server, OR drop cv-fonts.css and embed Google's exact Geist server-side) for guaranteed byte-parity.
- **Phase 2 (mobile 375px scale-to-fit) NOT built** — needs visual iteration; current mobile still reflows (`.cvb-pdf-page{width:100%}`) which diverges from the A4 download. Explained + parked awaiting go-ahead.

**Still OPEN on the CV *building* page (not this session):** fresher "build from scratch", CV-upload reliability (P0 regression), mobile editor (drag/large fields), version mgmt + side-by-side compare, auto-save/draft recovery, state-blind "Upload CV" CTA after success, pricing clarity before download.

**Shivam's open items:** (1) Rebuild/deploy backend image w/ Chromium → test the real PDF round-trip (the one thing unverifiable in-agent). (2) Decide the single Geist source. (3) Eyeball CV export at 375px → greenlight Phase 2 mobile. (4) Commit both repos (backend root + nested `frontend/.git`).

---

## LAST SESSION SUMMARY (2026-06-07 · Sprint 5 P0 bug sweep + auth ES256/JWKS fix)

All work UNCOMMITTED (Shivam commits — backend=root repo, frontend=nested `frontend/.git`). `tsc --noEmit` exit 0, `next lint` clean, backend `569 passed`.

**P0 bugs closed (code, grounded via graphify-out frontend graph):**
- **BUG-9** (PLANNED share row) — render `status:"live"` earn actions only (planned share kept in `lib/xp-policy.ts` so PR-REFERRAL flips it on); deleted dead PLANNED badge/`muted`; fixed icon map (Track-a-job→Briefcase); tokens page header stopped promising the unshipped share reward.
- **BUG-8** ("India, India") — graph confirmed 3 dup location-joins, no shared formatter → new canonical `lib/format-location.ts` (case-insensitive de-dupe) + 7 tests; JobCard/market/companies all consume it.
- **BUG-3** (tier label no tooltip) — `skillTierHint()` in canonical `lib/skill-tier.ts` (code-true bands gap L0–L1/building L2–L3/strong L4–L5 — fixed CLAUDE.md's wrong "L1–L2"), `title`+`aria-label` on pill.
- **BUG-12** (Lightcast jargon) — cv upload copy → "32,000+ recognized skill types used by real hiring managers".
- **BUG-13** (no extraction tips) — teal tips callout gated on `skills_detected===0` (error-gated per Shivam).
- **BUG-11** (forge can't-end) — root cause: `components/forge/ForgeModal.tsx` was DEAD (mounted nowhere; its `complete` screen + circular "Log in diary→" CTA orphaned). DELETED it + also-dead `components/home/ForgeStrip.tsx`. Built the real stop/abandon on the live page `app/(authed)/forge/page.tsx`: "End session" ghost button (when `sessionActive`) → forfeit confirm only when `readyXP>0` ("End session — forfeit tokens?" / Keep going primary + End session ghost) → `resetSession()` (no claim/XP). CSS in `practice.css`.
- **BUG-10** (feedback select "broken on mobile") — NO code defect found (full chain traced clean; FAB `hidden` on mobile so its pointer-events lead is moot; `hover-lift` is a no-op class). May-24 reports predate the refactored hub. Needs a real PHONE repro (ND7) — Shivam's end.
- **PR-F** (375px) — code-verified: zero `position:sticky` in skills (overlap impossible), SE14 label-hide present. Pixel eyeball owed (authed session).

**Auth ES256/JWKS (#24b) — BUILT.** Screenshot proved Supabase signs **ES256 (ECC P-256)** now → **CLAUDE.md backlog #24 is VOID/dangerous** (setting HS256 `SUPABASE_JWT_SECRET` on the old code = total auth outage). Replaced with alg-aware local verify in `backend/app/deps.py`: ES256/RS256 → JWKS public key (`PyJWKClient`, cached); HS256 → existing secret; any local-verify gap → `_LocalVerifyUnavailable` → remote fallback (zero-outage); real sig/exp/aud fail → 401. `config.jwks_url` derived from `supabase_url` (zero-config). `requirements.txt` pinned `PyJWT[crypto]`. `test_local_jwt_auth.py` +7 ES256 tests. Memory: `project_auth_jwks_local_verify`.

**VERIFIED prod env (Railway MCP, `mirror-backend-prod`):** `SUPABASE_JWT_SECRET` is NOT set → no outage risk, nothing to unset. Since the secret is absent everywhere, OLD code is already safe (no secret → remote path) AND **#24b deploys safely anytime — no ordering constraint.** (Note: `SUPABASE_ANON_KEY`/`SERVICE_KEY` are HS256-format but those are long-lived project API keys, NOT user session tokens — user tokens are ES256, so JWKS fix is correct.)

**Migration `20260602_multiloc_target_locations.sql` APPLIED 2026-06-07 (Shivam, Supabase).** Multi-loc pre-deploy gate cleared.

**Shivam's open items:** (1) Strike backlog #24, replace w/ #24b note. (2) BUG-10 phone repro. (3) Deploy #24b → verify authed route sub-second + no `AuthApiError`. (4) Commit both repos (frontend nested git + backend root). Memory: `project_sprint5_p0_bugs`, `project_auth_jwks_local_verify`.

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

## LAST SESSION SUMMARY (2026-06-05 · Automated reference audit — Sprint 4 plan)

Scheduled task ran a full audit of `reference/` (150+ screenshots across 15 folders, 20+ user feedback docs, 5 markdown files). Cross-referenced against current CLAUDE.md and codebase. No code was written — output is a structured plan for the next Claude Code session to execute.

**Audit method:** Read all feedback docs (`user_feedback_1st_task.md`, `user_feedback_report_2.md`, `beta_interview_feedback.md`, `User suggestions_28may.md`, `CV issues/User_feedback_report.yml`) + viewed key screenshots from May 22–June 3. Verified existing CLAUDE.md "shipped" claims against actual code state.

**Key finding:** The most-cited user pain (20/20 users mention it in some form) is "I don't know what to do after signing up / what this platform is." This is a first-3-minutes problem, not a feature-missing problem. The product already has most of the features users want — they just can't find them or understand them.

---

## SPRINT 4 — USER JOURNEY EXCELLENCE + GROWTH FOUNDATION

**Goal:** Make the first 3 minutes flawless. Make users want to return every day. Remove every visible promise that isn't delivered.

Build order: bugs first → first-time journey → engagement engine → growth loop.

---

### P0 — NEW BUGS (fix before next user wave, all code-ready, no grill needed)

**BUG-7 — Live Job Data page shows placeholder text (CRITICAL, NEW)**
The internal `/home`→`Live Job Data` tab renders a page saying "Carries the thread next pass" with bullet points about future features. This is a development stub visible in production (confirmed in May 29 screenshot). Users see this and think the app is broken.
- **Fix:** Find the component rendering this stub. Either wire real content (the public intel page already exists at `/newsletter`/`/intel`) OR redirect this nav link to the actual public intel page OR hide the tab until the page is real. Locate: search for "Carries the thread" in `frontend/` to find the stub component.
- **Files:** Wherever `Live Job Data` tab content renders inside the authed shell.

**BUG-8 — "India, India" duplicate location in job drawer (LOW, NEW)**
Job drawer shows location as "India, India" — `location_city` is being set to the country name for some jobs, so the display concatenates `city · country` = "India · India". Cosmetic but looks broken.
- **Fix:** In the job card/drawer location display, de-duplicate: if `city === country`, show only country. Files: job drawer component (`frontend/components/jobs/` or `dashboard/`).

**BUG-9 — "Share with a friend: PLANNED" row in XP/tokens screen (MEDIUM, NEW)**
The tokens page (`/forge` XP wallet section, confirmed May 23 screenshot) shows "Share with a friend · PLANNED · +100 XP". Users see an unfulfilled promise. This erodes trust.
- **Fix:** Either (a) remove the row until referral ships, OR (b) make it non-interactive with "coming soon" styling that doesn't look like a broken feature. Do NOT leave it as a clickable "PLANNED" tag. Files: `frontend/app/(authed)/tokens/page.tsx`.

**BUG-3 — Skill tier label has no tooltip (MINOR, EXISTING OPEN)**
New tier label `L1·Building` / `L2·At Risk` pill in the skill card has no explanatory tooltip. Multiple users confused by "BUILDING" / "AT RISK". Single-line fix: add `title` attribute + `aria-label` to the tier pill. Files: `frontend/components/skills/practice-skill-list.tsx`.

**BUG-10 — Feedback form bottom-left not working (MEDIUM, NEW CONFIRMED)**
Two users independently reported (Ravali: "Feedback form: question not getting selected 24th May 3:30PM"; Aditya: "The feedback form was not working on the bottom left") — this is the main bug-reporting surface. Investigate and fix. Files: `frontend/components/feedback/` or wherever the bottom-left feedback widget lives.

**PR-F VERIFY — 375px skill card QA (STILL UNVERIFIED)**
Load `/skills` on a 375px-wide Chrome DevTools viewport. Verify: (a) Intel/Map/Audit sticky tab pill does NOT overlap domain cards at any scroll position — if it does, add solid `--bg-page` background + `box-shadow`. (b) At <480px, skill-card action buttons show icons-only, not full labels (SE14). If broken → fix `.tm-skill-card-action-label` CSS. Files: `frontend/components/skills/`.

---

### P1 — FIRST-TIME USER JOURNEY (the #1 cited problem across all 20+ users)

Every user, without exception, said some version of "I didn't know what to do" or "I couldn't figure out if this was a resume builder, job tracker, or career coach." The onboarding stepper was fixed (PR-ONBOARD), but users still get lost inside the product after onboarding.

**PR-COACHMARKS — First-visit contextual tooltips (NO grill needed, code-ready)**
Lightweight single-visit coachmarks that appear the FIRST time a user visits each page. Dismiss on any interaction. Never show again (localStorage flag per page). NOT intrusive modals — a single callout banner beneath the page title.

Pages + copy:
| Page | Coachmark copy |
|---|---|
| `/home` | "Your Mission Control — saved jobs, your next skill move, and your daily loop." |
| `/skills` | "Your Skill Intelligence — how your CV maps against what the market's actually hiring for." |
| `/intel` | "Follow companies to see which skills they demand most. Start by starring one." |
| `/cv` | "Your Master CV lives here. Every tailored version you create stays in your library." |
| `/forge` | "Practice Yard — 25-minute sessions build your skill level and earn XP. Pick a gap skill to start." |
| `/market` | "Live job feed matched to your skills. Save a role to unlock CV tailoring for it." |

Design: teal left-border callout card, `×` dismiss, max 2 lines, `font-size: 13px`, fades in 400ms on page mount. Component: `<PageCoachmark storageKey="…" body="…" />`. Shared across all pages. Files: new `frontend/components/common/PageCoachmark.tsx` + `.css`, wired into each page.

**PR-LANDING-CLARITY — 3-step flow + social proof on landing page (grill needed: ND5)**
Multiple users said the landing doesn't show them the workflow or prove others are using it.

Part A (no grill needed — ship now):
- Below the hero CTA, add a horizontal 3-step visual: `① Upload your CV → ② Get your Myro Score → ③ Tailor & send the right one`. Styled as connected numbered steps, not a feature list.
- Add "Free to start · No credit card" in 12px below the primary CTA button.
- Add 3 real user quotes from beta feedback as a testimonial strip (use Aman, Aditya, and the "game-changer" quote from CV issues feedback). Plain names, no photos needed — just initials + city.
- Add "Join {count} job seekers" count above the hero (pull real user count from a cached API call or hardcode as a floor).

Part B (needs ND5 decision — Shivam to confirm before coding):
- Static 3-screenshot product gallery (Dashboard, Skills, Intel) OR a 60-second Loom embed.

**PR-LANDING-FAQ — FAQ section on landing (no grill, code-ready)**
5 FAQs address the top anxieties from user feedback:
1. "Is Myro free?" → Yes, free to start. XP lets you unlock skill advice and company intel. No credit card needed.
2. "How is this different from LinkedIn or Naukri?" → Myro scores your CV against live job data and shows you exactly which skills to build. LinkedIn shows you jobs; Myro shows you what's stopping you from getting them.
3. "What is the Myro Score?" → A 0–100 score across 10 career domains, computed from your CV skills against real hiring demand. It goes up as you practice skills and add evidence.
4. "Is my CV private?" → Yes. Your CV is never shared or visible to recruiters. Only you see it. Your public profile shows only your Myro Score and domain map — never your actual CV text.
5. "What is Forge?" → Forge is your practice yard. Pick a skill you want to level up, run a 25-minute focused session, and earn XP. Each session moves your skill level from L0 to L5.

Files: `frontend/components/public/landing-page.tsx` + `landing-page.css`.

---

### P2 — ENGAGEMENT ENGINE: QUEST BOARD (the #1 retention lever, flagged as "very important")

**⚠️ Needs ND4 decision from Shivam before coding.** See ND4 below.

**PR-QUEST-BOARD — Daily Missions widget on /home dashboard**
The existing `YourMoveCard` shows ONE move at a time. Users want to see a BOARD. The game analogy in `user_feedback_1st_task.md` explicitly says: "a visible quest board showing exactly what to do next to level up — not just Next Moves, but framed as daily/weekly missions."

Design (pending ND4 layout decision):
- Widget title: "TODAY'S MISSIONS" with a "WEEKLY" tab toggle
- 3 daily missions, generated deterministically from user state:
  - **Always-on loop:** "Practice a skill · 25 min session" → `+50 XP` → routes to `/forge`
  - **Skill-specific:** "Improve {top_gap_skill} from L{n} to L{n+1}" → `+30 XP` → routes to `/forge?skill=…`
  - **Application loop:** "Save a matched job this week" OR "Log today's diary entry" → `+30 XP`
- Each mission row: icon · title · XP badge · `→` CTA · checkbox-style completion state
- Progress indicator: "1 / 3 done today" with a teal fill bar
- Completed missions: ✓ green check, muted opacity, non-clickable
- Reset at midnight (use local timezone)

Backend needs: no new API — derive missions client-side from existing `useHomeBootstrap` data (has `hasCv`, `hasJob`, `loggedToday`, `topGapSkill`, `streak`). XP reward on completion is already handled by forge/diary flows.

Files: new `frontend/components/home/DailyMissions.tsx` + `.css`, replace or wrap `YourMoveCard` in `HomeColumns.tsx`.

---

### P3 — REFERRAL LOOP (remove broken promise, wire what's already designed)

**PR-REFERRAL-V1 — Wire the referral flow end-to-end**
Per decisions SH6, SH7 in CLAUDE.md, the referral system is designed but not wired:
- `myro_ref` cookie on `?ref=` landing → already designed
- `user_profiles.referred_by_user_id` → already in schema spec
- `welcome_xp_granted` trigger → already in DB

What's missing:
1. **Backend:** signup handler must read `myro_ref` cookie and write `referred_by_user_id` on profile creation. Credit referrer: when new user's `welcome_xp_granted` flips TRUE and `referred_by_user_id IS NOT NULL`, award +100 XP to referrer via `charge_xp` (negative = credit). Self-referral guard: `referred_by_user_id != user_id`.
2. **Frontend:** Remove "PLANNED" tag from tokens page referral row. Make row show real state: "You've referred {n} friends · Invite 3 to unlock bonus missions →" with the share link pre-filled.
3. **Share URL:** `/skills` share button (SH6) already exists — confirm it passes `?ref={ninja_name}` and that the landing page reads the param and sets the cookie.

Files: `backend/app/routers/auth.py` or profile creation path, `frontend/app/(authed)/tokens/page.tsx`, `frontend/app/page.tsx` (cookie read from URL param).

---

### P4 — DESIGN POLISH (address "robotic / AI-generated" feedback)

**PR-LANDING-VISUAL-WARMTH — Soften the hero aesthetic**
Multiple users (Ashu, Aditya, Ravali) called the dark theme "too AI", "robotic", "futuristic in a bad way." The PR-K token shift already started this. The landing page needs one more pass:
- Reduce particle animation intensity by 50% OR replace with a very subtle dot-grid pattern (CSS only, no JS)
- The Gemini-generated images in `reference/branding/` show the brand aesthetic Shivam has in mind — reference those for tone
- Warm the hero background slightly toward `--bg-page: #0a0a0c` (already in PR-K) — verify it's applied on the public landing page too, not just the authed shell

**PR-NAV-DATE-DYNAMIC — "Live Job Data · 29 May" date is stale in public nav**
Public nav bar shows "Live Job Data · 29 May" (confirmed May 31 screenshot). This date should update to today's date or the last scraper run date. Fix: either derive date from a cached API response or make it dynamic from `new Date()`. Files: `frontend/components/public/top-nav.tsx` or wherever the nav label is composed.

---

### NEW DESIGN DECISIONS FOR SHIVAM (confirm before next session codes)

**ND4 — Quest Board layout** *(BLOCKING PR-QUEST-BOARD)*
Should "Today's Missions" (a) replace YourMoveCard entirely, (b) sit above it as a wider section, or (c) on mobile become a horizontal scrolling chip strip? Key constraint: dashboard on mobile is already dense. Recommended: replace YourMoveCard with a 3-row mission list on desktop; collapse to 2-chip horizontal strip on mobile (<480px). **Shivam to confirm or override.**

**ND5 — Landing page product preview format** *(BLOCKING Part B of PR-LANDING-CLARITY)*
Option A: static 3-screenshot gallery (can ship same session, no recording needed). Option B: 60-second Loom embed (higher impact, needs recording by Shivam). Option C: animated GIF of the dashboard. Recommended: start with Option A, replace with B when video exists. **Shivam to confirm.**

**ND6 — "PLANNED" features in tokens screen** *(BLOCKING BUG-9 full resolution)*
"Share with a friend +100 XP" row is "PLANNED". Options: (a) hide until referral ships [fastest, clean], (b) show as non-interactive "coming soon" chip [honest], (c) sprint to ship PR-REFERRAL-V1 first [best UX]. Recommended: (a) hide it now, (c) ship referral in same sprint. **Shivam to confirm.**

**ND7 — Feedback form fix priority** *(BLOCKING BUG-10)*
Two users independently reported the bottom-left feedback form is broken (question not selectable). This is the primary bug-reporting surface. Is this still broken in prod today? If Shivam confirms yes — treat as P0 alongside BUG-7. **Shivam to verify in prod and confirm priority.**

**ND8 — Special character UTF-8 corruption** *(BLOCKING ND3 from prior session)*
"R&D", "Néstor", accented characters corrupt during CV ingestion (confirmed multiple users). Root cause: likely `pdfplumber` returning Latin-1 then being decoded as UTF-8. Fix: force `encoding='utf-8'` + `errors='replace'` in `cv_parser.py`, add test for `résumé`, `R&D`, `Señor`. **Shivam to confirm this is still active (not fixed in a backend deploy we don't see here).**

---

### BUILD ORDER FOR NEXT SESSION

```
Phase 1 (bugs, no decisions needed):
  BUG-7 → BUG-9 → BUG-10 verify → BUG-8 → BUG-3 → PR-F verify

Phase 2 (first-time journey, no decisions needed):  
  PR-COACHMARKS → PR-LANDING-FAQ → PR-LANDING-CLARITY Part A → PR-NAV-DATE-DYNAMIC

Phase 3 (engagement + growth, needs ND4/ND5/ND6 confirmed):
  PR-QUEST-BOARD (after ND4) → PR-REFERRAL-V1 (after ND6) → PR-LANDING-CLARITY Part B (after ND5)

Phase 4 (design polish, standalone):
  PR-LANDING-VISUAL-WARMTH → PR-SKILL-TIER-TOOLTIPS (= BUG-3)
```

**Commit pattern:** one PR per item, `fix:` / `feat:` prefix. `tsc --noEmit` + `next lint` clean before merge. All work to `Develop`.

---

## LAST SESSION SUMMARY (2026-06-06 · Automated deep audit — Sprint 5 plan)

Scheduled task ran a second, deeper audit of `reference/` — this time reading **all 15 PDF feedback documents** (never previously analyzed), all 5 DOCX files, 4 markdown feedback files, the `BRAND_IDENTITY.md`, `mobile-redesign/DESIGN_REFERENCES.md`, and `mobile-redesign/INVENTORY.md`. Also verified Sprint 4's bug list against live code. No code was written — output is Sprint 5 plan below.

**New source materials analyzed this session:**
- `User feedback docs/*.pdf` (15 PDFs: Aparna, Hetvi, Mannat ×2, Krrish Sain, 6+ anonymous beta users)
- `User feedback docs/*.docx` (5 DOCX: HiMyro_Review_Final, Myro_Website_Feedback_Report, Platform Assessment, Task Submission, Feedback for Himyro)
- `branding/BRAND_IDENTITY.md` — full dual-accent visual system spec
- `mobile-redesign/DESIGN_REFERENCES.md` — 7 reference apps + brightness/typography tokens

**Key NEW findings not previously logged:**

1. **BUG-7 status: ALREADY FIXED** — `myro/page.tsx` is a proper "Welcome to Myro" page with resource shelf + shortcuts. "Carries the thread" stub is gone. Do NOT touch.
2. **BUG-12 CONFIRMED** — "Lightcast taxonomy" jargon lives in `app/(authed)/cv/page.tsx` line ~300. Confirmed user-facing, needs plain English.
3. **BUG-11 NEW** — Forge session *completion* UX is unclear — multiple users independently confused about how to "fully end" a session. `ForgeModal.tsx` has a complete-screen but the path to it is opaque.
4. **BUG-13 NEW** — Zero-skill extraction with no guidance. Users with minimal CVs get 0 skills, no inline tip on what makes extraction work.
5. **ND9 NEW** — "The 10 domains are never explained" — called out explicitly in 3 independent feedback docs. Before upload, the scoring framework is a complete black box.
6. **ND10 NEW** — "Free vs paid" ambiguity — Aparna + 4 others hesitated to explore because no "free to start" signal exists anywhere. Critical conversion killer.
7. **Feedback form (BUG-10)**: `CategoryCard` is structurally fine (proper `<button onClick>`). The "broken" reports are likely mobile pointer-events or z-index. Needs live QA on phone, not a code rewrite.
8. **Brand identity doc** (`BRAND_IDENTITY.md`) defines dual-accent Signal/Forge system + Space Grotesk typography scale that is NOT fully implemented. Deferred but noted for design system work.

**Synthesis from 30+ unique user voices:** The universal pain has 3 layers:
- **Layer 1 (trust):** "Is this free? Will I be charged? What am I even being scored on?"
- **Layer 2 (orientation):** "I don't know what to do first or why the nav labels mean."
- **Layer 3 (retention):** "No reason to come back after I see my score."

Sprint 4 addressed Layer 2 (coachmarks, FAQ, onboarding wiring). Sprint 5 must address **Layer 1** (trust signals) and **Layer 3** (daily missions / referral). The Arham / game-analogy feedback remains the single strongest product insight: XP + missions + daily loop = the retention engine. It just needs to be made visible.

---

## SPRINT 5 — TRUST SIGNALS + RETENTION ENGINE

**Goal:** Make users trust Myro before they sign up. Give them a reason to open it tomorrow.

**What Sprint 4 left for Sprint 5 (carry-over + new):**
- BUG-9, BUG-10, BUG-8, BUG-3, PR-F verify (carry-over from Sprint 4 P0 — still open)
- PR-COACHMARKS, PR-LANDING-FAQ, PR-LANDING-CLARITY, PR-QUEST-BOARD, PR-REFERRAL-V1, PR-LANDING-VISUAL-WARMTH, PR-NAV-DATE-DYNAMIC (Sprint 4 items, code not yet written)
- Plus new items from this audit below

---

### P0 — CARRY-OVER BUGS (fix first, no decisions needed)

**BUG-7 — RESOLVED.** `myro/page.tsx` is a real page. Remove from tracking.

**BUG-9 — "Share with a friend: PLANNED" on tokens page**
`frontend/app/(authed)/tokens/page.tsx` — hide the PLANNED row until referral ships. One-line conditional. Decision: per ND6, hide it (option a).

**BUG-8 — "India, India" duplicate location**
Job card/drawer: if `location_city === location_country`, show only country. Files: `frontend/components/jobs/` or `dashboard/`.

**BUG-3 — Skill tier label needs tooltip**
Add `title="Building: L1–L2. Active practice needed to reach the next level."` + `aria-label` to the tier pill. Files: `frontend/components/skills/practice-skill-list.tsx`.

**BUG-10 — Feedback form category selection broken on mobile**
The `CategoryCard` buttons look structurally correct, but two independent users report failure on phone. Likely: `pointer-events: none` on a parent, or z-index conflict with a modal overlay, or `touch-action` missing. Fix: QA on a real phone with DevTools remote debugging. Check `feedback-fab.tsx` parent `pointerEvents: "none"` container — the quick-pill buttons inherit `pointer-events: none` from their parent div. **This is likely the root cause**: `feedback-fab.tsx` wraps everything in `pointerEvents: "none"` and only restores it on the child buttons — but `CategoryCard` buttons inside the hub may be inside this container. Verify and fix pointer-events inheritance. Files: `frontend/components/feedback/feedback-fab.tsx`, `feedback-hub.tsx`.

**PR-F VERIFY — 375px skill card QA**
Open `/skills` at 375px Chrome DevTools. Check (a) sticky tab pill background, (b) SE14 icon-only buttons. Fix CSS if broken.

---

### P0-NEW — NEW BUGS (from this audit, code-ready)

**BUG-11 — Forge session completion path unclear (MEDIUM)**
Multiple users say "I couldn't figure out how to fully end/complete a forging session." The `ForgeModal.tsx` has a `complete` screen and a "Complete session" button — but it's gated on `canClaim` (timer must finish). Users who want to stop early don't see an exit path. Fix: add a clearly labeled "End session early" link beneath the timer. When clicked → confirms with "You'll forfeit XP for this session. Continue?" → closes modal, logs partial session, does NOT award XP. Separate affordance from "Claim XP" CTA which remains the primary action on timer completion. Files: `frontend/components/forge/ForgeModal.tsx`.

**BUG-12 — "Lightcast taxonomy" jargon in CV upload (LOW, easy win)**
`frontend/app/(authed)/cv/page.tsx` line ~300: `"We extract skills, map them to the Lightcast taxonomy, and parse your CV into sections."` Replace with: `"We identify your skills and map them to 32,000+ recognized skill types used by real hiring managers."` One string change. Files: `frontend/app/(authed)/cv/page.tsx`.

**BUG-13 — No CV extraction guidance for sparse CVs (MEDIUM)**
Users with minimal CVs get 0 skills extracted, no explanation. Add a teal info callout beneath the file upload button with 3 tips: (a) "Include your tools and technologies by name (e.g. Python, Figma, SQL)", (b) "List bullet-point achievements, not just job titles", (c) "Add a Skills section to your CV before uploading." Shown always (not on error) — pre-empts the frustration. Files: `frontend/app/(authed)/cv/page.tsx` or upload component.

---

### P1 — TRUST SIGNALS (highest conversion impact, code-ready, no grill needed)

**PR-TRUST-SIGNALS — Three landing-page trust fixes (ship together as one PR)**

These all address the same root cause: users don't trust the platform before they sign up. All three are copy/layout changes, no API work.

**T1 — "Free to start" badge**
Add `Free to start · No credit card` in 11px `--text-muted` directly below the primary CTA button on the landing page AND below the "Create account" button on the signup form. Single line, no box. Files: `frontend/components/public/landing-page.tsx`, `frontend/app/signup/page.tsx`.

**T2 — What you'll be scored on**
On the CV upload screen (pre-upload state in `app/(authed)/cv/page.tsx`), add a compact collapsible "What is the Myro Score?" section showing the 10 domains as small chips. Copy: "Your CV is scored across 10 career domains: [Technology · Data · Communication · Leadership · Strategy · Marketing · Operations · Finance · Product · People]. The score reflects how your skills map to live hiring demand." Collapsed by default, opens on click. Also add one sentence to the landing FAQ ("What is the Myro Score?") listing the 10 domains. Files: `frontend/app/(authed)/cv/page.tsx`, `frontend/components/public/landing-page.tsx`.

**T3 — Social proof count on landing hero**
Add "Join X,XXX job seekers already using Myro" above or below the hero CTA. Derive from a lightweight `GET /health` or `GET /public/stats` endpoint returning user count, or hardcode a conservative floor (e.g. 500) until the endpoint exists. File: `frontend/components/public/landing-page.tsx`, `backend/app/routers/public.py` (add `/public/stats` endpoint if not exists).

---

### P1 — FIRST-TIME JOURNEY (carry-over from Sprint 4, code-ready)

**PR-COACHMARKS** — See Sprint 4 P1 for full spec. Ship as-is.

**PR-LANDING-FAQ** — See Sprint 4 P1 for full spec. Ship as-is. Amend FAQ #3 to include domain list per T2 above.

**PR-LANDING-CLARITY Part A** — 3-step visual + testimonials. See Sprint 4 P1. Ship as-is.

**PR-NAV-DATE-DYNAMIC** — Stale "29 May" nav date. See Sprint 4 P4. Ship as-is.

---

### P2 — RETENTION ENGINE (needs decisions ND4 + ND6)

**PR-QUEST-BOARD** — Daily missions. See Sprint 4 P2 for full spec. Blocked on ND4.

**PR-REFERRAL-V1** — Wire referral end-to-end. See Sprint 4 P3 for full spec. Blocked on ND6.

**PR-LANDING-CLARITY Part B** — Product preview. Blocked on ND5.

---

### P3 — DESIGN POLISH (standalone, ship any time)

**PR-LANDING-VISUAL-WARMTH** — Reduce particle animation 50%, apply `--bg-page: #0a0a0c` to public landing too. See Sprint 4 P4.

---

### NEW DESIGN DECISIONS FOR SHIVAM (Sprint 5 additions)

Decisions ND4–ND8 from Sprint 4 carry over unchanged. New decisions added this session:

**ND9 — Domain preview placement** *(INFORMS T2 above)*
The 10 domains need to appear somewhere before/during CV upload. Option A: collapsible section on the upload screen (described in T2). Option B: one-line chip strip in the landing FAQ answer. Option C: both. Recommended: both (minimal effort, maximum coverage). Shivam to confirm copy for the 10 domain names — are these the exact names shown in the skill map?

**ND10 — "Free to start" badge wording** *(INFORMS T1 above)*
Suggested: `Free to start · No credit card`. Alternative: `Always free · Premium features unlock with XP`. Which framing is more accurate given the current XP model? Recommended: the first — simpler, more universal. Shivam to confirm.

**ND11 — CV extraction tips — always visible or on-error?** *(INFORMS BUG-13)*
Option A: Always visible beneath upload button (pre-empts frustration before it starts). Option B: Show only after failed extraction (0 skills found). Option C: Show on first upload only, then hide. Recommended: Option A — most visible, no state logic needed. Shivam to confirm.

**ND12 — Forge early-exit confirmation copy** *(INFORMS BUG-11)*
When user exits mid-session: (a) "End session — forfeit XP for this session?" or (b) "Stop practice — no XP will be awarded for incomplete sessions." Recommended: (a) — shorter, more conversational. Shivam to confirm.

---

### BUILD ORDER FOR SPRINT 5

```
Phase 1 — bugs (no decisions needed):
  BUG-9 → BUG-8 → BUG-3 → BUG-10 → BUG-12 → PR-F verify
  BUG-11 (after ND12) → BUG-13 (after ND11)

Phase 2 — trust signals (no decisions needed for T1/T3; ND9 needed for T2):
  PR-TRUST-SIGNALS (T1 + T3 first, T2 after ND9)

Phase 3 — first-time journey (no decisions needed):
  PR-COACHMARKS → PR-LANDING-FAQ → PR-LANDING-CLARITY Part A → PR-NAV-DATE-DYNAMIC

Phase 4 — retention (needs ND4/ND5/ND6 + ND10):
  PR-QUEST-BOARD → PR-REFERRAL-V1 → PR-LANDING-CLARITY Part B

Phase 5 — polish (standalone):
  PR-LANDING-VISUAL-WARMTH
```

**Commit pattern:** one PR per item, `fix:` / `feat:` prefix. `tsc --noEmit` + `next lint` clean before merge. All work to `Develop`.

**Questions for Shivam (confirm at session start before Phase 2 coding):**
- ND4: Quest Board layout (desktop list vs mobile chip strip)
- ND5: Landing preview format (screenshot gallery vs Loom vs GIF)
- ND6: PLANNED referral row (hide vs ship referral now)
- ND7: Feedback form — still broken on phone? P0 or P1?
- ND8: UTF-8 corruption — still active in prod?
- ND9: Domain preview placement + exact 10 domain names
- ND10: "Free to start" badge wording
- ND11: CV extraction tips — always visible or on-error?
- ND12: Forge early-exit confirmation copy

---

## LAST SESSION SUMMARY (2026-06-08 · Automated deep audit — Sprint 6 plan)

Scheduled task ran a third autonomous audit of `reference/` — this time covering every folder not previously analyzed, including two new handoff bundles that were missed in prior sessions. No code was written.

**New materials analyzed this session:**
- `reference/building-10-min-cv-onboarding-extracted/design_handoff_progressive_nav/README.md` — complete high-fidelity spec for the progressive-disclosure nav including the **first-run base tour** (3-step coachmark sequence)
- `reference/_bsup_extract/design_handoff_signup/README.md` + 4 screenshots — complete signup modal redesign (2-mode: operators + institutions, step progress, light theme, success state)
- `reference/branding/BRAND_IDENTITY.md` — canonical brand system: dual-accent toggle (Signal Teal / Forge Amber), Space Grotesk primary font, 5-size type scale, four-signal interactive rule
- `reference/AAAAAA/` — 10 screenshots from 28th May showing "About CV hub landing page" design vision
- `reference/User suggestions_28may.md` — 8 additional user voices (all converge on: simpler onboarding, faster wow moment, "I didn't know what to do")

**Code state verified against Sprint 5 carry-overs:**
- BUG-3 ✅ CLOSED (`skillTierHint` + `title`/`aria-label` on tier pill in `practice-skill-list.tsx`)
- BUG-8 ✅ CLOSED (`lib/format-location.ts` de-dupes city===country)
- BUG-9 ✅ CLOSED (PLANNED row no longer present in `tokens/page.tsx`)
- BUG-11 ✅ CLOSED (`forge/page.tsx:236` "End session — forfeit tokens?" confirm)
- BUG-12 ✅ CLOSED (`cv/page.tsx:423` "32,000+ recognized skill types used by real hiring managers")
- BUG-13 ✅ CLOSED (`cv/page.tsx:460-461` extraction tips, gated on skills_detected===0)
- Nav date ✅ CLOSED (`top-nav.tsx:41` uses `new Date()` dynamically)
- BUG-10 ⚠️ NEEDS PHONE QA — `CategoryCard` is a proper `<button onClick>`, no pointer-events issue visible in code; the "broken" reports may be a z-index/overlay conflict on specific Android Chrome versions. Needs live device repro.
- PR-F ⚠️ NEEDS PHONE QA — sticky tab + SE14 icon-only need visual confirm on 375px device
- Landing page items — ALL UNBUILT (`landing-page.tsx` is 148 lines: hero + SampleDiagnostic + footer only)

**Critical new finding: BASE TOUR is missing.**
`use-nav-unlocks.ts` fires coachmarks only on mid-session unlock transitions. The progressive-nav handoff spec requires a 3-step first-run tour (dashboard→yard→market) with 650ms delay, step dots, and scrim. This was never built. Given that 30/30 users said "I didn't know what to do after signing up", this is the single highest-impact unbuilt item.

---

## SPRINT 6 — FIRST-RUN EXCELLENCE + LANDING PAGE DEPTH

**Goal:** Make every first-time user know exactly what to do within 60 seconds of signing up. Make the landing page earn its conversion.

**What Sprint 5 left unbuilt (carry-over):**
- BUG-10 phone QA, PR-F 375px QA
- PR-TRUST-SIGNALS (T1/T2/T3), PR-LANDING-FAQ, PR-LANDING-CLARITY, PR-LANDING-VISUAL-WARMTH
- PR-QUEST-BOARD (blocked on ND4), PR-REFERRAL-V1 (blocked on ND6)

---

### P0 — CARRY-OVER PHONE QA (do on a real device, not DevTools)

**BUG-10 — Feedback form category cards broken on mobile (VERIFY FIRST)**
`CategoryCard` is a valid `<button onClick>`. Likely culprit: the hub dialog overlay has a touch-passthrough issue on Android Chrome — modal's root element may not stop touch propagation, so taps fall through to content behind. Check `feedback-hub.tsx` root div's `onPointerDown`/`onTouchStart` handling and the hub's z-index stacking context. Fix: add `onPointerDown={e => e.stopPropagation()}` on the modal backdrop and verify it captures touch events. Files: `components/feedback/feedback-hub.tsx`, `feedback-hub.css`.

**PR-F VERIFY — 375px skill card (confirm or fix)**
Load `/skills` at 375px Chrome DevTools. Check: (a) `Intel · Map · Audit` sticky pill has `--bg-page` background so it doesn't overlap cards; (b) `<480px` skill-card action buttons = icons only (SE14). If either fails → fix CSS. Files: `components/skills/`.

---

### P0-NEW — FIRST-RUN BASE TOUR (CRITICAL, highest-impact unbuilt item)

**PR-BASE-TOUR — 3-step coachmark tour for first-time users**

Full spec in `reference/building-10-min-cv-onboarding-extracted/design_handoff_progressive_nav/README.md`. This is the "base tour" section. The current `use-nav-unlocks.ts` only handles mid-session unlock coachmarks; first-time users get zero guidance.

**What to build:**
1. Add `baseTourSeen` to `use-nav-unlocks.ts` — reads/writes `localStorage["myro_tour_base_v1"]`.
2. On first authed mount where `versions` and `profile` both resolve AND `baseTourSeen === false`: after **650ms** delay, open a tour queue for `["home", "forge", "market"]` (the 3 base nav items).
3. Separate `tourQueue` state (distinct from `coachQueue` for unlock events) — `tourQueue[0]` is the active tour step.
4. Update `Coachmark` in `topbar-nav.tsx` to accept a `tourStep?: {current: number; total: number}` prop. When `tourStep` is present, render **step dots** below the body: 3×6px pill; current = `var(--tm-accent)` 16px wide; done = `var(--tm-accent-ring)`; upcoming = `var(--tm-border)`. Last step button = "Got it"; earlier steps = "Next →".
5. Tour-step coachmark copy (use verbatim, from the handoff spec):
   - `home`: tag `01 · MISSION CONTROL`; body: "Home base. Your Myro Score, your best-matched role, and the single next move toward an offer."
   - `forge`: tag `02 · CLOSE THE GAP`; body: "Daily reps that close the exact skill gaps standing between you and the roles you want."
   - `market`: tag `03 · STRAIGHT FROM CAREER PAGES`; body: "Real openings read live from company career pages — matched to your skills and scored for fit. This is where your next CV begins."
6. Scrim already exists (`tm-nav-scrim`); while tour is active, non-target nav items get `opacity: 0.32`.
7. On "Got it" (last step): mark `baseTourSeen = true`, clear tour queue.
8. While tour active: clicking scrim advances tour (same as Next).
9. Respect `prefers-reduced-motion` — entrance animates transform only (existing pattern in nav CSS).

**Files:** `lib/hooks/use-nav-unlocks.ts`, `components/nav/topbar-nav.tsx`, `components/nav/topbar-nav.css` (step dots styles).
**Acceptance:** Fresh account (clear `myro_tour_base_v1`) → land on `/home` → after 650ms coachmark appears on Dashboard item with step dots `● ○ ○` → click Next → Forge coachmark `● ● ○` → click Next → Market coachmark `● ● ●` + "Got it" → tour done, flag set, never auto-runs again. Blocked on ND13.

---

### P1 — LANDING PAGE DEPTH (all unbuilt, ship as one PR)

**PR-LANDING-DEPTH — Full landing page build-out**
`components/public/landing-page.tsx` is 148 lines. Every Sprint 5 item for the landing page is unbuilt. Build all together as one PR:

**T1 — "Free to start" trust badge**
Add `Free to start · No credit card` in `var(--tm-text-muted)` 11px directly below the "Choose file" / "Drop CV" CTA button. Single inline line, no box. Mirror to the signup form (`components/auth/signup-modal.tsx`).

**T2 — What you'll be scored on**
Add a `?` icon or "How is scoring calculated?" link beside the Myro Score badge on the landing hero. Opens an inline collapsible showing 10 domain chips: `Technology · Data · Communication · Leadership · Strategy · Marketing · Operations · Finance · Product · People`. Same copy goes into FAQ answer #3. Blocked on ND9 (confirm exact domain names).

**T3 — Social proof count**
Add "Join 500+ job seekers already using Myro" above hero CTA (or wire to `GET /public/stats` if endpoint exists in `backend/app/routers/public.py`). 500 is a conservative floor; update when real count is known. Files: `landing-page.tsx`, optionally `backend/app/routers/public.py`.

**FAQ section** — 5 items, collapsible (details/summary or custom accordion):
1. "Is Myro free?" → Yes, free to start. XP lets you unlock skill advice and company intel. No credit card.
2. "How is this different from LinkedIn or Naukri?" → Myro scores your CV against live job data and shows exactly which skills to build. LinkedIn shows you jobs; Myro shows what's stopping you from getting them.
3. "What is the Myro Score?" → A 0–100 score across 10 career domains, computed from your CV skills against real hiring demand: [domain chips]. It goes up as you practice skills and add evidence.
4. "Is my CV private?" → Yes. Your CV is never shared or visible to recruiters. Only you see it. Your public profile shows only your Myro Score and domain map — never your actual CV text.
5. "What is Forge?" → Forge is your practice yard. Pick a skill, run a 25-minute focused session, earn XP. Each session moves your skill level from L0 to L5.

**3-step visual flow**
Below the hero, add a horizontal "How it works" block: three connected numbered steps: `① Upload your CV → ② Get your Myro Score → ③ Tailor & send the right one`. Each step: number pill + title + one-line description. Connected with a thin dashed line on desktop; stacked on mobile.

**Testimonials**
3 user quotes from beta feedback (use verbatim from `reference/User feedback docs/`):
- Aman: "The Myro Score and skill mapping made the platform feel highly intelligent from the start."
- Ananya: "Having multiple CV versions in one place instead of random PDFs scattered everywhere is genuinely useful."
- Ashu: "The light theme looks clean and professional. The job-targeting system is a strong idea."
Add as a minimal text strip: quote + initial + city. No photos.

**Files:** `components/public/landing-page.tsx`, `components/public/landing-page.css`.
**Acceptance:** Landing page has trust badge, 3-step visual, 3 testimonials, FAQ accordion (5 items), social proof count. All visible above or near fold on 375px.

---

### P2 — SIGNUP REDESIGN (after ND14 confirmed)

**PR-SIGNUP-REDESIGN — Implement light-theme signup modal spec**
Full high-fidelity spec at `reference/_bsup_extract/design_handoff_signup/README.md`. Screenshots at `reference/_bsup_extract/design_handoff_signup/screenshots/`.

Key elements to implement:
- **Two-mode switcher**: "For operators" / "For institutions" sliding pill tab (`role="tablist"`).
- **Step progress visualization**: 5-step connected progress bar (Upload · Read · Target · Tailor · Download for operators). Display-only, advances one step on success.
- **Eyebrow**: mono 12px uppercase "SIGN UP · 30 SECONDS".
- **Headline**: Newsreader serif 38px "Start your CV hub."
- **Success state**: replaces left column — green check badge, serif title "Check your inbox.", what's-next 3-row numbered list.
- **Right rail ("What you'll get")**: 3 perk cards matching the mode (Score CV / Tailor versions / Track jobs for operators).
- **Light theme**: emerald primary `#148462`, white surfaces, ink `#0E1B17`. This already matches the existing `/institutions` route styling.
- **Institution email validation**: reject `@gmail|yahoo|outlook|...` on blur, accept institutional domains.
- Design tokens are in `reference/_bsup_extract/design_handoff_signup/README.md` section "Design tokens (exact)".
- The signup HTML prototype is at `reference/_bsup_extract/design_handoff_signup/signup.html` — open it in a browser to see the exact target.
**Files:** `app/signup/page.tsx`, `components/auth/signup-modal.tsx`, `app/signup/institutions/`.
Blocked on ND14.

---

### P3 — RETENTION ENGINE (blocked on decisions)

**PR-QUEST-BOARD** — Daily missions. See Sprint 5 P2 for full spec. Blocked on ND4.

**PR-REFERRAL-V1** — Wire referral end-to-end. See Sprint 5 P3 for full spec. Blocked on ND6.

**PR-LANDING-VISUAL-WARMTH** — Reduce particle animation 50%, apply `--bg-page` to public landing. See Sprint 5 P4. Standalone, no decisions needed.

---

### P4 — BRAND SYSTEM (new, decisions required)

**PR-BRAND-TOKEN-AUDIT — Enforce 5-size type scale (non-blocking, Sprint 6 if bandwidth allows)**
`reference/branding/BRAND_IDENTITY.md` section 6 defines a strict 5-token type scale:
- `--fs-display: 36px/40px` · `--fs-title: 24px/32px` · `--fs-heading: 18px/26px` · `--fs-body: 16px/24px` · `--fs-meta: 13px/18px`
Many page-scoped CSS files use one-off `font-size` values outside this scale. Audit and normalize. Files: `app/globals.css`, all page-scoped `*.css` files.

Dual-accent toggle and Space Grotesk migration: see ND15 and ND17. Deferred pending decisions.

---

### NEW DESIGN DECISIONS FOR SHIVAM (Sprint 6)

Decisions ND4–ND12 from Sprint 5 carry over unchanged. New:

**ND13 — First-run base tour scope** *(BLOCKING PR-BASE-TOUR)*
Handoff specifies 3-step coachmark tour (650ms delay, step dots, scrim, specific copy). Options:
(a) Build exactly per handoff spec — scrim, step dots, 650ms delay, copy verbatim ← recommended
(b) Simpler — single "welcome" coachmark on home only, no tour sequence
(c) Skip — rely on PR-COACHMARKS page-level banners instead
**Recommended: (a).** This is the original spec and directly addresses "I didn't know what to do" (30/30 users). Single biggest retention lever before the quest board. **Confirm before coding.**

**ND14 — Signup redesign scope** *(BLOCKING PR-SIGNUP-REDESIGN)*
Complete redesign spec exists at `reference/_bsup_extract/design_handoff_signup/README.md`. Options:
(a) Minimal: remove ninja name field + add "free to start" badge (1h work)
(b) Full redesign per spec: two-mode switcher + step progress + light theme + success state (~3 sessions)
(c) Full redesign + merge `/institutions` into the same modal (replaces current separate `/institutions` page)
**Recommended: (b).** The light-theme spec is self-contained and the `/institutions` route is already light-themed, so the design language is established. **Confirm before coding.**

**ND15 — Dual accent toggle (Signal/Forge) timeline**
`reference/branding/BRAND_IDENTITY.md` defines dual-accent as a core differentiator. `reference/branding/AccentToggle.tsx` prototype exists. Options:
(a) Sprint 6: implement toggle — CSS var swap, localStorage persistence, Signal/Forge pill in settings
(b) Defer to dedicated branding sprint after beta-3 launch
(c) Drop — Signal teal is the only accent
**Recommended: (b) defer.** CSS variables are already scoped for this. Higher-value sprint 6 work (base tour, landing) comes first.

**ND16 — Zero-friction "wow moment" pre-CV**
Multiple users (especially `User suggestions_28may.md`) want value before CV upload. `SampleDiagnostic` already exists. Options:
(a) Enhance `SampleDiagnostic` — expandable domains, animated score build-up, "what these domains mean" tooltips
(b) Add a "Try without CV" path — role selector → instant sample score for that role
(c) 30-second Loom/product video embed
**Recommended: (a) for Sprint 6 — SampleDiagnostic exists and can be deepened without backend work.** Confirm.

**ND17 — Font migration (Space Grotesk → primary)**
`BRAND_IDENTITY.md` says Space Grotesk is the primary UI font. Current app uses Geist.
**Recommended: defer.** Font migrations surface unexpected edge cases. Prioritize user-facing impact first. Confirm.

---

### BUILD ORDER FOR SPRINT 6

```
Phase 1 — phone QA (do on a real device):
  BUG-10 verify → PR-F 375px verify

Phase 2 — first-run excellence (after ND13 confirmed):
  PR-BASE-TOUR

Phase 3 — landing page (no decisions needed for T1/T3/3-step/testimonials/FAQ):
  PR-LANDING-DEPTH (T1 + T3 + FAQ + 3-step + testimonials)
  T2 after ND9 domain-names confirmed

Phase 4 — signup redesign (after ND14 confirmed):
  PR-SIGNUP-REDESIGN

Phase 5 — retention + polish (after ND4/ND6 confirmed):
  PR-QUEST-BOARD → PR-REFERRAL-V1 → PR-LANDING-VISUAL-WARMTH

Phase 6 — brand (after ND15/ND16/ND17 confirmed):
  SampleDiagnostic enhancement → PR-BRAND-TOKEN-AUDIT → AccentToggle (if ND15=yes)
```

**Commit pattern:** one PR per item, `fix:` / `feat:` prefix. `tsc --noEmit` + `next lint` clean before merge. All work to `Develop`.

**Questions for Shivam (confirm at session start before coding):**
- ND13: First-run base tour — full spec per handoff or simpler?
- ND14: Signup redesign — minimal fix or full redesign?
- ND15: Dual accent toggle — sprint 6 or defer?
- ND16: "Wow moment" — enhance SampleDiagnostic or try-without-CV path?
- ND17: Font migration — now or defer?
- ND4 (carry-over): Quest Board layout (desktop list vs mobile chip strip)
- ND5 (carry-over): Landing preview format
- ND6 (carry-over): PLANNED referral row
- ND7 (carry-over): Feedback form still broken on phone?
- ND9 (carry-over): Exact 10 domain names for landing copy
