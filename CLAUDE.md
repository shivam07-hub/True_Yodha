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

8. **Process Transparency Layer** — Company review system. Full plan below.
   - **Open sub-task:** Spot-check existing `job_applications` rows where `status = 'Responded'` before running the legacy → new migration. Goal: confirm `Responded → screening` is the correct map (vs `rejected` for some rows). Sample 10–20 rows, inspect `response_at` / `notes`. Adjust mapping if signal points elsewhere.
9. ~~**Mobile — enterprise polish + PWA**~~ ✅ DONE 2026-05-19 — All v1 PWA items shipped (skeleton lib, manifest, layout fixes, viewport seam). Deepenings #1 (ViewportProvider + useViewport) and #3 (frontend/mobile/ module) shipped. #2 (ResponsiveStack) deferred until friction fires.
10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.
11. ~~**Forge + Diary Loop**~~ ✅ DONE 2026-05-19 — Generic claim-anytime Forge XP shipped across nav/modal surfaces. Visible skill names hidden; claim restarts Forge automatically. Backend resolves hidden Forge skills to canonical tracker rows. Skill Tracker exposes free AI upgrade prompts after forged level-ups, using CV evidence + recent diary notes with 0 XP spend.

   **Forge widget v2 (deferred, 2026-05-19 design pass):**
   - **Cycle counter** — show "cycle N" badge on widget; track sessions completed in a single login window.
   - **Long-press dismiss** — `×` requires 600ms press when mid-session w/ unclaimed XP; prevents accidental loss.
   - **Haptic equivalent** — scale-pop + soft glow burst on successful claim; navigator.vibrate(10) on mobile PWA.
   - **Streak multiplier** — N consecutive claimed cycles in a session = ×1.25/×1.5/×2 XP multiplier badge; resets on dismiss or 30min idle.
   - Pick up when v1 forge widget has been validated by real usage signals (claim rate, dismiss rate, return-to-forge rate).

12. **Shareability v1 — `/profile/{ninja_name}` public profile (NEXT SESSION).** Decisions SH1–SH7 locked. Full plan below.

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

## MOBILE ENTERPRISE POLISH + PWA — PLAN (Backlog #9, ✅ CLOSED 2026-05-19)

**v1 PWA shipped** — react-loading-skeleton, layout fixes (L1–L7), manifest + icons, loading-state audit. Detail in `docs/session-history/2026-05.md` (2026-05-18, 2026-05-19 entries).

### v2 scope — Native APK on Google Play (deferred, kicks off after 1000 PWA users per OQ note)

**Prerequisites:**
1. Shareability v1 (`/profile/{token}`) shipped — referral hook.
2. `lib/api.ts` + `lib/session.ts` extracted into `packages/api-client/` with injectable storage adapter (AsyncStorage for RN, localStorage for web).
3. All backend routes prefixed `/v1/` — versioning contract before native release.
4. `device_tokens` table + `POST /push/register` endpoint shipped — FCM/APNs delivery.

**Native scaffold (new repo OR `mobile-native/` sibling folder — NOT inside `frontend/`):**

```bash
# Expo SDK 51+ blank TypeScript template
npx create-expo-app@latest mobile-native --template blank-typescript
cd mobile-native

# Core deps
npx expo install \
  expo-router \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill \
  @tanstack/react-query \
  expo-secure-store \
  expo-notifications \
  expo-device \
  expo-constants \
  expo-splash-screen \
  expo-system-ui \
  expo-status-bar \
  react-native-safe-area-context \
  react-native-screens \
  react-native-gesture-handler \
  react-native-reanimated

# Build / submit
npm i -D eas-cli

# Shared workspace at repo root
# /Users/incognito/True_Yodha/
#   ├── frontend/         (Next.js — web + PWA)
#   ├── mobile-native/    (Expo RN — Android/iOS)
#   ├── packages/
#   │   └── api-client/   (shared lib/api.ts, lib/session.ts, types)
#   └── backend/          (FastAPI, unchanged)
```

**Decisions still open (do NOT lock until shareability ships):**
- Monorepo tool: `pnpm workspaces` vs `nx` vs `turborepo`. Lean `turborepo` — simplest, Vercel-aligned.
- Auth flow: deep-link OAuth callback vs in-app browser (`expo-auth-session`).
- Diary push notification cadence: 8pm local default, user-configurable.
- iOS first or Android first: Android first (Play Store, lower cost, broader Myro target demographic).

**Hard rule:** Do NOT add RN/Expo packages to `frontend/package.json`. Wrong package.json pollutes Next.js bundler + breaks Vercel. Native libs land in `mobile-native/package.json` only.

### Architecture audit (post-ef8dd21, via /improve-codebase-architecture)

**Shipped (durable wins, see history):** breakpoint constant, CONTEXT.md Viewport Mode section, `useViewport()` provider (deepening #1), `frontend/mobile/` module (deepening #3).

**Open:**
- ⏸ **Deepening #2 — `<ResponsiveStack>` primitive.** DEFERRED. Trigger: any new page adding 4+ `tm-<page>-*` class hooks → ship it. 3 collapse sites today (`tm-mission-header-grid`, `tm-home-cols`, `tm-login-shell`).
- **`packages/mobile-shared/` extraction.** Lift `frontend/mobile/` into workspace package consumed by both `frontend/` (web PWA) + future `mobile-native/` (Expo). Blocked on: Shareability v1, `packages/api-client/` extraction, turborepo decision. Do NOT scaffold until v2 prerequisites are real.

---

## SHAREABILITY v1 — PLAN (Backlog #12, locked 2026-05-19 via grill-me)

### Vision
Every Myro user is a viral seed. The Domain Map (12-domain radar from `/skills`) is the magnetic share artifact. A logged-out viewer who lands on `/profile/{ninja_name}` sees the ninja's radar alongside their own *empty* radar — the ghost is the conversion CTA. The college fellowship program treats every fellow's `/profile/` link as the rollout vector for their cohort. Forward-compat: v2 adds XP-for-referral on each completed onboarding.

### Decisions (SH1–SH7)
See **DECISIONS LOCKED** table above.

### DB — Migration `database/migrations/20260519_shareability_v1.sql`

```sql
BEGIN;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ninja_name TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_ninja_name ON user_profiles(ninja_name);

-- Backfill: every existing user gets a generated ninja_name via service fn.
-- Run in app code (loop with retry-on-conflict) before NOT NULL.

ALTER TABLE user_profiles
  ALTER COLUMN ninja_name SET NOT NULL;

-- Public read surface (no PII)
CREATE OR REPLACE VIEW public_profile_v AS
  SELECT
    up.ninja_name,
    ms.mirror_score,
    ms.domain_scores,
    ms.tier_label,
    (SELECT COUNT(*) FROM forge_sessions WHERE user_id = up.id) AS forge_sessions_count,
    (SELECT COUNT(*) FROM daily_logs    WHERE user_id = up.id) AS diary_count,
    (SELECT COUNT(*) FROM job_applications WHERE user_id = up.id) AS tracker_count
  FROM user_profiles up
  LEFT JOIN mirror_scores ms ON ms.user_id = up.id;

GRANT SELECT ON public_profile_v TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

### Backend — New + Modified

**New: `backend/app/services/ninja_name.py`**
- `generate() -> str` — picks `{adjective}-{noun}-{4charsuffix}` from curated wordlists. Suffix avoids collision; retry-on-conflict.
- `is_valid(name: str) -> bool` — regex `^[a-z0-9-]{3,32}$` + reserved-words blocklist (`admin`, `signup`, `login`, `api`, `profile`, `xp`, `home`, etc).
- `is_available(name: str, db) -> bool` — DB uniqueness check.

**New: `backend/app/routers/profile/public.py`**
- `GET /profile/{ninja_name}` — no auth. Returns `PublicProfile` (score, domain_scores, tier, counts). 404 if not found.
- `GET /profile/{ninja_name}/overlap` — auth required. Returns up to 3 jobs both viewer + owner have saved. Match% from `user_job_matches` if exists, else basic overlap.
- `POST /profile/ninja-name` — auth required. Update own `ninja_name`. Validates + uniqueness checks.

**Modified: `backend/app/routers/auth.py`** — `_upsert_user_profile()` generates `ninja_name` on first provision. Signup handler reads `myro_ref` cookie via FastAPI `Cookie()`, resolves ninja_name → user_id, writes `referred_by_user_id` (self-ref guard: skip if same id).

**Modified: `backend/app/schemas/users.py`** — add `ninja_name` + `referred_by_user_id` to `UserProfile`. New `PublicProfile` schema.

### Frontend — New + Modified

**New routes**
- `frontend/app/profile/[ninja]/page.tsx` — server-component fetch from `/profile/{ninja}`, client-component renders.
- `frontend/app/profile/[ninja]/opengraph-image.tsx` — Next.js dynamic OG; renders radar SVG → PNG. Edge-cached 24h.
- `frontend/app/profile/[ninja]/loading.tsx` — radar skeleton.

**New components**
- `components/profile/PublicProfilePage.tsx` — main client component, 2-col grid (ninja radar | ghost-or-overlay).
- `components/profile/GhostRadar.tsx` — outline SVG, `+` glyph, `unlock` label, wraps to `/signup?ref={ninja}`.
- `components/profile/RadarOverlay.tsx` — dual-color SVG: ninja's polygon + viewer's polygon.
- `components/profile/JobOverlapRows.tsx` — compact table, max 3 rows.
- `components/profile/ShareButton.tsx` — Web Share API call; clipboard fallback; `↗` icon only.
- `components/onboarding/NinjaNameStep.tsx` — onboarding step with auto-suggested name + input.

**Modified**
- `frontend/app/skills/page.tsx` — drops `<ShareButton />` top-right.
- `frontend/app/signup/page.tsx` — reads `?ref=`, writes `myro_ref` cookie (`Max-Age=2592000; SameSite=Lax`).
- `frontend/app/onboarding/page.tsx` — adds NinjaNameStep before final.
- `frontend/lib/api.ts` — adds `profile.public(ninja)`, `profile.overlap(ninja, token)`, `users.updateNinjaName(name, token)`.
- `frontend/components/skills/DomainRadar` — extract pure path-math helper so `GhostRadar` + OG image both consume.

### Design Spec (ghost radar — the conversion mechanic)

**Layout**
- Desktop: 2-col grid, gap 24px, both radars 280×280.
- Mobile: stacked, ninja top, ghost below, both 100% width capped at 320px.

**Ghost radar visual**
- 12 spokes, stroke `var(--tm-border-soft)`, opacity 0.18.
- No fill polygon. No dot vertices.
- Center: `+` glyph 28px, color `var(--tm-accent)`, opacity 0.55.
- Below center (in-SVG `<text>`): `unlock` 9px caps, letter-spacing 0.2em, opacity 0.45.
- Entire SVG wrapped in `<a>` → `/signup?ref={ninja_name}`.

**Motion (animation budget = 600ms total cold start)**
- Ninja radar polygon: stroke-dashoffset 0→full over 900ms `cubic-bezier(0.22,1,0.36,1)`.
- Ghost radar: opacity 0→0.18 over 600ms, delayed 400ms.
- Hover ghost: `+` glyph scale 1→1.08 over 200ms ease-out; stroke opacity → 0.3.
- `@media (prefers-reduced-motion: reduce)`: no scale, no dashoffset; instant render.
- All animated properties: `transform` and `opacity` only (compositor-friendly, no layout thrash).

**Accessibility**
- `<a aria-label="Unlock your domain map — sign up">`.
- `:focus-visible` → 2px solid `var(--tm-accent)` ring, offset 4px.
- `+` glyph contrast ≥ 4.5:1 on background.

**Performance**
- Single SVG per radar, no canvas.
- Path data inlined (no fetch).
- OG image: edge-cached 24h, computed from the same public payload the page reads.
- No `backdrop-filter`, no blur, no shadow on ghost.

### Tests

- `backend/tests/test_ninja_name_service.py` — generate format, validate rules, reserved-words block, uniqueness retry.
- `backend/tests/test_public_profile_router.py` — payload shape, 404, no PII leakage (assert email/full_name/linkedin_url absent from response).
- `backend/tests/test_referral_attribution.py` — cookie → column write, self-ref guard, idempotency, signup without ref still works.
- `backend/tests/test_job_overlap_router.py` — overlap math, max 3 rows, empty overlap = 200 with empty list.
- `frontend/tests/share-button.test.mjs` — `navigator.share` call shape, clipboard fallback path.

### Out of scope for v1 (logged for v2)

- XP-for-referral payout (DB column ready; trigger not built).
- Custom share modal with platform grid.
- Vanity name change cooldown / cost.
- Public profile SEO (`robots: noindex` initially — flip after v1 hardening).
- Per-event referral analytics (`referrals_log` table).
- Mentor/mentee surfacing.
- Public profile theming (dark/light mode toggle for shared page).

---

## PROCESS TRANSPARENCY LAYER — PLAN (2026-05-14)

### Vision
Myro becomes the verified source of truth for *candidate experience* — not "is this a good company to work at" (Glassdoor) but "is this company worth applying to." Reviews tied to verified `job_applications` rows. Company pages public + SEO-indexed once ≥1 review exists.

### Funnel-First Build Order
Build in engagement depth order — start where we already have data:

1. **Company follower base** — `followed_companies` already exists. Surface how many users follow each company. This is the top of the funnel and requires zero new data.
2. **Saved jobs with match + analysis** — users who have saved a job (`job_applications.status = 'pending'`) from a followed company. One step deeper — intent signal.
3. **Active applications** — users progressing through the tracker (Applied → Screening → Interviewing → Final Round).
4. **Completed applications** — terminal status (Ghosted / Rejected / Offer / Withdrew) → review prompt fires.
5. **Company page** — aggregates reviews. Public once ≥1 review exists.

### Tracker Status Redesign
Replace current flat list with stages + outcomes:

**Stages (active progress):**
- `Saved` — interested, not yet applied (was: Pending)
- `Applied` — submitted, awaiting response
- `Screening` — HR / phone screen stage (was: Responded)
- `Interviewing` — technical or panel rounds
- `Final Round` — late stage, decision imminent *(new)*

**Outcomes (terminal):**
- `Ghosted` — company went silent (was: No response)
- `Rejected` — formal rejection received
- `Offer` 🎉 — offer received
- `Withdrew` — user chose to exit (was: Abandoned)

### 7-Day Inactivity Prompt
- Trigger: application stuck in any Stage (not Outcome) for 7 days, per company per application
- Prompt text: *"Been 7 days since we last heard from [company]"*
- Options: **Ghosted me** (marks Ghosted → opens review flow) | **Update tracker** (opens status picker → if terminal, review flow follows)
- Any status touch resets the 7-day clock for that application

### Review Structure
- Star rating (1–5)
- Last stage — pre-filled from application data, user can correct
- Written note — optional free text
- One review per `job_applications` row (verified)

### Company Page (`/companies/[slug]`)
- Public + SEO-indexed only when ≥1 verified review exists
- Shows: avg star rating, review count, ghost rate, stage-breakdown of drop-offs, individual reviews
- Non-logged-in users can read; logged-in users can submit

### DB — New Table
```sql
application_reviews (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  job_application_id UUID REFERENCES job_applications(id),
  company_name TEXT NOT NULL,
  star_rating SMALLINT CHECK (star_rating BETWEEN 1 AND 5),
  last_stage TEXT NOT NULL,  -- one of the 5 stage values
  outcome TEXT NOT NULL,     -- one of the 4 outcome values
  written_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### v1 Scope Locked (2026-05-17 grill-me session)

**Direction:** Editorial Dossier — extends existing `var(--tm-*)` aesthetic. No new Shadcn primitives. Reuses existing `ReviewModal`.

**Decisions locked Q1–Q9:**
- Q1: Move stale banner + review trigger to `/tracker`. Keep Self-Focus row on `/home`. Mental model: `/home` = today's work; `/tracker` = where everything is.
- Q2: Tabs `Active | Verdicts` on `/tracker`. Verdicts = single chronological list with outcome chip + `Review pending →` chip on unreviewed rows.
- Q3: Mobile = stage-pill carousel filter (`Saved 4 · Applied 7 · …`) with URL state `?stage=`. Status change = bottom sheet picker (reuse `MobileProfileSheet` pattern). Add `/tracker` to sidebar + mobile bottom nav (5 slots).
- Q4: **No DnD library.** Click-to-change picker only — popover on desktop, sheet on mobile. Same idiom both viewports. Skip `@dnd-kit`.
- Q5: One-time SQL migration of legacy statuses (`pending→saved`, `Responded→screening`, `No response→ghosted`, `Abandoned→withdrew`) + fix the four writer call-sites still emitting `"pending"` (`job_importer.py:226, 247`; `cv_generator.py:146`; `plan.py:41, 43, 142, 157`). Optional defensive `CHECK` constraint.
- Q6: Offer = gold-leaf rule + serif stamp on card. **One-time** subtle sparkle (~1.2s, 8–12 gold/teal dots) on first-ever offer per user, anchored on the card. Track via new `user_profiles.first_offer_at TIMESTAMPTZ` column.
- Q7: Clock resets on **any status change** (forward, backward, to outcome). Dismiss (✕) **snoozes 7 days** by bumping a new `job_applications.last_stage_changed_at TIMESTAMPTZ` column. Stale query switches from `updated_at` to this new column. New endpoint: `POST /jobs/applications/{job_id}/dismiss-stale`.
- Q8: `+ Track` on `/jobs` lands in **Saved**. Rename label `+ Track → + Save`. Post-save toast: `Saved. View in Tracker →`.
- Q9: **Full manual add with JD parsing** — reuses existing `/jobs/import/preview` + `/jobs/import` endpoints. Two-step modal: details → confirm extracted skills. Adds `status` field to `JobImportRequest` (default `"saved"`, manual modal sends `"applied"`). Analyse cost is **10 XP** (`ANALYSE_XP_COST = 10` already in `analyse.py:14` — last session summary line "50 XP cost (was 10)" is stale).

**v2 deferred (Process Transparency Layer):**
- Inline edit of manual-add company/role/JD after save (v1 = delete + re-add)
- CSV / bulk manual import
- Skill chip autocomplete on `+ add` in Step 2 of manual modal (v1 = plain text)
- Offer-specific review modal copy ("Tell others how you got here") — v1 uses generic copy across all 4 outcomes
- Optional defensive `CHECK` constraint on `job_applications.status` (nice-to-have)
- Two-column dismiss/stage-change split (v1 = single `last_stage_changed_at` column bumped by both; v2 = separate `stale_dismissed_at` if a downstream consumer ever needs purity)
- Edit/delete own reviews independently of the application row
- Manual drag-to-reorder within a tracker column (v1 = deterministic sort by `last_stage_changed_at`)
- Soft-delete with restore window (only if data shows users regret deletes)
- Bulk delete / multi-select on tracker

---

## PARKED OPEN QUESTIONS (from graphify refresh 2026-05-18)

Park-and-solve list. Pick up when working in the related area. Source = `graphify-out/GRAPH_REPORT.md`.

### Cross-community bridge nodes (high betweenness — verify intentional coupling)

1. **`compute_and_persist_score()` — betweenness 0.083.** Bridges `CV Upload & Initial Match` → `Tracker & Application Endpoints` → `Score Engine (Mirror/Domain)`. Solve when: touching scoring pipeline or post-CV-upload flow. Question: is this the right single source of truth (OQ4) or has accidental coupling crept in via tracker side-effects?
2. **`ScoresRepository` — betweenness 0.057.** Bridges 5 communities (CV Upload, CV Compose Hub, Tracker, Job-Skills RPC, LLM Overlap). Solve when: refactoring repository layer or splitting scoring concerns.
3. **`fetch_all_rows()` — betweenness 0.033.** Bridges `CV Compose Hub` → `Tracker Endpoints` → `Job-Skills RPC` → `Lightcast Backfill`. Solve when: query-pattern review (likely a fetch-all hotpath worth specializing).

### INFERRED-edge audit (LLM-guessed connections — confirm or prune)

4. **`JobsRepository` — 30 INFERRED edges.** Sample: `Q7: snooze the 7-day stale prompt by bumping last_stage_changed_at = now()`, `Fire-and-forget: compute first 5 matches after CV upload`. Solve when: touching `repositories/jobs.py` or stale-clock logic. Audit during Backlog #8 (Process Transparency Layer).
5. **`ScoresRepository` — 47 INFERRED edges.** Largest INFERRED footprint. Solve when: scoring refactor.
6. **`CVRepository` — 18 INFERRED edges.** Sample: `CVTextRequest`, `EducationItem`. Solve when: working on CV Builder v2 surface.
7. **`generate_job_cv()` — 22 INFERRED edges.** Sample: `generate_application_cv()`, `_get_job()`. Solve when: deciding cleanup of legacy `generate-draft` route (already noted as cleanup pass candidate in 2026-05-17 session summary).

### Refresh hygiene

8. **Graphify doc/image refresh deferred.** AST-only update on 2026-05-18 skipped 306 docs + 38 images. DMMT screenshots, design references, and markdown notes still reflect May 13 snapshot. Solve when: budget allows full `--update`, OR when working on landing-page / DMMT-design surfaces, run scoped LLM pass on `frontend/Black_futuristist_frontend/project/uploads/` + repo-root markdown.

### Architecture (deferred deepenings)

10. **Extract `useCVPlayground(jobId)` hook for CV Builder state.** `app/cv/page.tsx` owns scattered `useState` + derivations for the playground state machine: `playgroundDirty`, `selectedVersionId`, `hiddenItems`, edit/polish targets, sync detection. Currently all complexity is local to one page, so the locality gain is moderate. Solve when: a second consumer needs to ask "does the user have unsaved CV changes?" (nav-away warning, mobile preview surface, share-token preview, etc). Today's recommendation: wait for the second consumer before deepening.

### UX systems audit

9. ~~**Loading-state audit across the entire frontend.**~~ ✅ DONE 2026-05-19 — Closed as the foundational loading system, not as the separate verbal-scaffolding copy pass. Shivam's concern was that empty states felt "disappointing and depressing" because users could not tell fetching from genuine emptiness. Decision: keep a 3-tier system. **Shell skeleton** = `AppShellSkeleton` + `react-loading-skeleton` for auth/session chrome. **Process loading** = `components/loading/process-loading.tsx` + `components/loading/loading-page.tsx` + `app/loading.tsx` for route-level and multi-step work; adapters now include `IntelLoadingState` and onboarding CV analysis. **Ambient loading** = `components/ui/particle-loading.tsx` for immersive full-region waits (`/skills`, `/companies/[slug]`). Inline loading remains for tiny surfaces (`Button loading`, small row/card skeletons). Shipped with `/market` heatmap readiness fix and splash-screen token cleanup. Remaining UX copy/emotional tone work belongs to the Category B verbal-scaffolding pass, not this parked audit.

---

## LAST SESSION SUMMARY (2026-05-19 · Forge loop + Backlog #9 + loading-state audit closed)

```
FORGE + DIARY LOOP — BACKLOG #11 SHIPPED:
  - Nav/sidebar Forge now shows generic XP ready, not the hidden skill.
    XP can be claimed after whole minutes accrue; claim auto-restarts
    the Forge timer.
  - Full Forge modal and floating timer use the same generic XP loop.
    Skill queue remains hidden and continues feeding backend progression.
  - forge_service resolves skill_name → canonical skill_id via taxonomy
    before updating user_skills, so Skill Tracker advances correctly.
  - /users/me/skills now includes forge_sessions_count +
    forged_level_up_available.
  - SkillCard shows "AI skill upgrade" for forged level-ups. The advice
    endpoint verifies a forged level-up, uses recent diary notes + CV
    evidence, and returns xp_spent=0.

VERIFY:
  - pytest backend/tests -q: 255 passed.
  - npx tsc --noEmit: clean.
  - npm run lint: 0 warnings, 0 errors.
  - npx tsx --test tests/forge-progress.test.ts: 3 passed.

LOADING-STATE AUDIT — PARKED Q #9 CLOSED:
  - Closed as foundational system. Remaining "empty states feel
    disappointing" copy/tone work moves with Category B verbal-scaffolding,
    not this audit.
  - Three-tier loading system locked:
    1. Shell skeleton: AppShellSkeleton + react-loading-skeleton for
       auth/session chrome.
    2. Process loading: components/loading/process-loading.tsx,
       components/loading/loading-page.tsx, app/loading.tsx. IntelLoadingState
       and onboarding CV analysis now use this module.
    3. Ambient loading: components/ui/particle-loading.tsx for immersive
       full-region waits (/skills, /companies/[slug]).
  - /market heatmap readiness fixed: no followed companies / no selected
    skills now count as resolved instead of leaving "Building heatmap" stuck.
  - SplashScreen now reads var(--tm-bg/text/text-faint) instead of hard-coded
    dark colors.

Backlog #9 fully closed. Deepenings #1 + #3 shipped, #2 deferred (only 3
collapse sites — no friction yet).

DEEPENING #1 — ViewportProvider + useViewport:
  - frontend/mobile/provider.tsx NEW: ViewportProvider wraps app in
    providers.tsx. Single matchMedia subscriber tracks 3 queries
    (mobile breakpoint, pointer:fine, prefers-reduced-motion) and
    publishes one ViewportState = { mode, pointer, reducedMotion,
    isDesktop } through React context.
  - Mobile-safe defaults during SSR + first paint (isDesktop:false).
  - 5 listeners → 1. Old useIsDesktop deleted entirely.

MIGRATION:
  - components/app-shell.tsx: const { isDesktop } = useViewport()
  - app/tracker/page.tsx: const { isDesktop } = useViewport()
  - components/tracker/ScoreSparkle.tsx: drops ad-hoc matchMedia,
    reads reducedMotion from useViewport().
  - lib/hooks/use-rotating-message.ts: same — drops its own listener +
    state, reads from useViewport.
  - components/loading/process-loading.tsx (useAllowLoopingMotion):
    same — drops matchMedia + setReduceMotion useEffect.

DEEPENING #3 — frontend/mobile/ module:
  - frontend/mobile/viewport.ts (was lib/viewport.ts — moved +
    added MEDIA_QUERY_REDUCED_MOTION, MEDIA_QUERY_POINTER_FINE,
    PointerKind type)
  - frontend/mobile/shell.tsx (was components/mobile-shell.tsx — git
    mv, no content change)
  - frontend/mobile/provider.tsx NEW
  - frontend/mobile/index.ts NEW: single import surface
    `import { ViewportProvider, useViewport, MobileTopBar, ... }
    from "@/mobile"`.
  - DELETED: lib/viewport.ts, lib/hooks/use-is-desktop.ts.
  - CSS + manifest stayed in place (Next.js convention — globals.css
    + public/manifest.webmanifest).

VERIFY:
  - tsc --noEmit: clean.
  - next lint: 0 warnings, 0 errors.

CLAUDE.md:
  - Backlog #9 marked DONE 2026-05-19.
  - Deepening backlog: #1 + #3 ✅; #2 deferred with friction trigger.
  - New open task logged: packages/mobile-shared/ extraction
    (prereq for v2 Expo native scaffold).

Open (next sessions):
  - Backlog #8: Process Transparency Layer
  - Cleanup pass: home/page.tsx jobs.generateJobCv, cv/variants.py
    legacy generate-draft routes
  - Shareability v1: /profile/{token}
  - packages/mobile-shared/ extraction (blocked on shareability +
    api-client/ extraction)
```

---

## EARLIER SESSION SUMMARIES

Archived to `docs/session-history/2026-05.md` (2026-05-18, 2026-05-17 ×2, 2026-05-16, 2026-05-15).
Read that file when prior-session context is required.
