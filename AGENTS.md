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
- **CORS gotcha:** `ALLOWED_ORIGINS` env var is **DEAD CONFIG** — not read anywhere. CORS hardcoded `allow_origins=["*"], allow_credentials=False` in `backend/app/main.py:41` (safe: bearer-token auth, no cookies). To lock origins, wire `main.py` (code change → Develop + tests).
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

## LAST SESSION SUMMARY (2026-07-03 - CV point ATS skill chips)

Surfaced Myro's extracted skill audit directly inside the CV Playground so each
editable CV point can show the skills already backed by that exact evidence.

- Added `extractedSkillsForCvPoint()` in `frontend/lib/skill-intelligence.ts`.
  It maps `/users/me/skills` evidence to a CV point using the same
  exact/substr evidence rule as the backend skill-edit locator, avoiding noisy
  tags from skill-name-only text.
- Added `CVPointSkillChips` and extracted `CVPointRow` so the CV editor stays
  under the 300-line guardrail while each row can render a quiet `ATS` chip
  strip beside existing job-match metadata.
- Wired `CVEditor` to fetch `users.mySkills()` through the existing
  `dataKeys.userSkills()` query and pass the audit data to every visible point.
- Added minimal responsive CSS: desktop chips sit below the CV point text; on
  narrow mobile rows, actions move below the text so bullets do not collapse
  into a skinny column.
- Added `frontend/tests/cv-point-skills.test.ts` for evidence-to-point mapping,
  false-positive prevention, and editor/chip wiring.

Validation:

- Red/green focused test:
  `cd frontend && npx tsx --test tests/cv-point-skills.test.ts`
- Final focused frontend:
  `cd frontend && npx tsx --test tests/cv-point-skills.test.ts tests/skill-intelligence.test.ts`: 7 passed
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `.venv/bin/pytest backend/tests`: 908 passed, 1 skipped, 22 warnings
- `git diff --check`: clean
- Visual QA: Browser/IAB tool was unavailable in this thread, so Playwright used
  system Chrome. A temporary local harness rendered the CV point rows with real
  CV builder CSS; desktop and 375px mobile screenshots were inspected with
  `view_image`, no horizontal overflow after the mobile row-action fix. The
  harness route was removed before handoff.

Not touched: unrelated `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-07-03 - B2B recruiter and referral workspaces)

Closed the first meaningful B2B frontend slice by pairing the public recruiter /
referral doors with actual workspace previews that show how the employer-side
product behaves.

- Kept the public landing surfaces at `frontend/app/recruiters/page.tsx` and
  `frontend/app/referrals/page.tsx`, but updated their secondary CTAs to point
  to real preview workspaces instead of dead-end exploration links.
- Added a shared preview frame in
  `frontend/components/b2b/public-workspace-frame.tsx` plus shared dashboard
  primitives in `frontend/components/b2b/workspace-shell.tsx` and
  `frontend/components/b2b/workspace-shell.css` so recruiter and referral
  surfaces share one visual grammar.
- Added recruiter-side preview route
  `frontend/app/recruiters/workspace/page.tsx` with
  `frontend/components/b2b/recruiter-dashboard.tsx` and
  `frontend/components/b2b/recruiter-model.ts`.
  It now demonstrates:
  structured JD intake, L2-cluster-only filtering, live must-have skill
  toggles, ranked shortlist cards, and a narrow handoff pipeline.
- Added matching authed app route `frontend/app/(authed)/recruiter/page.tsx`
  so the same recruiter workspace can later plug into role-based auth without
  rebuilding the surface.
- Added referral-side preview route
  `frontend/app/referrals/workspace/page.tsx` with
  `frontend/components/b2b/referral-dashboard.tsx` and
  `frontend/components/b2b/referral-model.ts`.
  It now demonstrates:
  warm-path queueing, company filtering, intro-confidence ranking, visible
  status stages, and connector reward logic.
- Added matching authed app route `frontend/app/(authed)/referral/page.tsx`
  for the same reason — public preview now, auth-ready route later.
- Added focused model tests
  `frontend/tests/recruiter-match-model.test.ts` and
  `frontend/tests/referral-queue-model.test.ts` so the shortlist / referral
  sorting rules are locked in, plus
  `frontend/tests/b2b-workspace-routing.test.ts` to lock the public-door →
  workspace-preview → app-route wiring.

Validation:

- `cd frontend && npx tsx --test tests/recruiter-match-model.test.ts`: 3 passed
- `cd frontend && npx tsx --test tests/referral-queue-model.test.ts`: 3 passed
- `cd frontend && npx tsx --test tests/b2b-workspace-routing.test.ts`: 2 passed
- `cd frontend && npx next lint --file app/recruiters/page.tsx --file app/recruiters/workspace/page.tsx --file components/b2b/public-workspace-frame.tsx --file components/b2b/workspace-shell.tsx --file components/b2b/recruiter-model.ts --file components/b2b/recruiter-dashboard.tsx --file tests/recruiter-match-model.test.ts`: clean
- `cd frontend && npx next lint --file app/referrals/page.tsx --file app/referrals/workspace/page.tsx --file components/b2b/referral-model.ts --file components/b2b/referral-dashboard.tsx --file tests/referral-queue-model.test.ts`: clean
- `cd frontend && npx next lint --file app/(authed)/recruiter/page.tsx --file app/(authed)/referral/page.tsx --file tests/b2b-workspace-routing.test.ts`: clean
- `cd frontend && npm run check:ui-drift`: clean (`publicRouteCoverage: ok`)
- `git diff --check`: clean
- Browser QA via Playwright screenshots:
  `/recruiters/workspace` desktop + mobile clean,
  `/referrals/workspace` desktop + mobile clean,
  no visible clipping or broken responsive collapse.

Repo note:

- Full `cd frontend && npx tsc --noEmit` was not re-run for this slice because
  the worktree already contains unrelated in-flight edits around company signals
  / CV builder; last known repo-wide type stability cannot be attributed to this
  B2B change set alone.

Not touched: unrelated `docs/free-llm-api-resources`,
`frontend/app/(authed)/cv/cv-builder.css`,
`frontend/components/cv/builder/cv-editor.tsx`,
`frontend/components/cv/builder/cv-point-row.tsx`,
`frontend/components/cv/builder/cv-point-skill-chips.tsx`,
`frontend/lib/company-signals.ts`,
`frontend/lib/skill-intelligence.ts`, and
`frontend/tests/cv-point-skills.test.ts`.

## OLDER SESSION SUMMARY (2026-07-03 - Recruiter and referral public doors)

Shipped the first B2B public slice inside the existing Myro design system so
the new employer-side story can start living on the same canonical site.

- Added new public routes `frontend/app/recruiters/page.tsx` and
  `frontend/app/referrals/page.tsx` as recruiter and referral-partner entry
  doors, both using the existing public nav/footer and Myro token system.
- Built shared surface primitives in
  `frontend/components/public/b2b-door-page.tsx` +
  `frontend/components/public/b2b-door-page.css` so both pages stay visually
  uniform and future B2B/dashboard work can extend the same vocabulary instead
  of forking early.
- Framed the recruiter page around the actual mirror concept: JD intake, L2
  cluster-only comparison, evidence-backed shortlist rows, and a 3-4 profile
  handoff narrative.
- Framed the referral page as a warm-intro operations layer: role-first queue,
  connector trust, outcome tracking, and recruiter-ready filtered referrals.
- Added `/recruiters` and `/referrals` to `frontend/lib/site-routes.ts` so the
  footer, sitemap, and public-route coverage guard now recognize them.

Validation:

- `cd frontend && npx next lint --file app/recruiters/page.tsx --file app/referrals/page.tsx --file components/public/b2b-door-page.tsx --file lib/site-routes.ts`: clean
- `cd frontend && npm run check:ui-drift`: clean (`publicRouteCoverage: ok`)
- `cd frontend && npm run test:seo`: 5 passed
- Browser QA via Playwright screenshots on `/recruiters` and `/referrals`:
  desktop and mobile-width views both rendered cleanly with no visible layout
  breakage or CTA clipping
- `cd frontend && git diff --check`: clean

Repo note:

- Full `cd frontend && npx tsc --noEmit` is currently blocked by unrelated
  existing errors in `frontend/tests/company-signals-model.test.ts`
  (`TS1501` regex-flag target issue), outside this recruiter/referral slice.

Not touched: unrelated `docs/free-llm-api-resources`,
`frontend/components/market/company-signals-model.ts`,
`frontend/components/market/market-intel.css`,
`frontend/components/market/market-rail.tsx`,
`frontend/lib/hooks/use-market-intel.ts`,
`frontend/tests/company-signals-model.test.ts`, and untracked
`frontend/lib/company-signals.ts`.

## OLDER SESSION SUMMARY (2026-07-03 - Skill Intelligence heatmap redesign)

Redesigned the `/market?tab=heatmap` surface into the Skill Intelligence
cockpit for followed-company demand, CV skill levels, and practice actions.

- Replaced the inline market-page heatmap with extracted market components:
  `HeatmapTab`, `SkillIntelligenceHeatmap`, `SkillIntelligencePanel`,
  `SkillColumnPicker`, `JobDrillPanel`, `CVPrerequisiteCard`, and
  `jobs-tab-helpers`.
- Reframed the page around the line "We track what skills companies are hiring
  for", with a tracked-company count, followed-company meter, personalization
  signals, and a visible tracked-company rail above the matrix.
- Added per-skill intelligence: level/readiness pill, L1-L5 ladder, demand
  totals, top companies hiring for the selected skill, CV evidence, and direct
  actions to Practice, improve CV proof, or view matching jobs.
- Kept the heatmap columns tied to real CV skills and restored per-company row
  queries so each followed company row can load/cache independently.
- Added `frontend/lib/skill-intelligence.ts` plus focused frontend contract
  tests for readiness, evidence indexing, tracked-company personalization, and
  skill-to-jobs handoff.

Validation:

- `cd frontend && npx tsx --test tests/skill-intelligence.test.ts`: 4 passed
- `cd frontend && node --test tests/skill-intelligence-ui-contract.test.mjs`: 3 passed
- `cd frontend && npm run test:market-browse`: 3 passed
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `.venv/bin/pytest backend/tests`: 909 passed, 22 warnings
- `git diff --check`: clean

Browser QA note: local Playwright reached `/market?tab=heatmap`, but the authed
route could not render personalized data without a local session; desktop held
the app skeleton and mobile redirected to `/login?next=%2Fmarket%3Ftab%3Dheatmap`.

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-07-03 - Newsletter CTA routes to CV preview)

Aligned the newsletter primary score CTA with the user expectation that
"Get my free Myro Score" gives value before signup.

- Updated the newsletter article CTA in `frontend/app/newsletter/[slug]/page.tsx`
  from `/signup?...` to `/cv-preview?...`, preserving newsletter UTM attribution.
- Updated reusable MDX `NewsletterCTA` in
  `frontend/components/newsletter/issue-cta.tsx` to send role-specific score CTAs
  to `/cv-preview?...` while keeping the role and newsletter campaign query params.
- Kept the existing `nl-pill` visual treatment, button label, and layout intact;
  this is a route/value-flow change only.
- Added `frontend/tests/newsletter-cta-routing.test.ts` to lock the "Get my free
  Myro Score" CTA to the no-signup CV preview path and prevent drift back to
  `/signup`.

Validation:

- `cd frontend && npx tsx --test tests/newsletter-cta-routing.test.ts`: 1 passed
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npx next lint --file 'app/newsletter/[slug]/page.tsx' --file components/newsletter/issue-cta.tsx --file tests/newsletter-cta-routing.test.ts`: clean
- `.venv/bin/pytest backend/tests`: 909 passed, 22 warnings
- `git diff --check`: clean

Full `cd frontend && npm run lint` was blocked by unrelated untracked
`frontend/components/market/skill-intelligence-panel.tsx`:
`react/no-unescaped-entities` at line 83.

Not touched: unrelated untracked `docs/free-llm-api-resources`,
`frontend/components/market/skill-intelligence-heatmap.tsx`,
`frontend/components/market/skill-intelligence-panel.tsx`, and
`frontend/lib/skill-intelligence.ts`.

## OLDER SESSION SUMMARY (2026-07-02 - Internshala-safe feedback messaging)

Reframed the prospective-intern feedback flow so it no longer reads like a
required beta-testing or bug-reporting selection task.

- Updated the candidate message in `User_Feedbacks/01-candidate-assignment-message.md`
  to say feedback is optional, can be skipped under Internshala guidelines, and
  will not penalize the application.
- Updated `User_Feedbacks/02-feedback-intake-and-scoring.md`,
  `User_Feedbacks/03-feedback-analysis-playbook.md`, and `User_Feedbacks/README.md`
  so optional feedback is product research only and non-submission is never a
  negative hiring signal.
- Updated the live `/beta-feedback` page metadata and visible copy from
  "assignment/final submission/test session" to optional feedback language,
  including an explicit Internshala skip boundary.
- Removed visible "bug reporting" prompt language from the form, while keeping
  contextual evidence fields available when voluntarily relevant.
- Updated backend duplicate/failure messages from "beta assignment" to
  "optional feedback".
- Expanded `frontend/tests/beta-feedback-contract.test.mjs` so this boundary is
  covered by regression tests.

Validation:

- `cd frontend && npm run test:beta-feedback`: 8 passed
- `.venv/bin/pytest backend/tests/test_beta_feedback_router.py backend/tests/test_feedback_router.py`: 25 passed, 6 warnings
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `.venv/bin/pytest backend/tests`: 899 passed, 22 warnings
- `git diff --check`: clean

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-30 - Dashboard drawer JD hierarchy)

Cleaned up the dashboard job slide-in so the job itself stays central.

- Moved the job description section above company intel, directly after the
  matched/build skills block.
- Shortened the company CTA from `Reviews + funnel →` to `Company report →`.
- Removed the redundant company paragraph that explained the visible report
  button and pushed useful job details lower.
- Renamed `Other open roles here` to the tighter `More roles`.
- Added `frontend/tests/dashboard-drawer-content.test.ts` to lock the drawer
  order and compact company-report copy.

Design notes for the drawer:

- Keep secondary discovery surfaces below the JD. Company intel and adjacent
  roles are useful, but they should not interrupt the user's first question:
  "Do I understand this job, and do I fit it?"
- The remaining awkward bits to revisit later are the raw translated/non-English
  title/JD mismatch, vague country-only location, `Lock in · 9 ses`
  abbreviation, and any dangling one-line `Why you fit` fragments that read
  like sentence leftovers.

Validation:

- `cd frontend && npx tsx --test tests/dashboard-drawer-content.test.ts`: 2 passed
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `.venv/bin/pytest backend/tests`: 902 passed, 22 warnings
- `git diff --check`: clean

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-30 - Extension skill paste extraction)

Added a paste-and-extract skill flow to the Myro Chrome extension review panel.

- Replaced the three one-by-one manual skill add rows with one
  `Skills seen in this job` textarea below the JD box.
- Added an `Extract skills` CTA that sends a temporary extraction text made from
  the clean JD plus the pasted skill evidence to the existing
  `/jobs/import/preview` flow.
- Kept the saved job payload clean: `job_description` remains the JD text only,
  while chips are saved from the merged Primary/Secondary/Emerging arrays.
- Added `skill-review.js` with deterministic merge/de-dupe behavior across all
  skill categories; stronger categories win (`primary > secondary > emerging`).
- Split popup capture fixtures and chip rendering out of `popup.js` so touched
  extension files stay under the 300-line guardrail.
- Regenerated tracked `Chrome_extension/myro-extension.zip`.

Validation:

- Red test first for JD + pasted-skill extraction text and category-wide skill
  merge/de-dupe.
- `cd Chrome_extension && npm test`: `10 passed`
- `cd Chrome_extension && npm run build`: clean
- `cd Chrome_extension && npm run package`: clean
- Served built popup via localhost and smoke-tested preview-mode flow in
  headless Chrome: review panel visible, `Extract skills` present,
  `Skills seen in this job` present, pasted `Stakeholder Management` merged.
  Only console noise was static-server `favicon.ico` 404.
- Full backend suite: `902 passed`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-29 - Market location freshness + Post MBA search)

Fixed the stale `/market` location feed and made Post MBA searches find real
roles from job descriptions without running an LLM per row.

- Root cause 1: the frontend feed query key did not include saved target
  locations, so the persisted TanStack cache could show old Bengaluru pages
  while the UI chip already said Gurugram.
- Root cause 2: backend `user_target_locations()` cached profile geo prefs for
  five minutes, and profile writes did not clear that cache.
- Root cause 3: `/jobs/feed?q=...` searched only title/company. Requirements
  like `post MBA` live in `job_description`, so the feed returned an empty state
  for the exact user query.
- Added `job-feed-query-key.ts` with a stable target-location signature and
  threaded `targetLocations` into `useJobFeed`.
- Added backend target-location cache invalidation after profile location writes.
- Extended deterministic feed search to include `job_description` and strip
  generic intent words like `roles`, so `Post MBA roles` can match descriptions
  containing `post MBA`.
- Added manual-apply migration
  `database/migrations/20260629_job_description_search_index.sql` for a
  trigram GIN index on `jobs.job_description`.
- Preserved and validated related query-understanding work in the tree:
  deterministic fallback for `parse_job_query()` and intent-aware
  `global_job_search()` for `Post MBA roles in Gurugram`.

Validation:

- Red tests first for description-backed feed search, profile-location cache
  invalidation, job-description index migration, and frontend feed query keys.
- Focused backend: `77 passed`
- Focused frontend market tests: `8 passed`
- Full backend suite: `894 passed`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean

Live data check:

- Supabase has Gurugram jobs (`966`) and Gurgaon alias rows (`46`).
- Supabase has real `post MBA` description matches (`9`), including consulting
  and strategy postings.

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-28 - CV apply command hierarchy)

Made the CV Playground application handoff stateful so users always see the
next step while tailoring a saved job.

- Added a tested apply-command state model:
  `Unsaved draft -> Save & preview`,
  `Final preview ready -> Preview & download`,
  `Careers page opened -> Mark applied`,
  `Application tracked -> View applications`.
- Added `ApplyCommandBar` and wired it into the CV Playground header and sticky
  editor dock.
- Removed the old scattered Save/Preview primary from the page header and the
  old bottom-only save bar.
- `Save & preview` now saves the tailored CV version and immediately opens the
  existing export/preview route.
- Clean saved CVs expose `Preview & download` plus `Open {company} careers`;
  extension/source URLs are used when present, with careers-search fallback.
- Added a `Mark applied` action that updates the application status and
  refreshes the tracker query.
- Browser-verified the command bar through a temporary visual route at desktop
  and 375px mobile; removed the temporary route before handoff.

Validation:

- Red test first: `frontend/tests/cv-apply-command-model.test.ts` failed because
  the model did not exist.
- `cd frontend && npx tsx --test tests/cv-apply-command-model.test.ts
  tests/pr5-display-fixes.test.tsx`: 6 passed
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-28 - Market company signals toggle)

Replaced the misleading `/market` rail "Trending companies" label with an
explicit Company signals widget and added a compact role-volume vs scrape-date
toggle.

- Root cause: the widget was categorized as "Trending companies" but the data
  was only sorted by open-role count. It did not represent trend velocity or
  freshness.
- Added `sort_by=roles|last_seen` to `GET /jobs/companies-at`; default remains
  `roles`, while `last_seen` sorts by each company's newest scraper observation
  and then role count.
- Threaded the sort through `frontend/lib/api.ts` and `useMarketIntel()`.
- Added `company-signals-model.ts` so heading, row metadata, and backend sort
  mapping are tested as a stable display contract.
- Updated the rail UI to show `Company signals` with `Roles` / `Scraped`
  segmented controls. Roles mode shows role count; Scraped mode shows
  `Jun 4 · 181 roles` style metadata.

Validation:

- Red test first:
  `test_list_top_companies_at_repo_can_sort_by_last_seen` failed because
  `sort_by` did not exist.
- Red test first: `frontend/tests/company-signals-model.test.ts` failed because
  the display model did not exist.
- Focused backend jobs-list tests: `22 passed`
- Frontend company-signal model test: `3 passed`
- Full backend suite: `883 passed`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean

Not touched: unrelated dirty `frontend/app/(authed)/cv/cv-builder.css`,
`frontend/components/cv/builder/gap-session.tsx`, and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-28 - Market location alias demand movers)

Fixed the missing `/market` Skill-demand movers rail for users whose saved
target location uses an alias such as `Bangalore`.

- Root cause: `useMarketIntel()` sent the first saved target location directly
  to `GET /jobs/analytics?location_city=...`; analytics compared that raw value
  against canonical job rows. `Bangalore` returned `top_skills=[]`, while the
  sibling `companies-at` path already normalized it to `Bengaluru`, so Trending
  Companies still rendered.
- Added shared city/country match-value canonicalization inside
  `_matches_location_filters()`, preserving raw fallback for unknown locations.
- Extended the location normalizer so country-only `US` maps to
  `United States` and no longer falls through as a fake city named `Us`.
- Added regressions for `Bangalore -> Bengaluru` analytics movers and `US`
  country-code normalization.

Validation:

- Red test first:
  `test_compile_market_analytics_canonicalizes_location_filter_aliases` failed
  with `total_jobs == 0`.
- Red test first:
  `test_normalize_location_maps_us_country_code` failed because `US` became
  city `Us`.
- Focused backend tests: `35 passed` for location normalizer, location prefs,
  and jobs list router; `41 passed` for job feed router.
- Full backend suite: `871 passed`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean

Not touched: unrelated dirty `frontend/app/(authed)/cv/cv-builder.css`,
`frontend/components/cv/builder/gap-session.tsx`, and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-27 - Auth copy and UI brevity sweep)

Removed overloaded auth and prerequisite helper copy to match the
design-over-words rule.

- Removed the sign-in modal subtitle:
  `Pick up where you left off — your CV versions, scores, and saved jobs are
  right where you left them.`
- Removed the redundant sign-in modal footer line `Right where you left it.`
- Made the sign-in modal form-first by hiding the signup concept explainer panel
  in login mode and switching the modal to a single-column width.
- Removed the standalone `/login` subtitle and sample readout aside.
- Tightened signup auth copy to `Score. Tailor. Apply.` and shortened the
  signup modal concept cards.
- Shortened CV prerequisite/helper copy on CV upload, Skills CV gate, and Market
  CV gate.
- Added `frontend/tests/auth-copy.test.ts` contracts to prevent these long
  explanatory strings from coming back.

Commits:

- `5f0531d fix: remove login subtitle copy`
- `00cea95 fix: trim explanatory ui copy`

Validation:

- Red test first: `frontend/tests/auth-copy.test.ts` failed on the old login
  subtitle, then failed again during the sweep on the old page/signup/CV helper
  strings.
- `cd frontend && npx tsx --test tests/auth-copy.test.ts`: 4 passed
- `cd frontend && npm run lint`: clean
- `cd frontend && npx tsc --noEmit`: clean
- `git diff --check`: clean
- Backend suite: `866 passed, 3 failed` in `backend/tests/test_payments_router.py`
  due to unrelated dirty payment/job-switch response drift
  (`job_switch_plan_active` extra key).

Not touched: unrelated dirty backend payment/job-switch files, public Intel/job
search WIP, untracked job-search-console files, and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-27 - Shared public job search console)

Unified the landing job-search entry and public `/intel` search console.

- Added a shared `JobSearchConsole` module with one model for example prompts,
  query normalization, and `/intel?search=...` href generation.
- Changed the landing "tell us the job you want" form to route into public
  `/intel` with the query preserved instead of running a separate one-off
  landing search/results implementation.
- Changed `/intel` to hydrate its live search from the shared `search` URL
  parameter and to reuse the same Image #1-style search console structure.
- Deleted the old Intel-only command bar module and dead command-bar CSS.
- Kept the Intel results feed, tabs, filters, and job-fit drawer behavior
  intact.
- Browser-verified desktop and 375px mobile renderings, plus landing example
  click-through into `/intel?search=...`.

Validation:

- Red test first: `frontend/tests/job-search-console-model.test.ts` failed
  because the shared model did not exist.
- Focused frontend tests: `9 passed`
- `cd frontend && npm exec tsc -- --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `cd frontend && npm run build`: passed, 61 static pages generated
- `git diff --check`: clean
- Backend suite: `866 passed, 3 failed` in `backend/tests/test_payments_router.py`
  due to unrelated dirty payment/job-switch response drift
  (`job_switch_plan_active` extra key).

Not touched: unrelated dirty backend payment/job-switch files and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-27 - Public intel job-age cleanup)

Removed the false `0m ago` freshness label from public Intel job cards.

- Root cause: open-role rows represented missing/unresolved timestamps as
  `ageMin = 0`, and `fmtAgeMin(0)` rendered `0m ago`.
- Changed `fmtAgeMin()` to return `null` for unknown, zero, or non-positive
  ages.
- Changed `ResultJob.ageMin` to `number | null` and made `minutesSince()`
  return `null` until a real positive age exists.
- Changed `JobRow` to render the age separator + freshness span only when
  `fmtAgeMin()` returns a real label.
- Added `frontend/tests/intel-job-age.test.ts` to lock the behavior.

Validation:

- Red test first: `frontend/tests/intel-job-age.test.ts` failed because
  `fmtAgeMin(0)` returned `0m ago` and `fmtAgeMin(null)` returned `nullm ago`.
- Focused frontend tests: `10 passed`
- `cd frontend && npm run lint`: clean
- `cd frontend && npx tsc --noEmit`: clean
- `git diff --check`: clean
- Earlier `tsc` was briefly blocked by untracked job-search-console WIP, but the
  missing untracked model file appeared before closeout and the full TypeScript
  check now passes.

Not touched: unrelated dirty backend payment/job-switch files, untracked
`frontend/tests/job-search-console-model.test.ts`, and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-27 - Public intel runner company grounding)

Grounded the public `/intel` LLM runner console in the real tracked jobs corpus.

- Removed fake cosmetic company/URL seeds from the public Intel console.
- Added `frontend/components/public/intel/intel-console-model.ts` so console
  rows are generated from `analytics.by_company` and preserve exact scraped
  `company_name` values.
- Wired `IntelPane` to pass live `/jobs/analytics.by_company` into `IntelHero`.
- Replaced the hardcoded `gpt-oss-120b` suffix with honest runner model chips:
  `Local LM Studio` and `google/gemma-3-4b`, matching the June scrape notes.
- Replaced the misleading `Last commit` footer KPI with `Latest batch`.
- Added frontend contract coverage proving fake `LOG_SEEDS` cannot return and
  the fallback row stays neutral (`tracked company feed`, `syncing`) instead of
  inventing a company.
- Wrote and committed the design/implementation handoff:
  `docs/superpowers/specs/2026-06-27-public-intel-runner-tracked-companies-design.md`
  and
  `docs/superpowers/plans/2026-06-27-public-intel-runner-tracked-companies.md`.

Validation:

- Red test first: `frontend/tests/intel-console-model.test.ts` failed on missing
  helper, then passed after implementation.
- Focused frontend tests: `7 passed`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npm run lint`: clean
- `git diff --check`: clean
- Local backend health and analytics: `/health` OK; `/jobs/analytics` returned
  `45,933` jobs, `265` companies, latest batch `20260627`.
- Full backend suite: `866 passed`, `3 failed` in pre-existing dirty payment
  router expectations because local uncommitted payment work adds
  `job_switch_plan_active` to responses. This Intel change did not touch those
  backend files.

Browser QA:

- In-app browser loaded `/intel` and verified the desktop console no longer
  contains fake `wiz.io`, `gpt-oss-120b`, or `Last commit` text.
- True logged-out hydrated browser QA was partially blocked: the in-app browser
  had a stale local `mirror_token` that redirected `/intel` to `/login`, its
  read-only page scope could not clear localStorage, a `javascript:` cleanup URL
  was correctly blocked by browser policy, and the Playwright CLI had no
  installed browser binary. No screenshot artifact was produced.

Not touched: unrelated dirty backend payment/job-switch files and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-27 - Google indexing audit handoff)

Audited why Myro's public growth pages are not broadly indexed and prepared a
Claude-ready SEO fix handoff.

- Logged into Google Search Console and checked Page Indexing + Sitemaps.
- Confirmed Search Console currently knows only 10 URLs: 4 indexed and 6 not
  indexed as of 2026-06-12.
- Confirmed no sitemap is submitted in Search Console, even though live
  `robots.txt` advertises `https://www.himyro.com/sitemap.xml`.
- Confirmed live newsletter pages are crawlable/indexable with server-rendered
  article content, canonical URLs, and JSON-LD.
- Confirmed live company detail pages are not SEO-ready: sitemap includes 264
  `/companies/{name}` URLs, `robots.txt` blocks `/companies/`, and detail pages
  render a client loading shell with default homepage metadata.
- Captured the safe crawler-direction policy: use sitemap, internal links,
  canonical URLs, robots rules, and SSR/ISR content; do not build Googlebot-only
  redirects or bot-specific content.
- Wrote the handoff report:
  `docs/seo/2026-06-27-google-indexing-handoff-for-claude.md`.

Validation:

- Report line count: 283 lines
- `git diff --check`: clean

Not touched: unrelated backend payment/job-switch files and untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-25 - Public job-fit preview implementation)

Implemented the approved public job-fit preview journey on `Develop`.

- Added stateless `POST /public/jobs/{job_id}/fit-preview` so a logged-out
  visitor can upload a CV and see role-specific fit without creating an account.
- Reused anonymous CV parsing, validation, Turnstile/rate-limit behavior, and
  existing save-on-signup replay data instead of inventing a second upload flow.
- Wired `/intel` rows into a preview-first fit drawer for logged-out visitors,
  logged-in users with a CV, and logged-in users who still need to upload.
- Added API/client intent helpers so "Save + tailor CV" preserves the exact
  `jobId` through signup/upload and lands on `/cv?jobId=...`.
- Kept authenticated fit grounded in existing `fit-batch`, save-job, skill-gap,
  and CV tailoring surfaces.
- Browser-sanity checked `/intel` locally with frontend + backend dev servers:
  public rows opened the role-specific fit drawer with CV upload and tailor CTA.

Validation:

- Backend full suite: `853 passed`
- Focused backend public/fit tests: `18 passed`
- Frontend TypeScript: clean
- Frontend lint: clean
- Frontend public-intel/job-fit intent tests: `6 passed`
- `git diff --check`: clean

Not touched: unrelated untracked `docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-25 - Public job-fit preview design)

Product/design-only Codex session on `Develop`.

- Audited the current public `/intel` fit gate and downstream authenticated
  surfaces.
- Confirmed current logged-out row fit click opens auth without preserving
  `job_id`, while the bottom CTA routes generically to `/cv?upload=1`.
- Confirmed logged-in fit already uses `POST /jobs/fit-batch`, and authenticated
  save, skill-gap, Forge, and `/cv?jobId=...` tailoring surfaces already exist.
- Confirmed anonymous CV scoring and save-on-signup replay already exist, but a
  true logged-out one-job fit preview still needs a thin stateless bridge because
  `/jobs/fit-batch` depends on stored authenticated `user_skills`.
- Agreed on the preview-first contract:
  `role -> CV evidence -> fit preview -> save role -> tailor CV`.
- Wrote the approved design spec:
  `docs/superpowers/specs/2026-06-25-public-job-fit-preview-design.md`.

Validation:

- Design self-review completed.
- `git diff --check`: clean.

Not touched: implementation code, backend/frontend tests, unrelated untracked
`docs/free-llm-api-resources`.

## OLDER SESSION SUMMARY (2026-06-25 - Backend score-delta closeout)

Backend-only Codex session in isolated branch `codex/backend-score-demand`.
Main workspace dirty CV/comment work was not touched.

- Verified live dev/prod backend contracts expose `/cv/upload/finalize`,
  score `score_delta/domain`, and job `missing_skills`.
- Verified Supabase migration/schema for `user_job_matches.missing_skills`.
- Fixed score recompute demand lookup so it uses bounded per-skill demand via
  `count_job_demand_for_skills` instead of scanning all `job_skills`.
- Refreshed production scores through canonical `scoring.recompute_score()`:
  `239/239` recomputed, `238` now have gap candidates with `score_delta/domain`;
  one score has no gap candidates. `0` refresh errors.
- Confirmed recent match rows already have `missing_skills` populated.
- Fixed the backend stream test override drift to use `get_interactive_provider`.

Validation:

- Backend full suite: `834 passed`
- Focused scoring suite: `82 passed`
- `git diff --check`: clean

Closed: T2-3 backend deploy/schema/recompute gate and T3-1 backend
missing-skills gate. Not touched: frontend/mobile PR-F; repro-gated T1-2/T1-4.

## OLDER SESSION SUMMARY (2026-06-20 - Trustworthy onboarding rollout)

Implemented and verified the approved first-value onboarding contract on
`Develop` while preserving the intervening CV, navigation, and newsletter work.

- Shipped the durable `Experience -> Target -> Result` journey with resumable
  state, description-based Profile Preview, and proof-first full results.
- Added the fact-grounded five-question baseline generator with visible
  progress, autosave, review, and correction paths.
- Enforced credible recommendation promotion and contextual result actions.
- Added exact-city to remote to country-wide browse expansion, persistent
  rejection, six-second bottom Undo, and Hidden jobs restore.
- Added progressive personalization through the three-action onboarding
  checklist and forced match refresh when onboarding context changes.
- Browser-verified desktop and 375px flows with a disposable account. QA found
  and fixed the preview-stage race and stale cached-state redirect; the account
  and owned rows were deleted after verification.

Validation:

- Backend: `734 passed`
- Frontend onboarding/session/market/credibility/mobile contracts: `22 passed`
- TypeScript: clean
- Frontend lint: clean
- Production build: passed, 56 static pages generated
- `git diff --check`: clean

## OLDER SESSION SUMMARY (2026-06-19 - Mobile CV Hub full rollout)

Rebuilt the mobile CV experience as a document-first workspace and rolled it
out directly without a feature flag.

- Split the mobile navigation into CV and Applications destinations.
- Replaced the cramped CV controls with a fit-width Main CV preview, direct
  Edit/Export actions, and job-grouped tailored-version history.
- Added a full-screen structured editor for contact, summary, experience,
  projects, skills, education, and certifications.
- Added explicit manual Edit and AI Rewrite actions for CV bullets, ordering,
  guarded deletion, immediate local preview, autosave, and session history.
- Kept CV contact data distinct from account identity while offering an
  explicit account-email fill action.
- Added visual export template selection, actionable ATS review, PDF/DOCX
  actions, and an opt-in Myro verification mark.
- Added immutable structured job-version edits plus non-destructive Main CV
  restore endpoints; existing JSONB storage required no schema migration.
- Browser-verified the Hub, editor, preview, export, ATS score, and destructive
  confirmation flows at mobile widths from 320px through 430px.

Validation:

- Backend: `703 passed`
- Mobile CV contracts: `6 passed`
- TypeScript: clean
- Frontend lint: clean
- Production build: passed, 55 static pages generated
- `git diff --check`: clean

## OLDER SESSION SUMMARY (2026-06-19 - Trustworthy first-value onboarding design)

Completed the production QA, design grill, and approved contract for the P1
onboarding and plain-language ask.

- Ran a disposable-account production onboarding session and removed the test
  user plus owned rows afterward.
- Confirmed transient polling could report failure after the durable CV job had
  completed, the role step stored skill clusters, and result actions were below
  the fold or misrouted.
- Confirmed Home could promote a stored `Skip`, `is_recommended=false`,
  `1.2/5` job as `BEST MATCH`; the new contract forbids first-row promotion.
- Locked `Experience -> Target -> Result`, one primary role plus seniority and
  location, proof-before-score, resumable analysis, bounded browse expansion,
  persistent Not interested, bottom Undo, and evidence-backed correction.
- Locked Profile Preview for descriptions and a fact-grounded five-question
  baseline generator with `Question N of 5`, visual progress, autosave, review,
  and no invented facts.
- Locked contextual result actions, a three-action learn-by-doing checklist,
  and separate completion and activation definitions.
- Split the approved design into three linked files so each remains under the
  300-line project limit.

Artifacts:

- `docs/superpowers/specs/2026-06-19-trustworthy-first-value-onboarding-design.md`
- `docs/superpowers/specs/2026-06-19-trustworthy-first-value-onboarding-contracts.md`
- `docs/superpowers/specs/2026-06-19-trustworthy-first-value-onboarding-verification.md`

Validation:

- Backend: `694 passed`
- TypeScript: clean
- Frontend lint: clean
- Production build: passed, 55 static pages generated
- `git diff --check`: clean

Next: Shivam reviews the approved spec, then create the implementation plan in
small vertical slices before changing production code.

## OLDER SESSION SUMMARY (2026-06-15 - First intern beta response review)

Reviewed the first structured submission from the intern beta assignment.

- Queried only the beta-assignment payload from the existing `user_feedback`
  table; candidate account data, email, CV, and database identifiers were not
  copied into the repository.
- Assigned the sanitized research ID `B2-0001` and marked the response analysis
  eligible.
- Recorded the sanitized session context and ratings without reporting
  percentages or segment conclusions from a one-person sample.
- Scored the written hiring assignment `47/100`: specific observation `12/30`,
  user understanding `18/25`, prioritization `7/25`, and clarity `10/20`.
- Classified the result as insufficient assignment evidence, not an automatic
  rejection, and flagged it for the required second independent reviewer.
- Product finding: the user reached CV value in under five minutes but rated
  next-step clarity `1/5` and trust `2/5`.
- Mapped the main signal to the existing P1 onboarding/plain-language backlog
  rather than creating a duplicate engineering issue.
- Preserved the positive constraint: fast CV improvement drove `4/5` return and
  recommendation ratings.

Artifact:
`User_Feedbacks/reports/2026-06-15-B2-0001-review.md`

Validation:

- Live cohort count: `1 received`, `1 completed`, `0 partial`, `0 blocked`
- No raw response text or direct identifier was committed
- Sanitized review and session summary pass `git diff --check`

## OLDER SESSION SUMMARY (2026-06-14 - Final intern beta feedback submission)

Built the authenticated `/beta-feedback` assignment submission flow for the
prospective-intern beta drive.

- Added a readable three-step form for session context, structured assessment,
  ratings, full review, and explicit final-submission confirmation.
- Preserved drafts locally per authenticated user and clears them only after a
  successful final submission.
- Added authenticated status and submit endpoints with strict validation,
  duplicate protection, and a durable receipt.
- Stored every response in the existing `user_feedback` table under
  `payload.program = intern_beta_assignment_v1`; no new table was created.
- Reserved the program identifier so generic feedback clients cannot bypass
  the validated final-submission endpoint.
- Applied and verified live Supabase migration
  `intern_beta_feedback_submission` on project `gipvxuugajkugntwkeiz`.
- Updated the candidate message to use
  `https://www.himyro.com/beta-feedback`.

Validation:

- Full backend suite: `686 passed`
- Full frontend lint: clean
- TypeScript: clean
- Production build: passed; `/beta-feedback` generated successfully
- Focused frontend contracts: `8 passed`
- Browser-based component QA was blocked by the in-app browser's localhost URL
  policy. The previously approved 375px design mockup remains the visual
  reference; production-component browser QA is still required after deploy.

Commits: `6529af6` backend/API, `dff1b81` frontend form.

Launch gate: promote `Develop` to `main`, verify the authenticated production
flow at desktop and 375px, then replace `[DEADLINE]` and send the candidate
message. A `Develop` push alone does not update `himyro.com`.

## OLDER SESSION SUMMARY (2026-06-14 - Intern beta assignment and feedback system)

Prepared `User_Feedbacks/` for a prospective-intern beta cohort of up to 2,000
participants.

- Added a ready-to-send 30-minute product assignment that evaluates observation,
  user understanding, prioritization, and clarity.
- Tightened the candidate-facing message to 287 words while preserving the
  task, rubric, anti-bias boundary, privacy notice, and launch placeholders.
- Made the selection boundary explicit: CV quality, Myro Score, positive
  feedback, visual polish, and agreement with the team are not hiring signals.
- Added a form-ready intake schema with clean export columns, five experience
  ratings, device/network context, optional redacted evidence, and consent.
- Added a calibrated 100-point hiring rubric with double-scoring guidance and
  identity-hidden review where operationally possible.
- Added repository privacy rules and Git ignores so CVs, raw form exports,
  emails, office documents, and other candidate source data remain outside Git.
- Added a product-research playbook covering de-identification, eligibility,
  coding taxonomy, severity, evidence quality, segment analysis, prioritization,
  and a reusable cohort report.
- Commits: `2ea2a0b` candidate brief, `202c502` intake and scoring,
  `8a26f80` analysis playbook, `c29cfaf` shortened candidate brief.

Validation:

- `git show --check` passed for all three commits.
- Every new Markdown file is below the 300-line limit.
- Candidate-facing message: `287 words`.
- `https://www.himyro.com/`, `/privacy`, and `/terms` all returned HTTP 200.
- Raw CVs or candidate responses were not added to the repository.

Launch carry-over was completed by the session above.

## OLDER SESSION SUMMARY (2026-06-13 - Upskilling production hardening)

Hardened the live `/forge` upskilling path after production question banks were
loaded but the frontend still showed the empty-bank state.

- Root cause: `upskilling_service.py` queried nonexistent `skills.name`; the
  checked-in and live schema use `skills.display_name`.
- Updated ladder and gap-calibration taxonomy reads to use one shared
  `SKILL_DISPLAY_COLUMNS` contract.
- Separated CV inference from demonstrated progress: `user_skills` now marks
  `on_cv`, while `skill_assessed_level` alone drives cleared ladder levels.
- Scoped first-clear detection and the `reward_xp` RPC to each user. Referral
  signup credit intentionally remains globally single-pay.
- Applied and verified live Supabase migrations `referral_reward_credit` and
  `reward_xp_user_scope` on project `gipvxuugajkugntwkeiz`; both reward indexes
  and the RPC are present.
- Added an explicit retryable frontend error state, focused backend/frontend
  regressions, and an authenticated post-deploy production smoke workflow.

Validation:

- Focused backend tests: `18 passed`
- Ruff: clean
- Frontend upskilling contract + targeted lint: clean
- Frontend production build: passed
- Full backend suite: `656 passed, 1 skipped`; one pre-existing untouched
  failure remains in CV stylesheet parity (`test_cv_sheet_css_in_sync`).

Deployment carry-over: configure GitHub Actions secrets `MYRO_SMOKE_EMAIL` and
`MYRO_SMOKE_PASSWORD` for the dedicated smoke account.

## OLDER SESSION SUMMARY (2026-06-13 - Hosted Distribution Tracker parity)

Rebuilt `/admin/growth` as the backend-persisted version of the proven local
Distribution Tracker on `Develop`.

- Preserved the three original workspaces: Postings pipeline, Newsletter
  issues, and Seeding sweeps.
- Restored the dense inline publishing loop: open composer/source, copy the
  prepared insight, edit the working draft, paste the exact published copy,
  capture the live URL, lock the publication snapshot, and update impressions
  and clicks.
- Kept the immutable prepared baseline in message metadata, the latest human
  edit in `draft_copy`, and the exact published words in
  `growth_publications.final_copy_snapshot`.
- Added durable sweep storage, backend metric updates, complete snapshot
  import/export, and compatibility with the original tracker's localStorage
  override JSON.
- Imported all four legacy datasets deterministically in dry-run validation:
  8 assets, 12 campaigns, 22 messages, 2 publications, and 4 sweeps.
- Browser QA passed the complete draft-to-final loop on desktop and at 375px.
  The page has no body-level horizontal overflow; the dense table scrolls
  internally.
- Commits: `85baf01` backend parity, `5c6c2a0` complete legacy importer,
  `6ee7fbb` hosted tracker interface.

Validation:

- `.venv/bin/pytest backend/tests` -> `646 passed, 16 warnings`
- Focused frontend tracker tests -> `10 passed`
- Focused Next lint -> no warnings or errors
- `git diff --check` -> clean
- Full `tsc --noEmit` remains blocked only by unrelated concurrent edits in
  `frontend/components/public/intel-pane.tsx` missing five `ResultsProps`.

Deployment gate:

- Live Supabase migration `20260613_growth_tracker_parity.sql` was not applied.
  The Supabase MCP timed out during startup twice, and the Supabase CLI also
  hung before returning project access.
- Reauthenticate Supabase, apply the migration to `gipvxuugajkugntwkeiz`,
  deploy the `Develop` backend/frontend, then run the authenticated tracker
  importer. Do not import directly with SQL; the API preserves stable legacy
  IDs and publication snapshots.
- Existing unrelated Job Intelligence, dashboard, Intel, landing-page,
  institution, and docs changes were left untouched.

Canonical spec:
`docs/superpowers/specs/2026-06-13-hosted-distribution-tracker-parity-design.md`.

## OLDER SESSION SUMMARY (2026-06-13 - Job Intelligence backend)

Specified and implemented the scalable Job Intelligence backend on `Develop`.
Frontend work was deliberately left for Claude.

- Added a deep `JobIntelligence` module with three stable entry points: Feed
  State, structured Job Feedback, and privacy-safe batched Job Pulse.
- Added conditional `GET /jobs/feed-state` with ETag/304 behavior and a
  60-second process cache. Successful feed publication now comes from
  `job_feed_run_audits.created_at`, not scraper `jobs.last_seen`.
- Preserved `first_seen`, `last_seen_at`, `is_stale`, and `is_active` through
  dashboard match reads.
- Added append-only, idempotent personal-versus-quality feedback with RLS,
  explicit Supabase grants, a three-per-day quality cap, and no raw-report XP.
- Added backend-only `job_intelligence_snapshots`, one-job trigger refreshes,
  privacy suppression below five contributors, and deterministic listing
  confidence.
- Converted the old inactive-report route into a deploy-window compatibility
  adapter. A single user report can no longer deactivate a listing.
- Kept base job reads separate from batches of up to 100 pulses so web and
  future native clients can render cards before community context.
- Wrote the Claude frontend handoff at
  `docs/handoffs/2026-06-13-job-intelligence-frontend-handoff.md`.

Validation:

- `.venv/bin/pytest backend/tests` -> `644 passed, 16 warnings`
- PostgreSQL 17 migration syntax and application passed.
- Authenticated RLS insert, identity sequence access, service-role grant,
  snapshot insert/update/delete triggers, and cross-job refresh passed.
- All new implementation files are at or below 300 lines.

Deployment gate:

- Live Supabase migration `20260613_job_intelligence.sql` was not applied
  because the Supabase MCP token expired. Reauthenticate, apply it to
  `gipvxuugajkugntwkeiz`, run advisors, then deploy backend before frontend.
- Existing unrelated Claude, demand-RPC, dashboard, market, and docs-submodule
  workspace changes were left untouched.

Canonical spec:
`docs/superpowers/specs/2026-06-13-job-intelligence-and-feed-freshness-design.md`.

## OLDER SESSION SUMMARY (2026-06-13 - Live jobs visibility and last-seen audit)

Verified the completed June 4 Supabase load and traced scraper freshness metadata
through the production job surfaces. No production implementation code changed.

- Production Supabase contains 42,787 jobs: 34,959 active and 7,828 inactive.
  All 17,956 unique June 4 jobs are active.
- Associated data is present: 355,264 `job_skills`, 35,108 taxonomy skills,
  1,366 scrape diagnostics, and 6 run audits.
- `https://api.himyro.com/health` returns 200. Public production analytics
  returns 42,787 jobs, 263 companies, and `latest_batch = 20260604`, confirming
  the backend reads the loaded corpus.
- `/market` is the live browse surface. It queries active `jobs` directly and
  already transports `first_seen`, `last_seen_at`, `is_stale`, and `is_active`.
- `/home` is not a direct jobs-table feed. It reads durable personalized
  `user_job_matches`; loading new jobs does not recompute every user's matches.
  There are currently 224 match snapshots across 44 users, most recently
  computed on June 9, 2026. Users receive the new corpus through match refresh.
- The exact dashboard freshness drop is in
  `JobsRepository.get_user_match_stack()`: its nested `jobs(...)` selection
  omits `first_seen`, `last_seen`, and `is_active`. `JobMatchResponse`,
  `to_job_match()`, and the frontend `JobMatch` type also omit those fields, so
  dashboard cards cannot render scraper verification dates.
- The market card receives `last_seen_at` but displays `first_seen` as its age
  badge. `last_seen_at` is only shown when the posting crosses the 21-day stale
  threshold in the detail drawer. Fresh jobs therefore hide the useful
  "last verified by scraper" fact even on `/market`.
- The dashboard's corpus-change banner incorrectly uses `MAX(jobs.last_seen)`
  as the feed publication time. This June 4 scrape was uploaded on June 13,
  after the latest user matches were computed on June 9, but the comparison
  reads June 4 < June 9 and does not prompt a refresh. Scraper verification time
  and database publication/import completion time need separate markers.
- The scraper itself is not dropping lifecycle data. `csv_importer.py` derives
  `last_seen` from the output batch date and writes it to Supabase; June 4 rows
  correctly contain `last_seen = 20260604`.

Recommended implementation after approval:

- Extend the dashboard match query, backend schema/mapper, and frontend
  `JobMatch` contract with `first_seen`, `last_seen_at`, `is_stale`, and
  `is_active`.
- Add a compact shared "Last verified ..." formatter and render it on desktop
  and mobile dashboard cards, using `last_seen_at`, not `first_seen`.
- Reuse the same presentation on `/market`; keep `first_seen` only for
  "newly discovered" sorting/filtering semantics.
- Drive `feed_updated_at` from the successful import audit timestamp (or a
  dedicated publication timestamp), never from `last_seen`.
- Add backend contract tests plus frontend formatter/card coverage.
- Decide separately whether existing users should receive an automatic
  post-import match recompute or continue using the explicit XP-gated refresh.

## OLDER SESSION SUMMARY (2026-06-13 - June 4 Phase 3 upload complete)

Completed and verified the June 4 Phase 3 Supabase load from
`firecrawl_Supabase`.

- Uploaded all 206 June 4 files without deactivation. The 17,964 source entries
  resolve to 17,956 unique global `job_id` values, and every unique ID is
  present and active in Supabase with `batch_date = 20260604`.
- Verified all 128,387 expected current `job_skills` associations are present.
  Live totals are now 42,787 jobs and 355,264 `job_skills` rows.
- Canonical unique-row quality is 17,922 fully enriched of 17,955 jobs with a
  JD. The 33 residual rows overlap across 31 missing role domains, 5 missing
  skill sets, and 4 missing summaries.
- Location quality passed: 10 unknown rows out of 17,956 (0.056%). Consolidated
  audit run `19ca2369-d6a1-43ed-b106-b9dfbf669895` records the full resumed
  upload.
- The first upload response timed out after Cognition, but the Cohesity write
  had completed server-side. The idempotent resume from Cohesity through Zuora
  completed successfully and refreshed the production analytics snapshot.
- Fixed the importer crash on Visa's empty `jobs.json` by returning complete
  zero-result metadata. Scraper commit: `bfe62af78`.
- LM Studio is fully stopped: model unloaded, server off, and desktop/helper
  processes closed.
- Deactivation was intentionally not run. The dry run found 13,356 historical
  active rows missing from this batch and blocked 55 companies at the 75%
  safety threshold.

Validation:

- Focused importer/writer suite: `5 passed`
- `.venv/bin/pytest backend/tests -q`: `607 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit`: clean
- `cd frontend && npx next lint`: clean
- June 4 batch IDs missing from Supabase: `0`
- Expected current skill associations missing: `0`
- Production analytics refresh endpoint: HTTP 200

Deferred data-integrity work:

- Eight duplicate source IDs collapse to eight fewer global rows. Three IDs
  collide across distinct companies, so `job_id` needs a durable source/company
  namespace before the next full run.
- The importer upserts current skill associations but does not atomically
  replace prior sets. June 4 jobs retain 23,106 older associations beyond the
  128,387 current expected pairs. Do not bulk-delete these without a
  transactional synchronization design.
- Historical lifecycle cleanup still needs a separately approved policy; do
  not use `--allow-large-deactivation` as a shortcut.

Logs:

- `/tmp/myro_phase3_upload_20260613.log`
- `/tmp/myro_phase3_resume_upload_20260613.log`

## OLDER SESSION SUMMARY (2026-06-13 - June 4 enrichment completion audit)

Audited the completed `firecrawl_Supabase` June 4 Phase 2 run and the Phase 3
upload path. No production or scraper implementation code was changed.

- The date-scoped runner completed all 206 files / 17,964 local jobs.
- Of 17,962 jobs with JDs, 17,929 are fully enriched and 33 residual rows remain
  across 20 companies: 31 missing a controlled `role_domain`, 5 missing skills,
  and 4 missing summaries.
- Live Supabase currently has 28,047 jobs and 238,481 `job_skills` rows, but
  zero jobs with `batch_date = 20260604`.
- The exact-date dry run selected 206/274 files, loaded all 35,108 taxonomy
  skills, and passed the audit, `required_level`, `locations[]`, and job-card
  schema gates. It made no writes.
- Phase 3 is blocked by one importer bug: Visa's June 4 `jobs.json` is the only
  empty file, and `import_file()` returns no `company` key for empty lists;
  `main()` then raises `KeyError: 'company'` while logging the result.
- After a tested empty-file fix, rerun:
  `/opt/anaconda3/bin/python3.13 csv_importer.py --dry-run
  --deactivate-missing --run-date 20260604`.
- Review location quality, taxonomy drift, and simulated deactivation counts,
  then run the real date-scoped import. A clean real load automatically
  refreshes the Myro analytics snapshot.
- LM Studio remains idle with `google/gemma-3-4b` loaded; stop it after deciding
  whether to retry the 33 residual rows with a quality model.

## OLDER SESSION SUMMARY (2026-06-13 - Career Growth Command System Phase 1)

Implemented the approved human-first Growth Command System Phase 1 on
`Develop`, in six scoped commits.

- Repaired the newsletter feed to use canonical `https://www.himyro.com` URLs.
- Added bounded first/latest UTM capture across signup and auth callbacks.
  Referral attribution remains separate, and analytics persistence cannot
  break authentication.
- Added the generic FastAPI growth domain, server-side operator allowlist,
  approval/publish transitions, immutable publication records, and
  deterministic legacy import endpoint.
- Migrated the newsletter distribution compatibility layer to the generic
  growth schema without changing its public contract.
- Added `scripts/import-growth-tracker.ts`; current dry run resolves 8 assets,
  12 campaigns, 22 messages, and 2 publications from the standalone tracker.
- Shipped the private `/admin/growth` cockpit with priority cards, truth
  metrics, channel/status/format filters, draft/final review, approval,
  composer handoff, and publication capture.
- Applied live Supabase migration `growth_command_phase1`. All eight Phase 1
  tables have RLS enabled with no browser policies, and one owner operator is
  active. Content tables remain empty until the backend deploy and
  authenticated one-time import.
- Desktop and 375px browser QA found no page overflow. Mobile review close and
  reopen, filtering, and draft save were exercised. Screenshot capture timed
  out, but DOM/layout checks completed.

Validation:

- `.venv/bin/pytest backend/tests` -> `607 passed, 13 warnings`
- `cd frontend && npm run build` -> clean
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Newsletter issue/chart sync check -> 7 issues/charts in sync
- Growth parser, attribution, API, cockpit, and migration tests -> pass
- Full frontend test sweep -> 130 pass, 1 unrelated landing XP-copy failure
- Contract suite -> 2 pass, 3 pre-existing failures (legacy localStorage
  baseline, deleted auth-form reference, existing raw Forge query key)

Remaining:

- Deploy the `Develop` backend/frontend, then run
  `MYRO_GROWTH_ACCESS_TOKEN=... npm run growth:import-tracker` once.
- Phase 2 adds GA4/Search Console measurement and activation reporting. Phase 3
  adds Need Radar and editorial triage.
- Existing unrelated workspace changes were left untouched.

Canonical spec:
`docs/superpowers/specs/2026-06-13-myro-career-growth-command-system-design.md`.

## OLDER SESSION SUMMARY (2026-06-13 - Career Growth Command System design)

Designed and documented the approved human-first Myro Career Growth Command
System. No production code or database state was changed.

- Locked one private command center across need discovery, editorial planning,
  newsletters/guides/tools/data pages, review-gated distribution, publication
  records, search/campaign analytics, and product activation.
- Confirmed that the existing `growth-agent/distribution-tracker.html` is a
  useful cockpit prototype but not a durable source of truth because its data
  is hardcoded and browser-local.
- Chose a generic growth data model instead of deploying the currently
  newsletter-specific distribution tables. The existing backend becomes a
  compatibility path during migration.
- Locked the humanization contract: need first, visible evidence, preserved
  agency, channel context, and the smallest useful next action.
- Locked phased delivery. Phase 1 covers canonical-domain truth, UTM persistence,
  generic campaign storage, operator authorization, tracker import, and manual
  review/publishing before broader analytics and platform automation.
- Canonical spec:
  `docs/superpowers/specs/2026-06-13-myro-career-growth-command-system-design.md`.

Validation:

- Spec self-review and documentation checks completed.
- `.venv/bin/pytest backend/tests` -> `593 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Existing unrelated workspace changes remained untouched.

Remaining:

- Shivam should review the written spec before implementation planning.
- After approval, create a Phase 1 implementation plan; do not begin broad
  social API integrations first.

## OLDER SESSION SUMMARY (2026-06-12 - LM Studio Phase 2 enrichment resumed)

Resumed the `firecrawl_Supabase` June 4 Phase 2 enrichment from its local
checkpoint.

- LM Studio was already open; verified its API on port `1234` and a successful
  chat-completions smoke request.
- Confirmed `google/gemma-3-4b` is loaded with 4 parallel prediction slots.
- Relaunched the existing date-scoped runner in detached screen session
  `myro-enrich-20260612`, protected by `caffeinate`.
- The runner skipped completed local records, retried earlier residuals, crossed
  the prior `Notion` pause boundary, and began `Novartis` (`137/206`).
- Verified fresh persisted progress: 17,964 total jobs, 12,168 fully enriched,
  5,794 remaining. No LM Studio connection errors were logged.
- Active log:
  `firecrawl_Supabase/logs/enrich_resume_20260612_screen.log`.
- Supabase remains untouched; upload is still the separate Phase 3.
- No scraper implementation files were changed. Existing unrelated workspace
  changes remain untouched.

## OLDER SESSION SUMMARY (2026-06-12 - Referral v1 backend)

Implemented PR-REFERRAL-V1 backend on `Develop`.

- Audited live Supabase: `user_profiles.referred_by_user_id` exists as nullable
  UUID with `FOREIGN KEY (referred_by_user_id) REFERENCES auth.users(id)`.
- Signup, login, and post-signin now resolve referral input in body, `?ref=`,
  then `myro_ref` cookie order.
- Profile provisioning credits the attributed referrer +100 Myro Coins only
  after the referred user's welcome grant is active. Self-referrals and missing
  referrals pay zero; sequential replay pays zero.
- Credit uses `reward_xp` with
  `(action='referral_credit', ref_table='referred_signup', ref_id=<new_user_id>)`.
- Added manual-apply migration
  `database/migrations/20260612_referral_reward_credit.sql`. Live Supabase does
  not currently expose `reward_xp`; Shivam must apply this migration. It adds
  transaction-key locking and a referral-scoped unique index for exact-once
  concurrent payout. The migration was not run.
- Verification: backend `584 passed`; `npx tsc --noEmit` clean; Next lint clean.
- No frontend, CV, tracker, or `frontend/lib/api.ts` files were changed for this
  task. Unrelated in-progress workspace changes were left untouched.

## OLDER SESSION SUMMARY (2026-06-12 - CV Playground, tracker, and LinkedIn contract locked)

Completed the point-3 `grill-me` product interview and locked the end-to-end
CV/application workflow. No production code was changed.

- One active tailored CV belongs to one exact job and survives cross-device use.
- Deterministic matching runs before AI; Rewrite is one bullet and free;
  Restructure is whole-CV, job-specific, and costs 20 Myro Coins only when kept.
- Comparisons stay above the CV. Mobile keeps exact A4 preview, stacked controls,
  and one state-driven sticky action.
- Draft/autosave/conflict rules, 14-day revision retention, Library organization,
  archive/restore, and changed-job handling are locked.
- Every application attempt preserves the exact submitted CV. Users can correct
  the linked CV or upload an external submitted PDF for Myro Engine analysis
  without replacing Main CV unless they explicitly choose to do so.
- The existing extension is the honest LinkedIn bridge: deduplicate, save and
  match in place, open the exact CV Playground for editing, return to LinkedIn,
  and confirm `I submitted this application`. No private scraping or claimed
  two-way sync without an approved official integration.

Canonical memory:
`~/.claude/projects/-Users-incognito-True-Yodha/memory/project_cv_playground_linkedin_tracker.md`.

## OLDER SESSION SUMMARY (2026-06-11 - LM Studio Phase 2 enrichment paused)

Paused the `firecrawl_Supabase` June 4 Phase 2 enrichment to release RAM for
other work.

- Stopped detached screen session `myro-enrich-20260610` and its `caffeinate`
  process.
- The last fully persisted company boundary is `Notion` (`136/206`).
  `Novartis` was interrupted after 25 in-memory jobs and will be safely redone
  from its local `jobs.json` state on resume.
- Current local checkpoint: 17,964 total jobs, 12,164 fully enriched, 5,798
  remaining.
- Unloaded `google/gemma-3-4b`, stopped the LM Studio API on port `1234`, and
  quit the LM Studio desktop/helper processes.
- Resume with the existing date-scoped runner for `TARGET_DATE_DIR=2026_06_04`;
  it skips completed local records automatically.
- Supabase remains untouched; upload is still the separate Phase 3.

## OLDER SESSION SUMMARY (2026-06-10 - LM Studio Phase 2 enrichment resumed)

Restarted LM Studio and resumed the interrupted Phase 2 enrichment for the
`firecrawl_Supabase` June 4 scrape.

- Restarted the LM Studio desktop app and API server on port `1234`.
- Reloaded `google/gemma-3-4b` with 4 parallel prediction slots and verified a
  successful chat-completions request.
- Confirmed the date-scoped local batch contains 17,964 jobs: 9,254 fully
  enriched at restart and 8,708 remaining. This phase writes local
  `jobs.json`/`jobs.csv` files only; Supabase upload remains Phase 3.
- Relaunched the existing date-scoped resume runner in detached screen session
  `myro-enrich-20260610`, protected by `caffeinate`.
- Verified persisted progress to 9,257 fully enriched / 8,705 remaining with no
  LM Studio connection errors.
- Active log:
  `firecrawl_Supabase/logs/enrich_resume_20260610_1447_screen.log`.
- No scraper implementation files were changed; existing dirty state in both
  repositories remains untouched.

## OLDER SESSION SUMMARY (2026-06-10 - Upskilling and Myrology completion audit, Develop)

Audited Claude's June 9–10 work against git, Supabase, deployed API contracts, and the full local test suite.

- Upskilling Slices 1–6 and the bootstrap fix are committed, merged, and deployed. Supabase has the quiz schema and correction-column cleanup; prod/dev expose the Upskilling routes.
- Core Upskilling is closed, but the separate `firecrawl_Supabase` question publisher is not built, the live `skill_questions` table has 0 rows, and Surface B lacks direct tests. Those remain explicit follow-ups rather than being hidden under the shipped UI/API work.
- Myrology webhook reconciliation and booking lifecycle work are committed, merged, deployed, and migrated. Prod webhook/admin configuration gates respond as configured; Resend configuration was completed on both Railway backends.
- Provider-side Razorpay webhook registration is accepted from Shivam's completion confirmation; verify one real event on the next purchase.

Validation:

- `.venv/bin/pytest backend/tests` -> `575 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Live Supabase `skill_questions` count -> `0`
- Unrelated untracked `docs/free-llm-api-resources` remains untouched.

## OLDER SESSION SUMMARY (2026-06-10 - Home bootstrap CI collection fix, Develop)

Fixed the backend CI collection failure caused by a stale home-bootstrap test contract.

- Updated `backend/tests/test_home_bootstrap_router.py` to stop importing the removed `ForgeSessionDatesResponse`.
- Replaced the deleted `forge_session_dates` stub with the current `upskilling_service.list_activity_dates` service boundary.
- Updated the expected bootstrap payload from `forge_dates` to `practice_activity` and asserted its serialized response.
- Root cause: commit `d6713cf` intentionally migrated the production bootstrap API to practice activity, but the original bootstrap test from `5f51428` was not migrated with it.

Validation:

- `cd backend && ../.venv/bin/pytest tests/test_home_bootstrap_router.py -v` -> `3 passed`
- `cd backend && ../.venv/bin/pytest tests/ -v` -> `575 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean

Remaining:

- Unrelated untracked `docs/free-llm-api-resources` remains untouched.

## OLDER SESSION SUMMARY (2026-06-05 - Brand system supersession implementation, Develop)

Implemented the superseding Myro brand system across the core frontend surfaces.

- Default first paint is now light mode. `app/layout.tsx` uses Inter as the only core product font and defaults unknown/empty `myro-surface` to `light`; OS dark preference no longer overrides first paint.
- Rebuilt `app/design-tokens.css` around the new contract: light `#F9F9F9` / `#262626` / orange `#FF4C00`; dark `#050505` / `#101010` / white text / teal `#12BFA5`; standardized typography scale, desktop/phone gutters, nav heights, panel gaps, button radius, and shadcn token bridge.
- Standardized public nav, desktop app chrome, mobile app chrome, landing page, first-run hero, Mission Control, auth shell, route error surface, and public Intel page around the new spacing/type/button contracts.
- Removed decorative particle canvas backgrounds from shared app/auth/public error/intel shells and fixed `/intel` hydration warnings by making first-render timestamps deterministic before live ticking starts.
- Added `frontend/tests/brand-system.test.ts` to lock palettes, Inter/default-light, desktop/mobile rhythm tokens, button radius/CTA tokens, one-off font cleanup, public mobile nav height, and no shared particle shells.
- Wrote the implementation plan in `docs/superpowers/plans/2026-06-05-brand-system-supersession-implementation.md`.

Validation:

- `.venv/bin/pytest backend/tests` -> `557 passed, 13 warnings`
- `cd frontend && npx tsx --test tests/brand-system.test.ts tests/tokens-copy.test.ts tests/pr5-display-fixes.test.tsx tests/nav-first-run.test.ts` -> `15 passed`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Browser QA on `http://localhost:3000`: `/` desktop 1280px and mobile 375px defaulted to light mode, Inter, orange CTA, no horizontal overflow, no framework overlay, no console warnings, no canvas particles; `/intel` desktop rendered with orange CTA, true-black console island, no particles, and clean console after hydration fix. Mobile public nav measured 56px; desktop public nav measured 60px.

Remaining:

- Dark-mode branding is covered by tokens/regression tests; browser QA verified the default light path and public surfaces. Do a logged-in settings toggle smoke later if a persisted user session is available.
- Unrelated untracked `docs/free-llm-api-resources` remains untouched.

## OLDER SESSION SUMMARY (2026-06-05 - Brand system supersession spec, Develop)

Wrote and committed the superseding Myro brand-system design spec after aligning with Shivam on the branding direction.

- Locked the pilot scope: brand tokens, public landing/nav, app chrome, and first-run/home surfaces.
- Locked the new brand foundation: light mode defaults for first paint, Firecrawl-like light discipline, orange light-mode primary CTAs, true-black dark mode with white text and teal/green important states, Inter as the core font, and the existing aperture-M mark retained.
- Made spacing/type standardization the central acceptance gate: desktop web and phone web get separate rhythm contracts for margins, navigation spacing, font sizes, font weights, control sizes, panel padding, section gaps, and 375px mobile behavior.
- Documented this as a supersession of conflicting `docs/DESIGN_SYSTEM.md` and `docs/CTA_DESIGN_SPEC.md` guidance in `docs/superpowers/specs/2026-06-05-brand-system-supersession-design.md`.

Validation:

- Spec self-review completed: no TBD/TODO placeholders; clarified follow-up notes; scope stays on frontend branding and shell/home/public surfaces.
- No app code changed and no frontend/backend tests run in this spec-only step.

Remaining:

- User should review the written spec before implementation planning.
- Implementation should start from the spec, then produce a concrete plan and visual QA path before touching code.
- Unrelated untracked `docs/free-llm-api-resources` remains untouched.

## OLDER SESSION SUMMARY (2026-06-05 - Tokens pivot + quiet chrome, Develop)

Pivoted user-facing XP language to tokens and removed the visible timer/balance widgets from app chrome.

- Desktop `WebChrome` no longer renders the forge timer chip, claim popover, or top-bar balance pill. Mobile `MobileTopBar` no longer renders `ForgeXpPill`. `ForgeClockDriver` and the underlying wallet/session economy remain active in the background.
- Added `/tokens` as the token guide route and changed `/xp` to redirect to `/tokens`. Updated visible token copy across docs, terms, settings/billing, market follows, CV upload, Practice, diary, skills advice, job refresh, newsletter CTA, onboarding, and shell modals.
- Updated backend user-visible error/SSE messages from XP to tokens for wallet failures, CV upload/refund failures, skill advice, job analyse, and deepeners. Internal DB/API names like `xp_balance`, `XP_POLICY`, service names, logs, and migrations were intentionally left unchanged.
- Added `frontend/tests/tokens-copy.test.ts` to lock no standalone `XP` in rendered frontend source roots and to ensure desktop chrome does not expose the old timer/balance controls. Added CV upload error sanitization so legacy backend "XP" details display as tokens.

Validation:

- `.venv/bin/pytest backend/tests` -> `557 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Focused checks passed: `tokens-copy`, `cv-upload-state`, `job-refresh-notice`, `follow-gate`, plus backend `test_xp_service.py`, `test_users_api.py`, `test_cv_upload_api.py`, `test_deepen_router.py`.
- Browser smoke on `127.0.0.1:3000`: `/docs` and `/terms` rendered token copy with no standalone visible XP; `/tokens` compiled with title `How Tokens Work | Myro`. Dev server stopped after verification.

Remaining:

- Unrelated untracked `docs/free-llm-api-resources` remains untouched.
- Internal architecture/docs still use XP terminology for the existing DB/service layer. Do a deliberate schema/API rename later only if Shivam wants a deeper migration.

## OLDER SESSION SUMMARY (2026-06-03 - Codex assigned reliability pulls closed, Develop)

Closed the Claude-sliced Codex pull set on `Develop`. **Do not redo these slices.**

- `9e65611 feat(score)` — PR-4: upgraded the existing `/docs#scoring` section instead of creating a duplicate score page; score rings and upload result now link there; docs mirror the current backend scoring facades/formulas (`recompute_score`, cluster log coverage, skill-count domain weighting, breadth bonus, mean of evidenced domains), the 10 public domains, and a worked example without invented weights.
- `4b28856 fix(forge)` — PR-6: frontend-only forge timer wall-clock reconciliation. Persisted `startedAt`, `pausedAt`, `pausedMs`, `claimedMinutes`, `carriedMinutes`, and `lastTickAt`; `ForgeClockDriver` reconciles on mount, focus, pageshow, and visibility changes; backend `forge_sessions` untouched.
- `c92cc2d test(profile)` — PR-8: verified public profile privacy and OG. No production code change needed; regression test locks no email/full name/LinkedIn/CV text/skill names/skill levels/tracker rows on the public profile API. Prod profile OG returned `image/png`.
- `3daff43 fix(ui)` — PR-5 Codex slice: heatmap mobile title/short horizontal labels/sticky first column; CV playground score gauge label outside numeric center, `Untitled company` fallback, keyword-chip conjunction casing; feedback jargon cleanup. Empty states intentionally untouched for Claude.

Validation:

- `.venv/bin/pytest backend/tests` -> `543 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npx next lint` -> clean
- Focused frontend/backend tests passed: score methodology, forge clock, PR-5 display fixes, public profile + ninja name.
- Local dev smoke: `/docs`, `/market`, `/cv` compiled cleanly on `127.0.0.1:3000`; server stopped after verification.

Remaining:

- None for Codex assigned PR-4/PR-5/PR-6/PR-8.
- Unrelated untracked `docs/free-llm-api-resources` remains untouched.

## OLDER SESSION SUMMARY (2026-06-03 - First-login hero design audit fixes, Develop)

Claude ran a `/frontend-design` audit of the first-login `/home` first-run hero (27 blunders) and shipped two commits to Develop (not pushed). **Codex: the mechanical slice below is already done — do not redo.**

- `7a3fd3e fix(home)` — `components/home/first-run-hero.{tsx,css}`: error folds into step-1 as a real `failed` state in `--tm-danger` (was an orphaned `<p>` after the stepper while step-1 still rendered "active"); accent diet (eyebrow neutralized); voice/vocab fixes (dropped "FIRST MISSION", "13 domains" jargon, em-dash overload).
- `8dbee60 fix(nav)` — `components/nav/nav.css` + `components/shell/web-chrome.tsx`: "FIRST CV IN10 min" optical gap + XP balance `toLocaleString` + tabular-nums (`3,000 XP`).
- **Open → Shivam decision (Claude spawned a grill):** top-nav Live/Practice gating, feedback-FAB de-emphasis, greyed-state contrast (PR-K), light-vs-dark first-login theme.
- tsc 0, lint clean both commits. Note: the nested `frontend/.git` repo has an unrelated in-flight progressive-nav mess (staged-delete `app/home/page.tsx`); the root deploy repo is clean.

## LAST SESSION SUMMARY (2026-06-03 - LinkedIn-only social automation)

Paused X activity and narrowed the daily social automation to LinkedIn only.

- Shivam confirmed `@himyro` on X is suspended and under appeal, so X drafting, scheduling and posting are paused until he confirms the appeal is resolved.
- Updated heartbeat automation `daily-himyro-linkedin-post` to **Daily Himyro LinkedIn post**: one LinkedIn-native company-page package per day, no X drafts, no X publishing attempts.
- Kept the LinkedIn approval rule explicit: draft may be prepared automatically, but public LinkedIn posting/editing still needs Shivam's in-thread approval and an action-time confirmation before the final Post/Save click.
- Documented the X pause in `Myro Newsletter/growth-agent/newsletter-distribution-agent.md`.
- Marked the 2026-06-03 outbox X drafts as paused/do-not-use; the LinkedIn draft remains ready for review.

Validation:

- Confirmed automation update through Codex app automation store.

## OLDER SESSION SUMMARY (2026-06-02 - LinkedIn native-first social path)

Tightened the newsletter social workflow after the first LinkedIn publishing test.

- Confirmed the HiMyro Career Intelligence LinkedIn company page can publish through Perplexity Comet from `https://www.linkedin.com/company/118214305/admin/page-posts/published/`.
- Published the first newsletter-linked LinkedIn company post for `2026-05-ncr-20-company-watchlist`. The live post uses LinkedIn's link-preview flow and should be treated as the path test, not the ongoing LinkedIn content model.
- Updated heartbeat automation `daily-himyro-linkedin-post` so future LinkedIn drafts default to native-first posts: no outbound URL in the body, no raw UTM link, compact human copy, and image/stat-led creative. X drafts still use measurable CTA links with UTM parameters.
- Documented the LinkedIn native-first rule in `Myro Newsletter/growth-agent/newsletter-distribution-agent.md`.
- Added a no-link LinkedIn native draft to the 2026-06-02 outbox with the newsletter image and engagement question for the next post.

Validation:

- Confirmed automation TOML updated under `/Users/incognito/.codex/automations/daily-himyro-linkedin-post/automation.toml`.
- Verified the latest newsletter issue image at `frontend/public/newsletter/issue-007-og.png`.

## OLDER SESSION SUMMARY (2026-06-02 - Daily social push automation)

Set up the long-term daily social publishing workflow around the latest Myro Newsletter issue.

- Verified Perplexity Comet has usable social routes: X profile `https://x.com/himyro` and LinkedIn company admin `https://www.linkedin.com/company/118214305/admin/dashboard/`.
- Saved those durable routes in `Myro Newsletter/growth-agent/newsletter-distribution-agent.md` under **Freshest Social Paths**.
- Captured that `/company/himyro/admin/` is currently a dead LinkedIn slug and the numeric company ID path is the long-term working route for **HiMyro Career Intelligence**.
- Updated heartbeat automation `daily-himyro-linkedin-post` into **Daily Himyro social push** at 10:00 AM IST.
- New automation scope: each day create five distinct X thread drafts and one LinkedIn company-page post draft with the latest newsletter image, validate URLs/images, add UTM parameters, save to `growth-agent/outbox/`, and publish through Comet only when logged in and approved in-thread.

Validation:

- Confirmed automation TOML updated under `/Users/incognito/.codex/automations/daily-himyro-linkedin-post/automation.toml`.
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - Dashboard job-card autonomy)

Added durable user-controlled removal for Home dashboard job cards.

- Added `user_dismissed_job_cards` as a per-user dismissal ledger with RLS own-row select/insert/delete policies. Applied the migration to production Supabase project `gipvxuugajkugntwkeiz` and verified the table plus policies exist.
- Added `DELETE /jobs/matches/{job_id}` so removing a card hides it from the Home dashboard without deleting tracker/application state or historical `user_job_matches` rows.
- Updated the match stack read to filter dismissed cards, while refresh novelty treats dismissed cards as already known so explicit removals do not reappear on future refreshes.
- Extended `/jobs/matches` with `dismissed_job_ids` so the frontend can keep Myro, Liked, and All segments consistent.
- Added an icon-only remove action on dashboard cards. The frontend clears the local match cache, updates React Query immediately, and refetches the match feed.
- Added backend repository/router tests plus a dashboard feed-model regression test proving dismissed cards are hidden from all dashboard segments.

Validation:

- `.venv/bin/pytest backend/tests/test_jobs_repository.py backend/tests/test_job_match_router.py backend/tests/test_job_match_response.py backend/tests/test_job_refresh_dispatch.py -q` -> `9 passed, 6 warnings`
- `cd frontend && npx tsx --test tests/dashboard-feed-model.test.ts tests/job-refresh-notice.test.ts` -> `3 passed`
- `.venv/bin/pytest backend/tests -q` -> `490 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - Durable stacked job matches + refresh fallback)

Fixed the Home dashboard match-card disappearance and refresh timeout path.

- Root cause confirmed: `/jobs/matches` only read `user_job_matches` for the current `last_monday()` batch. Veteran users with older retained matches could see **Myro found 0** at a week boundary even though their historical match rows still existed.
- Production read-only check for `shivam.mit20@gmail.com` confirmed match data was present: 52 match rows across seven weeks, 33 unique matched jobs, while the previous current-week read only saw 11 rows after the latest refresh.
- Added a durable match stack read: `JobsRepository.get_user_match_stack()` reads all retained user match rows, sorts newest refreshes first, dedupes by `job_id`, hydrates location fields, and keeps old cards underneath fresh results.
- Updated `/jobs/matches` to return the stacked match feed and fixed `to_job_match()` so each card keeps its real historical `batch_week` instead of being stamped with the current week.
- Refresh novelty now excludes all prior matched job IDs, not only the current week, so fresh results are preferred; the existing pool-relaxation logic still prevents XP-gated refreshes from dead-ending when the pool is fully consumed.
- Added a job-refresh Redis liveness guard. If `REDIS_URL` is set but no worker is serving the legacy refresh queue, refresh runs inline instead of sitting queued until the frontend times out.
- Raised the SSE refresh stream cap from 45s to 15min to match the backend refresh job timeout and avoid false "taking too long" failures during slow but live ranking.
- Bumped the frontend local match-cache key and clears the legacy key after refresh, so users who cached a zero-match response do not stay stuck on it for seven days.

Validation:

- `.venv/bin/pytest backend/tests/test_jobs_repository.py backend/tests/test_job_match_response.py backend/tests/test_job_refresh_dispatch.py -q` -> `5 passed`
- `.venv/bin/pytest backend/tests/test_workflow_seams.py backend/tests/test_progress_stream_router.py backend/tests/test_job_matcher.py backend/tests/test_llm_ranker.py -q` -> `40 passed, 6 warnings`
- `.venv/bin/pytest backend/tests -q` -> `486 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `cd frontend && npx tsx --test tests/job-refresh-notice.test.ts` -> `2 passed`
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - Newsletter distribution agent MVP)

Built the review-first backend foundation for sharing Myro Newsletter issues with newspaper/student-publication/company contacts and social channels.

- Added internal-token protected `/newsletter/distribution/*` endpoints, gated by `NEWSLETTER_DISTRIBUTION_ADMIN_TOKEN` and `x-newsletter-agent-token`.
- Added `newsletter_outreach_contacts` import support with normalized emails, required provenance (`source_url` or `source_label`), outreach basis, contact type, and suppression status.
- Added `newsletter_distribution_campaigns`, `newsletter_distribution_messages`, and `newsletter_email_outreach_queue` via `20260601_newsletter_distribution_agent.sql`, all RLS-enabled with no public client policies.
- Added campaign generation from issue metadata with review-ready drafts for email, LinkedIn company-page, six-post X thread, Instagram caption placeholder, and WhatsApp share-message placeholder.
- Added explicit campaign approval before email queueing; approval marks drafts approved, queueing marks the campaign/message queued.
- Added `GET /newsletter/distribution/campaigns/{campaign_id}` so agents/admin surfaces can retrieve an existing campaign and its reviewable channel drafts after creation.
- Protected suppression state on duplicate contact imports so an active re-import cannot accidentally reactivate a suppressed/unsubscribed contact.
- Documented the operator workflow in `Myro Newsletter/growth-agent/newsletter-distribution-agent.md` and linked it from `growth-agent/automation-map.md`.
- No real email sending or social posting was wired in this slice; the system now prepares/approves/queues distribution safely for later Resend/LinkedIn/X/Meta adapters.

Validation:

- `.venv/bin/pytest backend/tests/test_newsletter_distribution_service.py backend/tests/test_newsletter_distribution_router.py backend/tests/test_newsletter_distribution_repository.py -q` -> `15 passed, 6 warnings`
- `.venv/bin/pytest backend/tests -q` -> `482 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `cd frontend && npm run newsletter:check` -> clean
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - CV upload stale idempotency hardening)

Followed up on the Railway/Redis CV upload stall after the worker-outage fix.

- Railway MCP/CLI was not available in this Codex environment, so diagnosis used Claude/Codex notes, git history, and live Supabase job/telemetry state.
- Production check showed no current `processing` CV upload jobs; the two newest stuck uploads were already swept to `failed/orphaned` and refunded.
- Recent telemetry still showed the browser polling old job `654f05c9-ae11-4aef-a577-23f6d86abddd`, pointing to a stale local resume/idempotency loop rather than an active Redis job.
- Hardened the upload idempotency contract: a POST that replays an already failed `cv_upload_jobs` row now returns terminal `status="failed"` with error/refund context instead of pretending it is still `processing`.
- Updated the frontend upload state machine to treat that initial failed replay as a terminal parse failure without another polling cycle, so stale local keys are cleared through the existing non-retryable failure path.
- Added regression tests for backend failed-idempotency replay and frontend no-poll terminal replay.

Validation:

- `cd frontend && npx tsx --test tests/cv-upload-state.test.ts` -> `7 passed`
- `.venv/bin/pytest backend/tests/test_cv_upload_api.py -q` -> `16 passed, 9 warnings`
- `.venv/bin/pytest backend/tests -q` -> `467 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - CV upload worker outage hardening)

Investigated the Railway CV upload stall where `/cv/upload/status/{job}` returned 200 repeatedly until the browser hit `poll_timeout`.

- Live Supabase check showed job `654f05c9-ae11-4aef-a577-23f6d86abddd` stayed `status=processing`, `current_phase=queued`, `finished_at=NULL`, `xp_charged=200` for 401s. Because `_run_cv_upload_job()` writes `reading` before the LLM call, the LLM was never reached.
- Root cause: Redis/RQ durable mode can enqueue `fast` jobs while no active Job Runner is consuming the lane. This is a Railway worker-service/config issue, not a slow LLM call.
- Added a worker-liveness guard in `background.enqueue()`: when Redis is configured but no active worker serves the lane, the job runs inline as an emergency fallback instead of silently sitting in `queued`.
- Added on-demand stale-job recovery in `get_cv_upload_status()`: polling a stale processing job triggers the same bounded orphan sweep used at startup, then re-reads the row.
- Normalized terminal status phases so swept failed rows return `current_phase="failed"` even if the DB row still says `queued`.
- Reordered the CV upload LLM chain to prefer direct Groq then Gemini before paid OpenRouter tiers. Free OpenRouter tiers remain excluded for CV uploads.
- Production re-check showed the stuck job was already swept to `failed/orphaned` with `xp_refunded=true`.
- Scale note: this code fallback protects users from a missing worker, but 10k-user reliability still requires a Railway Job Runner service running `python -m app.workers.jobs_compute_worker` with at least two replicas.

Validation:

- New red tests covered worker-missing fallback, stale status sweep, and CV upload provider order.
- `.venv/bin/pytest backend/tests/test_background_dispatch.py backend/tests/test_cv_upload_api.py backend/tests/test_cv_parser.py backend/tests/test_llm_budget.py -q` -> `64 passed, 9 warnings`
- `.venv/bin/pytest backend/tests -q` -> `466 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - Railway CV upload telemetry hotfix)

Fixed the Railway 500 on `POST /v1/telemetry/cv-upload-phase` that was masking CV upload diagnostics.

- Root cause: `_count_cv_upload_events()` used `select("id", count="exact", head=True)`, but Railway's installed Supabase/PostgREST client rejected the `head` keyword.
- Replaced the alert-count query with SDK-compatible `select("id", count="exact").limit(1)` so exact counts still work without fetching large telemetry result sets.
- Added a regression test with a Supabase fake that accepts `count` but rejects `head`, matching the production failure shape.
- Confirmed frontend telemetry remains fire-and-forget, so this 500 was not the direct parser abort, but it removed the signal needed to diagnose slow/stuck CV uploads.

Validation:

- `.venv/bin/pytest backend/tests/test_route_perf_telemetry.py::test_cv_upload_event_count_uses_supabase_compatible_count_query -q` -> red before fix, green after
- `.venv/bin/pytest backend/tests/test_route_perf_telemetry.py -q` -> `8 passed, 6 warnings`
- `.venv/bin/pytest backend/tests -q` -> `463 passed, 13 warnings`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `git diff --check` -> clean

## OLDER SESSION SUMMARY (2026-06-01 - CV workspace action clarity)

Fixed the `/cv` workspace so the page behaves like a job-action CV cockpit instead of a misleading upload/stat dashboard.

- Rewired **Open Master CV** to open an inline loaded Master CV preview instead of the upload picker.
- Kept **Replace upload** as the deliberate Main CV replacement path and removed the duplicate top-right **Update Master** CTA.
- Moved Tailored / Companies / Pipeline / Downloads into a compact non-clickable stat strip below the page subheading.
- Made Downloads honest as `tracking pending` instead of implying a real last-30-days metric exists.
- Relabeled job-card actions so existing CVs say **Open latest CV** and missing role CVs say **Create tailored CV**.
- Improved company-folder **Create CV** behavior to prefer a role that does not already have a tailored CV, falling back to opening an existing role CV when all roles are covered.
- Split the oversized CV library surface into focused files under 300 lines: `library-master.tsx`, `library-company-row.tsx`, `library-icons.tsx`, plus pure helpers in `lib/cv/workspace.ts`.
- Added `frontend/tests/cv-workspace.test.ts` covering stats semantics, job action labels, and new-CV target selection.

Validation:

- `cd frontend && npx tsx --test tests/cv-workspace.test.ts` -> `3 passed`
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `.venv/bin/pytest backend/tests -q` -> `462 passed, 13 warnings`
- `git diff --check` -> clean
- Browser opened `http://localhost:3022/cv`; local in-app browser redirected to sign-in because no authenticated local session was available, so authenticated visual QA still needs a signed-in browser session.

## OLDER SESSION SUMMARY (2026-05-31 - Integrator item: post-application intelligence + Myrology)

Used `grill-me` to lock the product philosophy for post-application journeys, Referral Intelligence, company reports, and Myrology before writing memory into the cockpit docs.

- Added **Post-Application Intelligence + Myrology** under `INTEGRATOR ITEMS` in `AGENTS.md`.
- Locked the tracker branch: 7-day no-response prompts route to **No Response Recovery**, while positive responses route to **Interview/Next Round** work.
- Locked Practice as the action router for Skill Practice, Referral Route, Interview Prep, No Response Recovery, and Company Intel.
- Locked Referral Intelligence as a 500 XP automated run with LinkedIn/API, user-assisted, and Myro-referrer repository tiers.
- Locked the Myrology boundary: separate opt-in premium subbrand, consultation/booking funnel only, not part of Myro Score or job ranking, with non-guarantee language.
- Captured the pricing follow-up: live Myrology code currently uses INR 499, while Shivam discussed INR 200-300 as the intro payment-loop test.

No app code changed in this session.

## OLDER SESSION SUMMARY (2026-05-31 - NCR newsletter series + index redesign)

Published the NCR target-company newsletter set and rebuilt the `/newsletter` index into a denser briefing-style page for desktop.

- Content commit:
  - `8d6d358 feat(newsletter): publish ncr target-company series`
- UI commit:
  - `2e0a3eb feat(newsletter): redesign index briefing layout`

What shipped:

- Three dated newsletter issues from the anonymized NCR/company-search dataset:
  - 25 May 2026 - `2026-05-ncr-job-hunt-245-roles`
  - 28 May 2026 - `2026-05-ncr-consulting-data-fit-map`
  - 31 May 2026 - `2026-05-ncr-20-company-watchlist`
- The source search stayed privacy-safe: no user name, CV, email, account id, or private intent was published.
- Deployable mirrors were added under `frontend/content/newsletter/issues/`; local source MDX also exists under the gitignored `Myro Newsletter/issues/`.
- Feed artifacts were regenerated: `frontend/public/newsletter/feed.json` and `frontend/public/newsletter/rss.xml`.
- OG images were added for issues 005-007 under `frontend/public/newsletter/`.
- `/newsletter` now uses a fuller desktop layout:
  - masthead with quick signup and latest-issue actions
  - stats strip
  - featured latest issue with OG image
  - compact archive list
  - sticky signup/topic rail
- `IssueCard` now supports `featured` rendering and uses CSS modules instead of inline hover mutation.
- Index-only CSS was split into `frontend/app/newsletter/newsletter-index.module.css`; shared `newsletter.css` remains small and issue-page specific.

Validation:

- `cd frontend && npm run newsletter:check` -> clean
- `cd frontend && npx tsc --noEmit` -> clean
- `cd frontend && npm run lint` -> clean
- `.venv/bin/pytest backend/tests -q` -> `461 passed, 13 warnings`
- `git diff --check` and `git diff --cached --check` -> clean
- `curl -I http://127.0.0.1:3021/newsletter` -> `200 OK`

Notes:

- Browser/sandbox visual verification was left for Shivam as requested.
- Pre-existing unrelated workspace changes were left untouched: `CLAUDE.md`, `docs/free-llm-api-resources/`, CV/Skills page edits, CV score-progress edits, and `frontend/components/skills/domain-accordion-row.tsx`.

## OLDER SESSION SUMMARY (2026-05-27 - Website Ops Agent v1 CLI)

Built the repo-native **Myro Website Ops Agent** v1 as a safe local CLI under `ops-agent/`, then ran it against the repo health surface.

- Design and plan:
  - `53ad008` — `docs/superpowers/specs/2026-05-26-myro-website-ops-agent-design.md`
  - `f408135` — `docs/superpowers/plans/2026-05-27-myro-website-ops-agent-implementation.md`
- Implementation commits:
  - `5692477 feat(ops): scaffold website ops agent`
  - `62c7d63 feat(ops): add core agent runtime`
  - `72eeb3e feat(ops): add repo health tools`
  - `ee47e84 feat(ops): add website ops cli`

What shipped:

- `ops-agent/` Python package with stdlib-only runtime and pytest suite.
- Commands:
  - `cd ops-agent && python -m myro_ops.cli health`
  - `cd ops-agent && python -m myro_ops.cli feedback`
  - `cd ops-agent && python -m myro_ops.cli cv-upload`
  - `cd ops-agent && python -m myro_ops.cli release`
  - `cd ops-agent && python -m myro_ops.cli brief`
  - `cd ops-agent && python -m myro_ops.cli ask "what broke?"`
- Local behavioral memory: `ops-agent/instructions.md`.
- Generated reports are ignored by git under `ops-agent/reports/`.
- Redaction layer covers emails, token-like secrets, JWTs, and UUIDs.
- Deterministic `ask` router maps known founder questions to concrete tools; unsupported questions return supported patterns instead of pretending to chat.

Agent health run:

- `cd ops-agent && python -m myro_ops.cli health` → status `Degraded`.
- Reason: repo required paths are present, but workspace has 8 unrelated dirty entries and live checks were skipped because `MYRO_API_BASE_URL` / `MYRO_WEB_BASE_URL` are not configured.
- Generated brief: `ops-agent/reports/daily/2026-05-27.md` (gitignored).

Validation:

- `cd ops-agent && python -m pytest -q` → `16 passed`
- `.venv/bin/pytest backend/tests -q` → `383 passed`
- `cd frontend && npx tsc --noEmit` clean
- `cd frontend && npm run lint` clean
- `git diff --check` clean

Unrelated workspace state still present and untouched: `docs/free-llm-api-resources/`, `frontend/app/home/page.tsx`, `frontend/components/mission-control/topbar.tsx`, `frontend/lib/api.ts`, `frontend/lib/domain-data.ts`, and new onboarding component files.

## OLDER SESSION SUMMARY (2026-05-26 - Job Refresh reliability + Jobs card parity)

Closed the refresh-match incident and aligned Jobs card UX with Mission Control card language in one production-hardening slice:

- **Root cause fixed (schema drift):**
  - Added `database/migrations/20260526_user_job_matches_weekly_uniqueness.sql` to reconcile `user_job_matches` uniqueness with the weekly cache contract.
  - Migration now drops any legacy UNIQUE constraints/indexes on `(user_id, job_id)` via catalog introspection (name-agnostic), preserves weekly uniqueness `(user_id, job_id, batch_week)`, dedupes drift rows safely, and reloads PostgREST schema cache.
  - Supabase hotfix applied: cast `att.attname` to `text` in catalog `array_agg(...)` comparisons to avoid `name[] = text[]` operator errors during migration execution.

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
