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
| PV1 | **Privacy-first identity.** Myro collects minimum data — only email + password. Any email works (throwaway, alias, anything). No real name required. No forced identity. The share token IS the user's public identity, not their name/email. |
| IH1 | **Intel heatmap = followed companies only.** User builds their own heatmap by starring companies. Empty state on first visit. No global defaults in heatmap. |
| IH2 | **Follow cost: 10 XP. Floor: -30 XP. Cap: 10 companies.** XP burned on follow, never refunded on unfollow (XP1). Star disabled if cap hit OR next deduction would breach -30. |
| IH3 | **Per-company row queries.** Each heatmap row is an independent `useQuery` keyed on `(company, skills)`. Adding a company appends a row without re-fetching others. |
| IH4 | **Heatmap columns = user's CV skills always.** No global top-8 fallback. Skill Lens toggles which CV skills appear. If no CV uploaded → nudge to upload. |
| IH5 | **Row ordering = most recently starred first** (`created_at DESC` from `followed_companies`). |

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
9. **Mobile — auth skeleton polish** — `AppShellSkeleton` shipped but `ready` resolves in ~1 frame (synchronous localStorage). If more polish needed: add staggered fade-in on skeleton → real content transition.
10. **Skill Intelligence Page — Redesign (in progress)** — Full audit done 2026-05-16. Phased plan below.

---

## SKILL INTELLIGENCE PAGE — REDESIGN TRACKER (Backlog #10)

### Done ✅ (2026-05-16)
- SkillCard component: "Log to Forge" button fires `diary.createEntry`, toggles to "✓ Logged to Forge"
- "CV →" secondary link per skill card → `/cv`
- "Intel →" secondary link per skill card → `/market?skill=<display_name>`
- Stat line reframed: `"N skills · N need proof · N domains below 40%"` (removed misleading "0 gaps")
- Intel page (`market/page.tsx`): reads `?skill=` param via `useSearchParams` → pins skill first in Skill Lens + first heatmap column
- Dead code deleted: `dashboard/domain-drill-dialog.tsx`, `dashboard/domain-radar.tsx`

### Phase 1 — Visual Polish ✅ DONE 2026-05-16
- [x] Domain name truncation fix — `minmax(200px)`, wrap allowed, ellipsis removed. Radar SVG: first word shown + `<title>` native tooltip for full name
- [x] Domain strip cards: 3px color-coded left border (`<30%` red · `30–50%` orange · `50–70%` amber · `>70%` green). Strength % colored to match. `"Explore →"` / `"← close"` affordance bottom-right
- [x] Legend in domain inspector header: colored squares for L3+/L2/L0–1. Orange italic label = "No CV evidence yet". SkillCard jargon replaced: "No CV evidence — keyword inferred"

### Phase 2 — Score Hero + Weakness Spotlight ✅ DONE 2026-05-16
- [x] Score hero — `ScoreRing` SVG component: animated stroke-dashoffset on mount (900ms ease), 5 tiers (Building foundation → Emerging → Developing → Competent → Advanced), next milestone label. Replaces top-right mono number
- [x] Weakness Spotlight — `WeaknessSpotlight` component: lowest avg% domain with most skills (among <60%). Shows domain name, %, skill count, no-proof count, max level. "Log to Forge" diary CTA + "CV →" link. Red left border accent. Sits between header and domain strip

### Phase 3 — Radar → Domain Detail Transformation ✅ DONE 2026-05-16
- [x] `DomainRadar` refactored to SVG-only. Spokes + dots dim (opacity 0.25) when another domain is active; active spoke brightens + dot grows to r=7
- [x] Slide-in inspector between strip and radar removed. Inspector absorbed into radar card right panel
- [x] Right panel two states: "Domain Scores" (default, clickable rows) → "Domain Detail" (SkillCards + actions, maxHeight:340 scroll). Zero layout shift on swap
- [x] `SkillCard`, `ScoreRing`, `WeaknessSpotlight` extracted to `components/skills/`. Page down to 233 lines (under 300 limit)

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

## LAST SESSION SUMMARY (2026-05-16)

```
Mobile performance overhaul — responsive AppShell, canvas guards, layout fixes.

Shipped to Develop:

  MOBILE LAYOUT (C1):
  - AppShell: pure CSS @media(≤768px) — sidebar hidden, bottom 4-tab nav + slim
    top bar (logo, XP pill, avatar) appear. Desktop layout completely untouched.
  - mobile-shell.tsx: MobileTopBar, MobileBottomNav, MobileProfileSheet (bottom
    sheet with settings/feedback/sign-out).
  - use-is-desktop.ts: hook — pointer:fine + min-width:769px. Gates ParticleBg.
  - layout.tsx: viewportFit:"cover" + env(safe-area-inset-*) for iPhone home bar.

  MOBILE PERFORMANCE (C4, C6):
  - globals.css @media(≤768px): backdrop-filter:none — kills GPU blur on mobile.
  - .tm-home-cols: 2-col job detail grid → 1-col on mobile.

  AUTH SKELETON (C5):
  - AppShellSkeleton in mobile-shell.tsx — shimmer layout shown while auth
    resolves instead of blank screen. Matches desktop sidebar + mobile bars.

  KEY FILES:
  - frontend/components/mobile-shell.tsx (NEW — 274 lines)
  - frontend/lib/hooks/use-is-desktop.ts (NEW)
  - frontend/components/app-shell.tsx (exports FEEDBACK_ACTIONS, FeedbackModal,
    SidebarProfile; wires mobile components; isDesktop gates particle bg)
  - frontend/app/globals.css (mobile shell CSS block)
  - frontend/app/layout.tsx (viewportFit)

Open (next sessions):
  - Backlog #8: Process Transparency Layer
  - Backlog #9: Auth skeleton staggered fade-in polish (minor)
  - Intel page perf candidates (heatmap cache, search cache, optimistic follow)
  - Shareability v1: public profile /profile/{token}
```
---
## LAST SESSION SUMMARY (2026-05-17 · CV Builder v2)
```
CV Builder rebuilt as Git-commit-style playground. /skills absorbs deprecated CV-left lenses.

Locked via /grill-me + /frontend-design (T2 Layered Cards):
  - Q2  drop Tech/Domain/Soft pivot
  - Q3  /skills view-mode toggle: Domains | Audit (reuses SkillAuditView)
  - Q4  level correction + AI advice migrate into SkillCard
  - Q5  Path A parser-first
  - Q6  LLM-extend single prompt → skills + structured payload
  - Q7  cv_history.cv_structured JSONB
  - Q8  lazy backfill on /cv visit (reparse_structured_only)
  - Q9  bullet-level Exp/Proj · section-level Edu/Skills/Certs/Summary
  - Q10 per-job state on job_cv_variants.hidden_items
  - Q11 Save = NEW row, monotonic job_version_number
  - Q12 unlimited versions, Q13 default = latest, Q14 jobId required
  - Q15 live preview (client-side renderDeterministic) + explicit Save
  - Q16 job-match badges (lowercase substring · target skills from /skill-gap)
  - Q17 kill Generate-Job-CV + Generate-Next-CV-Draft on /cv. AI polish per-version.
  - Q18 picker dropdown · auto title v{n}·timestamp · no-delete (immutable) ·
        Git-commit model: polish + edit create NEW versions, parent_version_id chain
  - Q18e baseline immutable, only polished bullets editable

Schema (database/migrations/20260517_cv_builder_v2.sql):
  - cv_history.cv_structured JSONB
  - job_cv_variants: + job_version_number, parent_version_id, hidden_items JSONB,
    edited_items JSONB, title, version_kind ('deterministic'|'polished'|'edited')
  - dropped UNIQUE(snapshot_hash), added UNIQUE(user_id, job_id, job_version_number)
  - existing rows backfilled (job_version_number via row_number() partitioned)

Backend (250 tests pass):
  - cv_parser.py: _SYSTEM_PROMPT now returns {skills, structured}.
    _parse_llm_json returns (skills, structured) tuple. _validate_structured
    coerces LLM output into stable shape. parse_cv / parse_cv_text return
    cv_structured key. New reparse_structured_only() for lazy backfill.
  - cv_workflow.py: persists cv_structured on ingest. get_or_backfill_cv_structured()
    lazy-fills NULL on /cv visit.
  - services/cv_compose.py NEW: djb2 stable item_id + render_deterministic().
    Backend mirror of frontend lib/cv-compose.ts.
  - routers/cv/structured.py NEW: GET /cv/structured.
  - routers/jobs/cv_versions.py NEW: list / create / polish / edit endpoints
    under /jobs/{job_id}/cv-versions/. Each Save / Polish / Edit = new row.
    Polish reuses llm_polish._call_ai_polish on parent.deterministic_text.
    Edit applies edited_items diff to parent.polished_text → new row.
  - repositories/cv.py: update_cv_history_structured() for lazy backfill.

Frontend (tsc + lint green):
  - lib/cv-compose.ts NEW: djb2 itemId + collectItems + renderDeterministic.
    Mirror of backend cv_compose.py.
  - lib/api.ts: CVStructured / JobCVVersion types + cv.structured + cv.versions
    {list, create, polish, edit}. Old cv.generateDraft removed from /cv-page
    scope (home/page.tsx jobs.generateJobCv kept — different surface).
  - lib/domain-data.ts: cvStructured(), cvVersions(jobId) keys.
  - components/skills/skill-audit-view.tsx NEW (moved from cv/page.tsx).
  - components/skills/skill-card.tsx: + expand panel with L0–L5 picker
    (users.correctSkillLevel) + ★ Level-up advice (users.skillLevelUpAdvice).
  - app/skills/page.tsx: VIEW pill `Domains | ◈ Audit` (replaces accordion when
    Audit). Sort/Show pills hidden in Audit mode.
  - app/cv/page.tsx FULL REWRITE (~360 lines): 3 modes — no-CV nudge, baseline+
    no-jobId (read-only + "Pick a target job →" CTA), playground+versions.
  - components/cv/cv-playground.tsx NEW: SectionShell + BulletRow + MatchBadge
    + EyeToggle. Bullet-level toggle on Exp/Proj. Section-level toggle on
    Summary/Edu/Skills/Certs. Live opacity+strikethrough on hidden items.
  - components/cv/version-picker.tsx NEW: dropdown showing parent chain +
    per-row actions (★ Polish · ✎ Edit polished · 📄 PDF).
  - Edit modal: textarea, save creates new child version via cv.versions.edit.

Open (next sessions):
  - Backlog #8: Process Transparency Layer
  - home/page.tsx jobs.generateJobCv: still wired, consider killing in cleanup pass
  - cv/variants.py legacy generate-draft + save-draft routes still exist —
    no callers; safe to delete in cleanup pass
  - Intel page perf candidates
  - Shareability v1: /profile/{token}
```

---
## PREV SESSION SUMMARY (2026-05-17 · CV upgrade loop + user_job_matches)
```
CV upgrade loop closed + user_job_matches design overhaul.

Shipped to Develop:

  CV UPGRADE LOOP (Candidates 3+4):
  - CVCol box deleted from HomeColumns.tsx — removed "Rewrite CV line" (100 XP)
    and "Download tailored CV" (50 XP) buttons entirely.
  - handleSpendXP removed from home/page.tsx (no more callers).
  - "Open CV Builder →" link added to JobCard.tsx → /cv?jobId={job.job_id}
    CV page already reads jobId param — flow works end-to-end.

  USER_JOB_MATCHES REDESIGN:
  - DB migration: deduplicated rows, unique key (user_id, job_id, batch_week)
    → (user_id, job_id). action_plan column dropped.
  - llm_ranker.py: action_plan removed from prompt + persist_matches + fallback.
  - schemas/jobs.py: ActionPlanDay class deleted, action_plan removed from
    JobMatchResponse.
  - schemas/__init__.py: ActionPlanDay removed from imports + __all__.
  - routers/jobs/_shared.py: ActionPlanDay removed, to_job_match cleaned.
  - repositories/jobs.py: on_conflict → "user_id,job_id"; action_plan removed
    from SELECT query.
  - routers/jobs/analyse.py: full rewrite — 50 XP cost (was 10), weighted
    overlap formula (PRIMARY_WEIGHT=2/SECONDARY_WEIGHT=1, no 3-match threshold),
    LLM explanation via provider chain, upsert without action_plan.
  - lib/api.ts: ActionPlanDay interface deleted, action_plan removed from JobMatch.

  PERMANENT RULES ADDED:
  - Long-term fixes only — no quick patches. Saved to CLAUDE.md + memory.

Open (next sessions):
  - Backlog #8: Process Transparency Layer
  - Backlog #9: Auth skeleton fade-in polish (minor)
  - Intel page perf candidates
  - Shareability v1: /profile/{token}
```
---
## PREV SESSION SUMMARY (2026-05-16)
```
Skill Intelligence page redesign (Phases 1–3) + mobile layout overhaul.
(See SKILL INTELLIGENCE PAGE — REDESIGN TRACKER above for full detail.)
```
---
## PREV SESSION SUMMARY (2026-05-15)
```
Auth logout fix + Intel page full redesign (heatmap architecture overhaul).

Shipped to Develop:

  AUTH:
  - Multi-tab logout fix: lib/api.ts — cross-tab localStorage lock prevents
    parallel 401s from both calling /auth/refresh. Second tab waits for storage
    event instead of racing → no Supabase token reuse invalidation.
  - Supabase dashboard: JWT expiry extended to 7 days, refresh detection OFF.

  INTEL PAGE — HEATMAP ARCHITECTURE REDESIGN (full rewrite of market/page.tsx):
  Decision tree locked via /grill-me before building:
    · Heatmap companies = followed only (user builds their own heatmap)
    · First visit empty state with CTA pointing to TopMovers
    · Follow costs 10 XP (burned, no refund). Floor: -30 XP (disabled below).
    · Hard cap: 10 followed companies max (star disabled at cap)
    · Row ordering: most recently starred first (created_at DESC from backend)
    · Skill columns: CV skills always (mySkillDemand), Skill Lens toggles within
    · Per-company independent useQueries — rows load in parallel, never invalidate each other
    · Skeleton shimmer cells per row while data loads
    · Progress banner (3-step: market data → skills → heatmap), disappears when done
    · Hover-prefetch: hovering star in TopMovers fires prefetchQuery for that company row
    · Star button shows "10" XP cost label; disabled states: cap OR floor

  BACKEND FIXES:
  - xp_service.py: spend_xp_to_floor(floor=-30) — XP can go negative to limit
  - users.py router: follow_company now checks 10-cap, deducts 10 XP, returns new_xp_balance
  - repositories/jobs.py: fetch_skill_heatmap_row — single-company method.
    Filters skill_id at DB level (.in_("skill_id", skill_ids)) instead of
    fetching all job_skills then filtering in Python. Kills the 23-46s query.
    Expected: ~1-3s cold, ~150ms cached.
  - routers/jobs/list.py: single-company requests routed to fast method.
  - api.ts: followCompany returns new_xp_balance; new skillHeatmapRow fn.

Open (next sessions):
  - Backlog #4: ✅ DONE — loading screen shipped (progress banner + skeleton rows)
  - Backlog #6: PR2 — Run Analysis endpoint + XP deduction
  - Backlog #7: ✅ DONE — TopMovers shows all companies, search, follow from list
  - Backlog #3: user_job_matches design review (discuss Shivam first)
  - Backlog #8: Process Transparency Layer
```
