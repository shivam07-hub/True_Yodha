# Myro — Domain Context

Durable vocabulary. Use these terms in code, commits, ADRs, and architecture reviews. Update this file when a new domain concept crystallises, or when an existing term sharpens. Source of truth for the language we use to talk about the product.

---

## CV Version

A single immutable snapshot of a CV. Stored as one row in `cv_versions`. Every interaction that produces a new shape of a CV — uploading a file, saving a tailored playground state, polishing with the LLM, editing polished text — creates a new row. Existing rows are never mutated.

**Attributes**

- `kind` — one of:
  - `baseline_upload` — a CV the user uploaded. The truth-of-record for "the user's CV" at the time of upload. `job_id IS NULL`.
  - `deterministic` — a per-job tailored CV saved from the playground. Hidden bullets removed, edited bullets applied, deterministic render of `cv_structured`. `job_id IS NOT NULL`.
  - `polished` — an LLM rewrite of a `deterministic` (or another `polished` / `edited`) row. `job_id IS NOT NULL`.
  - `edited` — a user-edited variant of a `polished` row. `job_id IS NOT NULL`.
- `user_version_number` — monotonic per user, **global across kinds**. v1, v2, v3, … never resets per-job. Baseline rows occupy low numbers (in upload order); derivatives extend the same sequence (in creation order). The number that appears in the UI dropdown is this one.
- `job_id` — `NULL` on baselines; the target job on every derivative.
- `parent_version_id` — points at the row this one was created from. `NULL` for `baseline_upload`. Not null otherwise.
- `baseline_version_id` — materialised at write time. On derivatives, copies the parent's `baseline_version_id` (if parent is itself a derivative) or the parent's `id` (if parent is a baseline). On `baseline_upload` rows, `NULL`. This is what powers the "from v1" badge in the UI — no parent-chain walk needed at read time.
- `cv_structured` — JSONB snapshot of the structured CV (summary, experience, projects, education, skills, certs). **Snapshotted on every row.** Derivatives copy their parent's `cv_structured` at write time; reworking the baseline does not mutate prior derivatives.
- `body_text` — for baselines, the raw upload text. For derivatives, the deterministic render. Never null.
- `polished_text` — populated only on `polished` / `edited` rows.
- `hidden_items`, `edited_items` — JSONB. The user's playground state at the time of save. Derivatives only.

**Reads**

- "Current baseline" = `cv_versions WHERE user_id = ? AND kind = 'baseline_upload' ORDER BY created_at DESC LIMIT 1`.
- "All versions for the CV page" = the user's baselines + the **Company CV Thread** for the current job's company. See below.

---

## Company CV Thread

The ordered set of CV Versions a user has authored against any job at a given company. The unit of CV identity the user actually cares about — "my Capgemini CV" — independent of which specific Capgemini role row in `job_applications` is being viewed.

**Why this exists**

Users tailor per-company, not per-role. The same polished CV serves Capgemini Senior PM and Capgemini Lead PM applications. Modelling identity at the job-row level would force duplicate authoring; modelling it at the company level matches reality.

**Membership**

A row is in the thread for company `C` iff: `cv_versions.user_id = U AND cv_versions.kind <> 'baseline_upload' AND cv_versions.job_id IN (SELECT job_id FROM jobs WHERE company_name = C)`.

**Reads**

- "Thread for the current page" = baselines (`job_id IS NULL`) **+** thread rows for the company of the current `job_id`. Returned together by `CVVersionsRepository.list_thread(user_id, company_name)`.
- "Canonical CV at company" = thread row with the largest `user_version_number`, kind-agnostic. Returned by `CVVersionsRepository.latest_for_thread(user_id, company_name)`. Display fallback: `polished_text ?? body_text`.

**Invariants**

- Threads are derived, not stored. No `cv_threads` table. Joins resolve at read time via `jobs.company_name`.
- A single CV Version belongs to **exactly one** thread (the company of its `job_id`).
- Reworking the baseline does not invalidate the thread — see CV Lineage rework semantics.

**Surfaces**

- `/cv?jobId=X` → playground for the thread covering `X`'s company.
- `/tracker` → every application row carries a `cv_badge` summarising its company's latest thread row (or `null` if none).

---

## CV Lineage

The directed graph formed by `parent_version_id` across a user's CV Versions.

**Rules**

- Any parent owned by the same user is allowed. No `job_id` alignment requirement between parent and child. A derivative under `job_id = B` may parent a derivative under `job_id = A` (enables future cross-job forking workflows).
- Baselines have no parent.
- `baseline_version_id` is the authoritative anchor — it tells you which baseline a derivative was snapshotted from, regardless of how many polish/edit hops sit between.

**Rework semantics**

- Uploading a new CV creates a new `baseline_upload` row. Prior derivatives keep their `cv_structured` snapshot and their `baseline_version_id` pointing at the old baseline. The UI surfaces this as a "from v{n} · stale" badge when `derivative.baseline_version_id !== currentBaseline.id`.
- Users opt in to rebasing by saving a new version against the new baseline from the playground.

---

## Interactive-rest

The resting color of a **clickable control that is not a teal CTA or accent link** — ghost buttons, menu/dropdown rows, inactive nav items and tabs, filter chips, icon buttons. The rule: **a clickable control is never dull at rest.** Such controls rest on `--tm-interactive-rest` (`app/design-tokens.css`), never on `--tm-text-muted` / `--tm-text-faint`.

**Boundary**

- `--tm-interactive-rest` references `--tm-text`, so it auto-flips per surface: dark `#E8F0FF` (as white as possible), light `#050A18` (near-black) — i.e. *maximally-contrasting resting color*.
- Untouched layer: teal solid CTAs, teal outline buttons, and teal inline links keep their accent color — white is the floor for the previously-dull controls, not a replacement for the teal interactive identity.
- Stays dull (`--tm-text-muted` / `--tm-text-faint`): **static, non-clickable** labels, captions, meta, helper/description text, placeholders, **disabled** controls, and **decorative** (non-clickable) icons. Bright ⇔ clickable, dull ⇔ not.
- Hover/active on a now-bright control is carried by **background/border**, not a text-color shift (text is already maxed).
- `--tm-text-muted` and `--tm-icon-muted` are **dual-use** (static labels *and*, historically, clickable controls) — so this is a per-control sweep, not a token redefinition. No automated lint can detect clickability statically; the greppable token name is the durable marker.
- Rollout is phased: PR1 = token + shared primitives (`Button` ghost variant, segment toggles, the avatar dropdown rows, mobile bottom-nav + drawer). Later PRs sweep ad-hoc inline controls one surface at a time.

## Theme Control

The single surface (light/dark) switcher. `<ThemeControl>` (`components/ui/theme-control.tsx`) is the **canonical** control — there is exactly one place that knows how a user changes theme, rendered in all three homes: the account dropdown (`shell/web-chrome.tsx`), the mobile drawer (`mobile/shell.tsx`), and Settings → Appearance (`settings-modal.tsx`). Adding a new surface theme switch means rendering this primitive, never hand-rolling a segmented control.

**Boundary**

- Owns the `useSurface()` wiring and `radiogroup`/`radio` a11y semantics; the three states are `system` | `light` | `dark` (`system` follows `prefers-color-scheme`).
- Visually rides `.tm-segment-toggle` (`app/design-tokens.css`), so idle segments inherit the [Interactive-rest](#interactive-rest) brightness contract for free. Do not restyle idle segments to a dull token.
- `fluid` stretches the pill to fill its row (dropdown / drawer). Bare = auto width (the Settings row, where label + description sit beside it). `label` renders the static caption (`--tm-text-muted`, dull — it is not clickable).

## Viewport Mode

The frontend's responsive posture. One of `mobile` | `desktop`. Source of truth for any code that needs to behave differently across screen sizes — sidebar vs bottom-nav, hero font size, grid collapse, particle background gating.

**Boundary**

- Single breakpoint: `--tm-bp-mobile` (CSS, `app/design-tokens.css`) and `BREAKPOINT_MOBILE_MAX` (TS, `lib/viewport.ts`). These two must stay in sync — they are the **same constant** mirrored across language boundaries.
- `mobile` = viewport `max-width ≤ var(--tm-bp-mobile)` (currently 768px).
- `desktop` = viewport `min-width: calc(var(--tm-bp-mobile) + 1px)` **and** `pointer: fine`. The pointer check keeps touch laptops on the mobile path.

**Source of truth**

- CSS branching: `@media (max-width: 768px) { … }`, ideally referencing `MEDIA_QUERY_MOBILE` indirectly via class hooks (`.tm-mobile-*`, page-scoped `.tm-<page>-*`).
- JS branching: `useIsDesktop()` from `lib/hooks/use-is-desktop.ts`. Returns `false` on SSR + first paint to avoid mobile-broken hydration. Today only used to gate expensive desktop-only mounts (e.g. `ParticleBg`).

**Rules**

- Both nav variants — desktop sidebar and mobile top-bar + bottom-nav — always live in the DOM. CSS controls visibility, not JS. This avoids hydration mismatch and lets the layout respond to viewport changes without re-mounting.
- JS-gated unmount (`useIsDesktop`) is reserved for components whose mobile render cost is unjustified (heavy animation, large data). Default to CSS branching.
- Page-scoped class hooks (`.tm-mission-header-grid`, `.tm-login-sidebar`, etc.) are the current pattern. Future work may deepen this into a `<ResponsiveStack>` primitive — see Backlog #9 deepening notes in CLAUDE.md.

---

## Forge Session

> **User-facing label (PR2):** *Practice session*. The domain glossary keeps the DB-aligned name `Forge Session` because identifiers (`forge_sessions` table, `forge_service.py`, `useForgeSession` hook, `/forge` route) are durable contracts. See `UBIQUITOUS_LANGUAGE.md § Public Vocab Lock` for the full mapping.

An open-ended interval of deliberate practice on one skill. Stored as **bursts** in `forge_sessions` rows (any `duration_minutes > 0`) and aggregated on `user_skills.total_forge_minutes`. A "session" toward level threshold is the derived unit `total_forge_minutes // 25` — partial bursts accrue across the day and survive reloads. Users are never punished for stopping mid-25-min.

**Lifecycle states (orthogonal axes)**

Timer axis:
- `idle` — no active skill. No countdown.
- `running` — active skill, countdown ticking.
- `paused` — active skill, countdown frozen at last `remaining` value.
- `complete` — active skill, `remaining = 0`, awaiting claim or restart.

Claim axis (independent):
- `pendingMinutes > 0` — whole minutes accrued since last successful claim. Claim writes them to backend; backend credits XP + may bump level.
- `pendingMinutes = 0` — nothing to claim.

A session can simultaneously be `running` and have `pendingMinutes > 0` (kept going past a whole-minute boundary).

**View-model seam**

`useForgeSession()` (`lib/hooks/use-forge-session.ts`) is the single seam every Forge UI surface consumes. Renderers never read `useForgeTimerStore` directly. The hook returns:

```
{
  state: 'idle' | 'running' | 'paused' | 'complete'
  skillName: string | null
  mm: number; ss: number
  ringPct: number   // 0..100 progress through current 25-min unit
  pendingMinutes: number
  pendingXp: number
  canClaim: boolean

  startSession(skill): void
  startLastForged(): Promise<void>   // fetches /users/me/forge/last-skill
  pause(): void
  resume(): void
  claim(opts?: { onClaimed?: (result) => void }): Promise<void>
}
```

The hook auto-updates two stores after a successful claim: forge store (clear pendingMinutes) + XP wallet (bump balance). Cache invalidation is caller-controlled via `onClaimed` — most renderers don't show skills/scores, so they leave it blank; the Forge page wires `userSkills` / `scores` / `cvEvidence` invalidation.

**Clock driver**

`<ForgeClockDriver />` mounts once in `AppShell`. It owns the `setInterval(tick, 1000)`. Every other surface is a read-only consumer. Two ticks per second was a real bug class — concentrating the heartbeat in one place removes it as a possibility.

**Accrual rule — the timer is never always-running (locked)**

Time only counts while the tab is foreground and the 1-second heartbeat is alive. Two mechanisms enforce it; both live in the store/driver, never in the pure clock math:

- **Pause on hidden.** `ForgeClockDriver` calls `setRunning(false)` on `visibilitychange → hidden`. Backgrounding the tab freezes the session; the user resumes deliberately. No auto-resume on return.
- **Idle-gap fold.** `foldIdleGap()` (`lib/forge-clock.ts`) moves any gap between heartbeats larger than `FORGE_IDLE_GAP_GRACE_MS` into `pausedMs`, so a hidden / closed / background-throttled gap never accrues. This is the safety net for a *closed* tab (no `visibilitychange` guarantee) and for a stale `running` session rehydrated from `localStorage` days later — on the first `reconcile()` the dead time is folded out instead of credited. `reconcile`, `setRunning`, and `dismiss` all route through it.

Without these, the clock reconstructed earned minutes from absolute wall-clock (`now − startedAt`) and credited closed-tab time — producing runaway `pendingMinutes` and a 422 on claim (over the per-burst ceiling). Fixed 2026-06-04.

**Per-burst claim ceiling.** A claim sends whole minutes only, clamped to `FORGE_MAX_BURST_MINUTES` (1440 = one day) — mirror of `ForgeCompleteRequest.duration_minutes` `le=1440` in `backend/app/schemas/xp.py`. Any remainder stays pending and is claimable on the next tap. A value above this can only be clock skew / corruption, never real practice.

**Surfaces consuming the hook**

- Mobile top widget: `<ForgeXpPill />` (always-visible, compact 30px).
- Desktop sidebar: `<SidebarForgeTimer />` (104px ring, decorative ticks, shown only when `sessionActive`).
- Forge page: `app/forge/page.tsx` (full dial, skills picker, claim controls).

Adding a fourth surface (PWA push, watch face, embedded widget) is one adapter, no engine change.

---

## Principal

The authenticated identity behind a request. One row in `auth.users`, surfaced into FastAPI as `Principal(id, email)` and produced by `app.deps.get_principal`. Every protected route depends on this — not on a raw dict, not on a JWT, not on a Supabase user object.

**Attributes**

- `id` — the `auth.users.id` UUID, as a string. **Same field name as the Supabase SDK's `response.user.id`**, so there is one canonical name for this value end-to-end (no `user_id` vs `id` translation to invite typos).
- `email` — the JWT email claim. Optional — never assume present for non-email auth flows.

**Seam**

`app/deps.py` is the only place that talks to Supabase Auth. Three dependencies, all memoized within a single request by FastAPI's dep cache (one JWT validation per request, regardless of how many of these are injected):

- `get_principal() -> Principal` — identity-only. Default choice for protected routes.
- `get_user_db() -> Client` — RLS-scoped Supabase client bound to the caller's JWT. Routes that need the DB, and every `get_token_*_repository` factory, depend on this.
- `get_current_user() -> CurrentUser` — `Principal + token`. **Internal**. Only `get_user_db` reads it. Routers must not depend on `CurrentUser` directly — depend on `Principal` and let the seam own the token.

**Invariants**

- The bearer token never leaves `deps.py`. Routers, services, repositories never see it. This is what makes `Principal` safe to log, serialize, or hand to background tasks.
- `Principal.id` is non-null on any successful injection — `get_current_user` raises `401` before returning.
- `Principal` is frozen (Pydantic `frozen=True`). Mutating identity mid-request is not a thing.
- Tests construct `Principal(id=..., email=...)` directly and inject via `app.dependency_overrides[get_principal]`. There is no dict-shape contract to drift.

**Surfaces**

- ~50 router endpoints across `users`, `diary`, `payments`, `telemetry`, `scores`, `xp`, `profile`, `cv/*`, `jobs/*`.
- 5 repository factories (`get_token_users_repository`, `get_token_cv_repository`, `get_token_jobs_repository`, `get_token_diary_repository`, `get_token_scores_repository`) — all consume `get_user_db`, none touch `Principal`.

---

## Job Refresh

A user-initiated request to recompute the user's weekly Job Matches. Modelled as a discrete **action** — every click of the dashboard's "Refresh matches" button creates one Job Refresh, identified by a `ticket_id`. There is no per-week singleton; users may fire as many refreshes as their XP balance allows.

**Economy**

- Costs `MATCH_REFRESH_XP_COST` (currently 50) XP per ticket.
- XP is debited **at start**, before compute runs. If compute fails for any reason (provider error, exhausted pool, infra), XP is refunded inside the same ticket — refund amount is surfaced on the final `RefreshState`.
- No cooldown. As long as the jobs feed is being continuously swept by the external crawler (ADR-0001), users can refresh at will.
- Insufficient XP raises `HTTP 400` from the start endpoint before any ticket exists. Frontend reads the typed error state, no substring matching.

**Lifecycle states**

```
queued    → ticket created, work not yet picked up
computing → worker running (skill query → ranking → persist)
done      → matches written, ticket terminal
failed    → compute errored, XP refunded, ticket terminal
```

Each transition writes a `progress_label` ("Reading skills", "Scanning jobs", "Ranking with Myro", "Done") for the UI to render without state-machine knowledge.

**Job Refresh seam**

`app/services/job_refresh/` is the single entry point. Two facades:

```py
class JobRefresh:
    @staticmethod
    async def start(user_id) -> RefreshTicket            # charges XP, returns ticket
    @staticmethod
    async def status(user_id, ticket_id) -> RefreshState # poll-shaped read
```

Internals (private):

- `_dispatch.py` — picks inline (no Redis) vs async (Redis-backed RQ queue). Production always async on Railway; tests + local dev use inline. Router and frontend never branch on this.
- `_xp_charge.py` — debit-then-refund-on-failure semantics. Single SQL transaction owns balance mutation; preflight is no longer separate from spend.
- `_pipeline.py` — calls `jobs_workflow.compute_job_matches`, maps the typed `MatchComputeOutcome` onto `RefreshState`.

**Status surface**

- `POST /jobs/refresh` → returns `RefreshTicket{id, state: "queued", xp_charged, new_xp_balance}`.
- `GET  /jobs/refresh/{ticket_id}` → returns `RefreshState`.
- Frontend polls GET every 1s, max 30s. No SSE. Polling beat SSE on the simplicity axis after 10–15s compute windows + proxy-drop bugs.

**LLM fast-lane**

The paid refresh path uses `get_paid_jobs_provider()` — Groq llama-3.3-70b only, no free-tier fallback chain. Free auto-compute (CV upload fire-and-forget in `cv_workflow._trigger_initial_match_compute`) keeps the full fallback ladder. Reasoning: a paid user clicked the button; the user-perceived latency target is ≤5s. The free chain costs nothing but takes 10–15s under cascade.

**Frontend seam**

`useJobRefresh()` (`lib/hooks/use-job-refresh.ts`) is the one view-model every refresh surface consumes. Renderers never read `/jobs/refresh/*` directly. Returns:

```ts
{
  state: 'idle' | 'charging' | 'computing' | 'done' | 'error_insufficient_xp' | 'error_failed'
  progressLabel: string | null
  cost: number
  canAfford: boolean
  matchesWritten: number | null
  refresh(): void
  reset(): void
}
```

Mirrors the `useForgeSession` pattern. Two surfaces today consume the hook: `MissionHeader` (home) + `/jobs` page. Adding a third (mobile widget, scheduled refresh tile) is one adapter, no engine change.

---

## Feed Publication

A completed, queryable release of crawler data into Myro's shared jobs database.
The latest successful `job_feed_run_audits` row is the publication clock: its
`run_id` is the Feed Version and its `created_at` is `published_at`.

**Invariants**

- `jobs.last_seen` answers when the scraper observed a listing. It does not
  answer when Myro finished loading that observation.
- Only a successful audit (`status = 'ok'`) advances the Feed Version.
- Feed State reads are cheap, cacheable, and conditional through an ETag.
- Detecting a newer Feed Publication is free. Recomputing personalized Job
  Matches remains a separate Job Refresh and keeps its XP contract.

## Job Feedback

An append-only user signal about either personal fit or shared listing quality.
Stored in `job_feedback_events` with a client-generated idempotency key.

**Kinds**

- `personal` — why this user does not want the role. Tunes personalization and
  never changes the listing's shared freshness state.
- `quality` — evidence about the listing itself, such as a closed apply link,
  an apparently old posting, a duplicate, or incorrect details.

The card dismissal remains in `user_dismissed_job_cards`; Job Feedback explains
the dismissal but does not replace it. Raw feedback earns no immediate XP.

## Job Pulse

The privacy-safe read model describing what Myro currently knows about one job:
scraper verification, listing confidence, tracking volume, and application
outcomes. Served from `job_intelligence_snapshots` plus the canonical `jobs`
row.

**Invariants**

- Listing Confidence is one of `active | uncertain | likely_closed | closed`.
- One user action cannot close a listing.
- Personal Job Feedback never contributes to Listing Confidence.
- Exact community counts are suppressed below the cohort threshold.
- `ghosted` is an explicit application outcome, never inferred from a skip.
- The snapshot is eventually consistent and optimized for reads by web and
  future native clients. Canonical applications and feedback events remain the
  source of truth.

## Scoped Skill Demand

The count of **active jobs in the user's location scope whose skill set includes skill S**. The unit behind the market rail's "Skill-demand movers" — each mover badge is this number, and clicking a mover filters the triage feed by the same skill.

**Why this exists**

A mover badge is a promise: click "↑1190" and you must land on ~1190 roles (the LinkedIn/Inshorts contract — *the number on a chip is what you get*). Before this concept existed, the badge counted one thing (every `job_skills` row for S, globally, active + inactive, all locations) and the click did another (a free-text search of `job_title`/`company_name` for the skill name, which almost never matches) — so "↑1190" routinely landed on an empty feed.

**The single predicate**

`is_active = true AND <location scope> AND S ∈ main_skills`. Defined once, read by both halves of the seam:

- **Count half** — `JobsRepository.scoped_skill_demand_counts(skill_displays, location_prefs)`: one indexed head-count per skill. Powers the rail badge (`UserSkillDemandItem.scoped_job_count`, populated only when `/jobs/my-skills/demand?location_scoped=true`).
- **Filter half** — `JobsRepository.feed_jobs(skill=…)`: the feed's `skill` facet, a first-class dimension distinct from the free-text `q`.

Because both read the same predicate, the badge equals the feed it links to (modulo the draining-queue triage drop — the same honesty `available_total` already carries).

**Boundary**

- Distinct from market-wide demand (`job_count_30d` / `weighted_demand` from `build_user_skill_demand`), which is the **unscoped** signal the Skills page, landing chips, Forge, peek, and newsletter read. Scoped Skill Demand never replaces it; it is the location-aware count for the click-through rail only.
- `location_scoped` is opt-in on the demand endpoint so unscoped callers pay nothing.
- The skill facet matches the canonical skill name against `main_skills` (the back-compat mirror of `job_skills`), case-sensitive on the array-contains; canonical Lightcast names are stored on both sides, so this aligns.

## Taxonomy Read-Model

The public `/taxonomy` page's view of the 35,108-skill Lightcast tree, served as **three tiers** instead of one 4MB blocking fetch. The tiers exist because the page's access pattern is the inverse of its payload: the first paint needs only structure (domains → clusters → counts), the in-demand lead needs ~3,000 skills, and the 35k leaf names matter only on search or deep drill-down.

**Why this exists**

The page shipped as a single `fetch("/data/skill_taxonomy.json")` (4MB / ~825KB gz) gated behind one `Loading 35,108 skills…` spinner — the global-gate-strangling-independent-regions anti-pattern ADR-0011 exists to retire, plus a count-narration its truth-over-comfort rule forbids. 95% of the payload (leaf names) was loaded eagerly for a view that shows none of it until you drill in.

**The three tiers**

- **structure** — `taxonomy_skeleton.json`: domains → clusters → `n` (full leaf count, so the "35,108" hero stays honest). No leaf names. Tiny; blocking but instant.
- **priority** — `taxonomy_priority.json`: the in-demand set (`{name, domain, cluster, band}`, ~3,000 skills, sorted by demand). Leads the page, powers instant search over what real jobs ask for, and is the **sole demand carrier** — `demandOf(name)` returns a [DemandBand](#scoped-skill-demand) for priority skills, null otherwise (a long-tail chip renders plain; "not in the in-demand set" is the honest signal).
- **index** — the existing `skill_taxonomy.json`, loaded once in the background on idle after `priority` resolves. Powers full search + long-tail drill-down chips.

**The seam**

A headless engine (`createTaxonomy({ fetch })`, the `field-motion.ts` precedent) owns tier orchestration — load order, the idle-scheduled `index` fetch (fired once), the flat search index, and the demand join — and emits `readiness: { structure, priority, index }` (each `pending | ready | error`) via `subscribe`. A thin `useTaxonomy()` hook is a `useSyncExternalStore` adapter; the page component becomes a pure renderer. The engine is the test surface: tier transitions and "index fetched exactly once" are Node unit tests with a fake fetch, no DOM. Section-readiness (ADR-0011 `SectionGate` + `<TealField mask>`) reads `readiness` directly — each tier paints when its own source resolves, no global gate.

**Boundary**

- The demand `band` reuses market-wide demand (`weighted_demand` from `build_user_skill_demand`) — the same unscoped signal the Skills page reads — never a fresh per-page `jobCount`. The build-time generator is a thin adapter that exports that already-computed signal into `priority.json`.
- Artifacts are forward-only: regenerated on the weekly scrape, committed, **not** wired into `prebuild` (no build-time DB coupling).

## Job Intelligence

The deep backend module that owns Feed State, Job Feedback, and Job Pulse.
Its interface has three entry points:

```py
feed_state(if_none_match: str | None) -> FeedStateRead
record_feedback(user_id: str, command: FeedbackCommand) -> FeedbackReceipt
pulses(job_ids: list[str]) -> list[JobPulse]
```

The module hides publication clocks, idempotency, confidence policy, privacy
thresholds, snapshot storage, and Supabase query details. HTTP routers and
platform clients do not reproduce those rules.

---

## CV Version Writer Seam

`CVVersionsRepository.create(spec: CVVersionWriteSpec)` is the single seam through which CV Versions enter the database. Every endpoint that produces a version — upload, save playground, polish, edit — reduces to building a spec and calling this method. The repository owns:

- Computing the next `user_version_number`.
- Propagating `baseline_version_id` from the parent.
- Enforcing invariants: `kind` ↔ `job_id` consistency, parent ownership, baseline-required-on-derivative.
- Snapshot hash, default title, timestamps.

Endpoints never write to `cv_versions` directly. If a new flow needs to create a version, it goes through the spec.

---

## Match Read Seam

A persisted match row (`user_job_matches` joined with `jobs`) is the matcher's durable output: deterministic skill overlap, the credibility gate (`match_credibility`), and the LLM 5-axis eval (`llm_ranker`). **Match Eval** (`MatchEval` in `schemas/jobs.py`) is the typed read model for the `user_job_matches` eval columns; `to_job_match` parses each raw row into it before building the `JobMatchResponse`, so the read boundary receives a validated shape instead of re-guessing each field with `.get()`.

**Invariants**
- A field's type is declared **once**. Shared type aliases (e.g. `SeniorityCompat = Literal["compatible","incompatible","unknown"]`) bind the matcher's output (`Credibility`), the `MatchEval` read model, and the `JobMatchResponse` field together — the write side and read side cannot disagree about a field's type. (The bool/str drift on `seniority_compatibility` 500'd `/jobs/matches` + `/home/bootstrap` per-user before this seam existed.)
- `MatchEval` is **tolerant**: every field optional, unknown columns ignored. A newly-added persisted column never narrows the read or 500s the dashboard.
- A *type* mismatch on a known eval field fails at this seam — one clear, tested boundary — not at the per-user response gate in production. The seam is the test surface (`test_job_match_response.py`).
- `to_job_match` is the single reader of a match row. New consumers of match eval go through `MatchEval`, not raw dict `.get()`.

---

## Background Job

A durable unit of deferred work that must survive a process restart. Today: CV upload parse+score, initial match-compute, paid Job Refresh, skill-edit re-tag. Enqueued onto a **Work Lane** as an RQ job, consumed by a **Job Runner**, retried on transient failure, and charged/refunded through the existing XP ledger (ADR-0004). Replaces the legacy `asyncio.create_task` fire-and-forget in `cv_workflow.py` and the FastAPI `BackgroundTasks` in skill-edit.

**Invariants**
- A Background Job is enqueued only AFTER the durable intent row exists (`cv_upload_jobs` for upload). The row id is the job's correlation key.
- Idempotent on its correlation key — re-running a job (RQ retry, or duplicate enqueue) must not double-charge (ledger guards this), double-write a baseline CV, or double-refund.
- Per-job timeout configured on the Runner so a SIGKILLed worker's job moves to the failed registry and refunds — making orphans structurally rare.
- A failed terminal Background Job refunds via the idempotent `refund_xp` RPC, per ADR-0004.
- The CVUP3 orphan-sweep is KEPT as an independent backstop (the "night watchman") — a periodic reaper that catches any ticket the rail drops despite the timeout (Redis eviction, stuck registry, misconfig) and refunds it. Defense-in-depth for the Upload Guarantee; does not depend on RQ being perfectly configured.

## Upload Guarantee

The product-level invariant the whole Background Job system serves: **once a user uploads a CV, they get their output.** Priority order: speed, success, no outages — but success is never sacrificed for speed. The durable rail (no loss on restart) + retry-on-transient-failure (self-heal hiccups) + never-reject overload policy (no busy-failures) + orphan-sweep watchman (independent backstop) together make a silently-dropped upload structurally impossible. The only terminal non-success is a PERMANENT failure (no skills / scanned PDF / taxonomy-unmapped), which fails fast, refunds, and tells the user exactly how to fix it.

## Work Lane

A named RQ queue carrying Background Jobs at one urgency. Exactly two:
- **fast** — a user is staring at a loading screen: CV upload parse+score, paid Job Refresh.
- **bulk** — nobody is waiting: initial match-compute after upload, skill-edit re-tag.

A Job Runner listens to lanes in priority order `[fast, bulk]` — RQ pops fast first, only touching bulk when fast is empty. A flood of bulk work can never delay a waiting user.

## Job Runner

A worker process (separate from the web process) that consumes Work Lanes fast-first. Run **2** for redundancy — one keeps serving while the other restarts/deploys. Each Runner caps its own in-flight jobs low; the true provider ceiling is the **Provider Budget**, not the per-Runner cap. Entry point `app/workers/jobs_compute_worker.py`, generalised from the job-refresh-only worker.

**Retry policy** — 3 retries with growing backoff (~5s/15s/45s) on TRANSIENT failure only (provider-unavailable, 429 rate-limit, timeout, network). PERMANENT failures (no skills, scanned/short PDF, taxonomy-unmapped) fail fast + refund immediately with no retry.

## Provider Budget

A single global ceiling on concurrent LLM calls, shared across all Job Runners and web requests — a Redis token bucket. A caller must take a token before calling the provider and returns it after. Total in-flight provider calls stay bounded no matter how many Job Runners exist, so scaling Runners for reliability never raises 429 risk. Lives behind `LLMProvider.complete` — every LLM caller (parse, score, polish, rank, vision) inherits it unchanged. Paired with rate-limit-aware retry+backoff inside `complete` (classify 429/5xx/timeout vs hard-fail; honour `Retry-After`).

## Overload Policy

Uploads are never rejected for load (your "never fail an upload" rule). At peak the durable rail absorbs the spike; the loading screen surfaces honest backpressure ("high demand — still working, you're in line"), feeding the >90s honest-copy state of the CV-loading redesign. Charge stays at enqueue; refund only on terminal failure after retries.
