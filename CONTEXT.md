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

A user-initiated request to recompute the user's Job Matches. Modelled as a discrete **action** — every click of the dashboard's "Refresh matches" button creates one Job Refresh, identified by a `ticket_id`. Users may fire as many refreshes as their XP balance allows. (Matching is **event-driven, not weekly** — Backlog #36: an eval is a permanent per-`(user, job)` fact, migration 20260710; a Job Refresh re-ranks that stack, it is not a per-week snapshot. Scrapes land continuously and trigger free auto-recompute for affected users; a manual Refresh is the user-pulled path.)

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

- `POST /jobs/refresh` → returns `RefreshTicket{id, state: "queued", xp_charged, new_coin_balance}`. `new_coin_balance` is null on a free run — see "Coin balance".
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
- Artifacts are forward-only: regenerated on a scraper batch refresh, committed, **not** wired into `prebuild` (no build-time DB coupling).

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

## Apply Transport

The single frontend seam every "leave to apply" flows through — the producer of
the click-verified liveness signal that feeds Job Feedback → Listing Confidence.
Job boards are one-sided; this is how the user (the closest witness to whether a
posting is real) writes their verdict back into the platform.

Two halves:

- **Resolution** (`lib/jobs/apply-transport.ts`, pure) — `resolveApplyTarget(job)`
  returns where applying sends the user: the scraped portal URL, else a
  `"{company} careers"` search (`careersSearchUrl`), else nothing. This is the
  one place the careers heuristic lives; the Web Share sheet reads the same
  primitive. No surface re-derives it, and none falls back to `/companies`.
- **Capture** (`components/jobs/use-apply-capture.tsx`, headless) — arms in the
  same act as transport (`onApply` / `open`), so a user can never be sent out
  without being asked on return "was this still live?". A "gone" answer fires a
  `quality: apply_link_closed` feedback event and offers a "find similar roles"
  recovery. It emits `state` (`idle | asking | gone`); each design system renders
  its own band (`ApplyCapturePrompt` web `--tm-*`, `ApplyCapturePromptMobile`
  `.mm-*`) — the presentation is a real seam with two adapters.

**Invariants**

- Every apply-out (web drawers, CV playground, CV export, mobile Jobs/Collections)
  routes through the capture. A new apply affordance is not done until it does.
- The aggregate `JobPulse.quality_report_count` is the crowd's ghost verdict, read
  back onto the card (`PulseRow`) and drawers as "N reported gone". It obeys the
  Job Pulse privacy invariant — null below the cohort threshold, never rendered
  as zero — and one report can never close a listing (that stays Job Pulse's
  confidence policy).

---

## CV Version Writer Seam

`CVVersionsRepository.create(spec: CVVersionWriteSpec)` is the single seam through which CV Versions enter the database. Every endpoint that produces a version — upload, save playground, polish, edit — reduces to building a spec and calling this method. The repository owns:

- Computing the next `user_version_number`.
- Propagating `baseline_version_id` from the parent.
- Enforcing invariants: `kind` ↔ `job_id` consistency, parent ownership, baseline-required-on-derivative.
- Snapshot hash, default title, timestamps.

Endpoints never write to `cv_versions` directly. If a new flow needs to create a version, it goes through the spec.

---

## CV Structured Contract

`cv_versions.cv_structured` has exactly seven keys — `contact`, `summary`, `education`, `experience`, `projects`, `skills_line`, `certs` — defined once in `app/services/cv_structured_shape.py` and shared by the response model, the parser and the repository. A payload is **absent or complete. Never half.**

Three rules, in the order a payload meets them:

- **Read — normalize.** `CVVersionsRepository` normalizes `cv_structured` on the way out (`latest_baseline`, `find`, `find_by_content_hash`, `find_master_revision`), so no reader can fail on the shape of what an earlier writer left behind. Structural only: fill missing sections, coerce types, **never alter content** — trimming and the 300-char bullet cap are ingest hygiene (`coerce_sections(ingest=True)`), and applying them on read would silently shorten a bullet the user typed.
- **"Do we have a CV?" — `has_content`, not truthiness.** Everything is truthy after normalization, and a payload holding only `contact` is an identity header, not a CV. `has_content` is what the 409 gates in weave / merge / skill-edit / gap-plan / reservoir ask.
- **Write — reject a partial.** `create`, `update_structured` and `update_master` refuse a payload missing any contract key. `{}` / NULL stays legal: it means "not parsed yet", and `get_or_backfill_cv_structured` rebuilds it from `body_text` on first read.

Why normalization lives on read and not only on write: the incident that produced this contract came from an **offline repair script writing to the table directly**. A guarantee that binds only callers who went through the repository is not a guarantee. Migrations, admin updates and scripts are all upstream of the write seam and downstream of the read one.

`body_text` is the recovery source of truth — never sanitized, always rebuildable-from. A failed rebuild returns 503 rather than an empty CV, because an empty editor is one autosave away from overwriting `body_text` with a rendering of that emptiness.

Pinned by `tests/test_cv_structured_read_never_fails.py` and `tests/test_cv_structured_contract.py`.

---

## Career Story Reservoir

The consolidation spine of the CV knowledge/inflow layer (migration `20260711h`): the user gives a DUMP — old CVs, pointer docs, a LinkedIn export zip, pasted notes — and Myro builds a comprehensive career profile from it. Three entities:

- **Career Role** (`career_roles`) — a stable role container (company, title, dates, kind). Kills the positional `role_anchor` fragility: stories reference `role_id`, never a list index.
- **Career Story** (`career_stories`) — the first-class parent narrative: one real project/achievement with a STAR narrative (situation/task/action/result), verbatim metrics, skills proven, an embedding, and `inflow_ids` provenance back to the dump entries that produced it. Interview prep reads stories directly.
- **Pointer** — a `cv_points` row with `story_id` set (`role_anchor = "story:{id}"`): one CV-ready phrasing OF a story. A tailored CV is a **projection**: `career_projection` ranks stories against a job's skills, selects with per-role guarantees, composes a `cv_structured`, and writes it through the CV Version Writer Seam as a normal `deterministic` version.

**Inflow ledger** — `cv_dump_entries` is the ONE place every capture surface writes (`kind`: note | file | linkedin; `payload` shape metadata; `processed_at` + `derived_story_ids` forward provenance). `story_ingest` (durable Work Lane, idempotent on entry id) runs `story_extractor` (playbook-grounded, no-fab ADR-0016, verbatim metrics, deterministic role-link verification) and folds near-duplicate stories silently via embedding cosine (`DEDUP_COSINE`).

**Policy (2026-07-11, Shivam):** dump extraction **auto-accepts** into the reservoir — the user curates after (archive-not-delete). This supersedes the 2026-06-24 "every inflow user-confirmed" rule for the dump flow.

Surfaces: `/cv?view=stories` (Stories mode pill on the CV workspace) — profile + dump panel + per-job "Tailor for job". Endpoints: `POST /cv/reservoir/ingest`, `GET /cv/reservoir/profile`, `PATCH /cv/reservoir/stories/{id}`, `POST /cv/reservoir/project`.

---

## CV Artifact

Anything a user downloads or prints that represents their CV — PDF, DOCX, native browser print. Governed by ADR-0020: **every CV Artifact is rendered from what the user previews.** The `PdfPage` sheet (`.cvb-pdf-page`, `components/cv/builder/pdf-page.tsx`) is the canonical document render; `frontend/lib/cv/sheet-pdf.ts` (`exportSheetPdf`) is the single seam through which a sheet becomes a PDF (`POST /cv/export-pdf`, headless Chromium with the test-synced sheet stylesheet). DOCX is the structured projection of the same visible sections (`selectVisibleCV` → `POST /cv/export-docx`).

**Invariants**
- `body_text` is provenance (raw upload extraction for baselines), never render input.
- No plain-text re-parsing renderer may exist. The reportlab `/cv/download-pdf` path was deleted 2026-07-03 after it shipped a user a mangled artifact no surface ever previewed (skills exploded per-line, `₹` → `■`).
- Surfaces without a visible sheet (one-tap `DownloadCVButton`) mount `PdfPage` hidden and export the same DOM — never a different renderer.
- The failure shape is pinned by `backend/tests/test_cv_artifact_golden.py` (₹ survives, skills line stays one line, legacy route stays deleted); preview fidelity by `test_cv_pdf_html.py` (stylesheet + font byte-sync).

---

## Match Read Seam

A persisted match row (`user_job_matches` joined with `jobs`) is the matcher's durable output: deterministic skill overlap, the credibility gate (`match_credibility`), and the LLM 5-axis eval (`llm_ranker`). **Match Eval** (`MatchEval` in `schemas/jobs.py`) is the typed read model for the `user_job_matches` eval columns; `to_job_match` parses each raw row into it before building the `JobMatchResponse`, so the read boundary receives a validated shape instead of re-guessing each field with `.get()`.

**Invariants**
- A field's type is declared **once**. Shared type aliases (e.g. `SeniorityCompat = Literal["compatible","incompatible","unknown"]`) bind the matcher's output (`Credibility`), the `MatchEval` read model, and the `JobMatchResponse` field together — the write side and read side cannot disagree about a field's type. (The bool/str drift on `seniority_compatibility` 500'd `/jobs/matches` + `/home/bootstrap` per-user before this seam existed.)
- `MatchEval` is **tolerant**: every field optional, unknown columns ignored. A newly-added persisted column never narrows the read or 500s the dashboard.
- A *type* mismatch on a known eval field fails at this seam — one clear, tested boundary — not at the per-user response gate in production. The seam is the test surface (`test_job_match_response.py`).
- `to_job_match` is the single reader of a match row. New consumers of match eval go through `MatchEval`, not raw dict `.get()`.

---

## Match Verdict

The single answer to "how good is this match for this user, and what should they do about it" — computed **once, server-side**, read identically by every surface (card number, next-step "best job", `/market` rail) and by ordering. Deepens the Match Read Seam: where `MatchEval` types the raw eval columns and `JobRanking` produces the ranked pool, **Match Verdict** fuses the eval into the user-facing decision. Replaces the pre-2026-07 smear where the headline number was raw `overlap_score`, the "is this strong" rule lived in a frontend filter (`credibleRecommendation`) applied on one surface only, and the number a card showed could contradict the LLM eval that ranked it.

**Shape** (derived on `MatchEval` → surfaced on `JobMatchResponse`)
- `match_score` (0–100) — the ONE fit number. The LLM `overall_score` (0.0–5.0 → 0–100) is the spine; `overlap_score` **gates** it (a job the user has few required skills for cannot read Strong even if the LLM is generous).
- `verdict` — `strong | worth_it | stretch | checking`, from thresholds on `match_score` plus the credibility gate (`seniority_compatibility`, `recommendation`, `is_recommended`). `checking` is the honest provisional state before the async brain runs (`overall_score` null) — the number shows overlap-only and upgrades in place, never a fake-precise final.
- `is_strong` — `verdict == strong`; the boolean that used to be `isCredibleRecommendation` in the frontend.

**Invariants**
- Derived in `to_job_match` (the one match-row reader), never re-computed in the frontend. `frontend/lib/jobs/credible-recommendation.ts` is deleted — a surface asking "is this strong?" reads `is_strong`; "how good?" reads `match_score`; "what verdict?" reads `verdict`.
- **Frontend seam `frontend/lib/jobs/match-verdict.ts` owns every read of the verdict** (Backlog #36 Slice 3): `verdictLabel` (word), `matchFitScore` (the 0–100 number — `match_score ?? overlap_score`, **never** `overall_score`, a 0–5 scale), `verdictMove` (verdict→"what to do"), `strongMatches`/`pickBestMatch` (selection). Both the desktop card adapter (`card-view.ts`) and the mobile row adapter (`mobile/redesign/job-model.ts`) READ these — neither re-derives fit/verdict/move from score bands. The pre-#36 mobile `job-model.ts` was the divergence: it invented verdicts from the fit band (collapsing `strong` into "Worth it", inventing "Long shot") and mixed `overall_score` into the percent.
- **On-open warming is one hook, every surface** (`frontend/lib/hooks/use-match-brain.ts` → `POST /jobs/{id}/brain` → `on_demand.ensure_job_eval`). Desktop `MyroTake` and the mobile `JobDetailSheet` both consume it, so opening a job ANYWHERE warms + caches its verdict — no surface can open a card without rating it.
- **No strong match ≠ empty hand.** When a user has no `strong` verdict, the surface shows the closest real jobs labelled `stretch` plus the 1–2 highest-leverage moves (Practice / CV) that would lift them to `strong` — never fabricated jobs (ADR-0001), never a dead empty state. The honest answer to the fresher-shown-senior-roles relevance pain.
- The primary post-match action is **Tailor & apply** (why-you-fit → tailor the CV to this exact job via the Mentor retriever loop → apply); direct `Apply` stays one tap (never-block, per the CV journey north star).
- The seam is the test surface (`test_job_match_response.py`): thresholds, the overlap gate, and the `checking` provisional path are tested once against `MatchEval` fixtures, not re-tested through each router or re-implemented per frontend surface.

---

## Provisional Match

A persisted match row that carries real deterministic overlap but no brain verdict yet — the shortlist made VISIBLE before the expensive per-job reasoning finishes. Reads as `verdict == "checking"` at the Match Verdict seam, whose number falls back to `overlap_score` and upgrades in place when the eval lands.

Exists because `compute_job_matches` persisted once, at the end, and the run is long: `target_updated_at → last_match_run_at` measured **166s** for a real signup and 190-220s for most recent ones on 2026-08-04. So the onboarding shortlist screen was a spinner for ~3 minutes while a perfectly choosable list already existed in memory.

**Shape** — `ranking.rank(..., on_shortlist=…)` hands the triaged shortlist to its caller; `jobs_workflow.compute_job_matches` persists it through the ordinary `llm_ranker.persist_matches` with `evaluations={}` (that path already wrote verdict-less rows), then upserts the same rows again with the evals.

**Invariants**
- **Handed over AFTER triage, never from the raw overlap pool.** The overlap head contains jobs the brain rejects outright (a banker role scoring overlap on "Communication" for a backend engineer); surfacing those would spend the top slot on something already known to be wrong. Triage is one cheap batched call — the per-job reasoning is the three minutes.
- **`ranking.rank` still writes nothing.** It is "pure compute, no DB writes"; the callback belongs to whoever owns the write. Same shape as the `on_progress` callback it already took.
- **The order the user first saw is PINNED** (`persist_matches(pinned_ranks=…)`). The brain's ranking is better, but a list that reorders under someone mid-read is worse than one that sharpens in place. Accepted cost: a triage-approved job the deep eval later rates poorly keeps its slot and shows a weak verdict honestly. Callers with no shown order to protect (sweep, paid Refresh) pass no pin and rank freely.
- **A provisional row can never be an Agent Pick** — the picks band gates on `STRONG_SCORE` over `overall_score`, so a verdict-less row is structurally ineligible. Asserted, not assumed.
- **The read seam must say it is provisional.** `_shortlist` returns `provisional` (not `ready`) while any row lacks a verdict AND the run is still outstanding — reporting `ready` stopped the client's poll and froze the screen on numbers that were about to change. Once the run has finished, whatever a row still lacks is not coming, so it reads final.

## Journey Position

Where a user is in onboarding — **derived, never stored**. `experience` (nothing started) · `result` (work in flight or done) · `completed` (finished; they belong in the product, not the funnel). One read: `onboarding_service.journey_position`, surfaced by `GET /onboarding/state`.

There used to be two answers. `user_onboarding_state.status` and `.current_stage` were a stored copy written in **thirteen** places and read for a decision in **two**, while `_current_result` derived the same position from the journey's own facts — baseline → `skills_confirmed_at` → target → score → shortlist — and it was the derivation that decided what actually rendered.

**Invariants**
- **`patch_state` REJECTS `status` and `current_stage`.** The copy is not merely unused; the write seam refuses it, so a future caller reaching for the old shape gets a loud error instead of a second answer.
- The facts that are NOT derivable stay columns and earn their place: `upload_job_id` (a job with no baseline yet), generator working state, `entry_mode` (ADR-0006 L7 cohort), `completed_at`, activation + milestone stamps, `checklist_dismissed_at`.
- **Client-only "which screen am I on" is client state**, not server state — the guided generator opens from a URL param. Persisting screen intent is how the second model grew.
- A user with **no row at all** falls out of the same derivation; there is no separate default shape to keep in sync.
- `result_seen_at` is stamped when the result RENDERS. It used to be written by `mark_completed` with the identical timestamp as `completed_at`, which made the first-success checklist row it drives a tautology.
- ⚠️ The stored copy already lied before it was removed: `start_over` reset the stage to `experience` without clearing baseline/skills/target, and the stored answer won for exactly one screen — which is why nobody noticed.

## Upload Progress Stream

One poller, many screens. The app-shell `CVUploadLifecycleObserver` owns the single poll of a CV upload job — it has to, because it survives route changes and resumes a persisted job after a reload — and broadcasts `CV_UPLOAD_PROGRESS_EVENT` / `CV_UPLOAD_TERMINAL_EVENT`. Surfaces subscribe; they do not re-poll.

**Invariants**
- A screen watching a CV upload **subscribes**. `/onboarding/result` used to re-poll the same job, so two requests asked one question for the whole 48-109s analysis — and its own poll was a multi-read assembly. Consumers today: `/cv` (phase + failure code + receipt) and `/onboarding/result` (phase + finish signal).
- Deliberately **not** wrapped in a shared hook: the two consumers want different things, and one interface over both would be as complex as the two call sites it replaced. Extract if a third arrives.
- A subscriber keeps a **slow fallback poll** (15s). The stream is the fast path, not the only path — a stalled observer must not be able to freeze a screen.

---

## Next Best Step

The one state-derived action that moves a candidate through the active job-search loop without describing a completed Main CV as incomplete.

**Ladder**

1. No Main CV → upload a CV.
2. An interview or a due application follow-up → prepare or check in; time-sensitive commitments outrank new work.
3. A saved role with a tailored CV but no confirmed submission → review and apply.
4. A saved role without a tailored CV → tailor the highest-`match_score` saved role.
5. No saved role → find a role to tailor in Jobs.

**Invariants**
- A **Saved Role** is an intended application whether its source is `system_match`, a user save, or an imported job. Source never changes eligibility for tailoring.
- `ApplicationResponse.match_score` is projected from the durable `user_job_matches` evaluation on the Applications read, so Next Best Step does not depend on a warmed feed cache to choose the highest-fit role.
- A confirmed application returns to the remaining saved-role queue when there is no more urgent interview or follow-up. It stays visible in Applications for tracking; it is not silently treated as complete.

---

## JobRanking

The single facade for "given a candidate pool + a targeting profile, produce ranked jobs". `app/services/matching/ranking.py` combines the matcher's two tuned stages so callers never wire them by hand:

1. **Deterministic overlap** — `job_matcher.get_top_matches` (skill overlap + role boost + company cap).
2. **Brain** — `llm_ranker.evaluate_all` (Career-Ops 5-axis + grade + Apply/Negotiate/Skip verdict + legitimacy tier + archetype).

```py
async def rank(profile, cv_markdown, jobs: RankCandidates, *, provider, use_brain=True, budget=None, ...) -> RankResult
async def rank_one(profile, cv_markdown, job, provider) -> eval | None
```

**Invariants**
- `ranking` **delegates, never reimplements** — it calls the same `get_top_matches` + `evaluate_all` in the same order as the old inline duo. Persistence stays in `llm_ranker.persist_matches`; `rank`/`rank_one` write nothing.
- `RankResult.evaluations` is empty when the brain is skipped (`use_brain=False` / `provider is None`) or every eval failed — the deterministic overlap scores still stand alone, so a brain outage degrades to overlap-only matching rather than an empty feed.
- `budget` caps how many of the shortlist reach the brain (cost control). `None` = brain the whole shortlist = the batch-compute behaviour. `rank_one` is the single-job on-demand path (a job opened/saved anywhere) whose result is **cached** into `user_job_matches` — never a per-request LLM call in bulk.
- `RankCandidates.eval_cache_fetcher` (Backlog #36) lets `rank` skip any shortlist job already evaluated for this user — a job is brain-rated **once per `(user, job)`, ever** (permanent identity, migration 20260710), never re-paid on a later compute. Omit it for the old always-eval behaviour.
- `compute_job_matches` (the batch compute — CV upload, paid Refresh, or scrape-triggered sweep) routes through `rank`; the exhausted/refund gates and candidate-id fetching stay in `jobs_workflow` (DB-coupled), unchanged. Its skip gate is **event-driven** (has-ever-matched + nothing-new-since), not calendar-driven.
- **The model floor (F1) is owned inside `compute_job_matches`, not passed by callers.** Every judgment call (triage + eval) runs on `get_judgment_provider()` — the strong-only lane (see **Judgment provider** below). The `llm_provider` arg is a test-only override; no caller can put a small model on a ranking path.
- **`RankCandidates.pool_augmenter`** (standardized matcher) unions the CandidatePool title_filter selector onto the overlap pool *before* triage, keeping `rank` DB-agnostic (the caller supplies the callback). None → overlap-only pool.

## Coin balance

`new_coin_balance` — the ONE rule for every endpoint that can touch the wallet:

> **Present when this operation moved the balance. `null` when it didn't — the
> client keeps the number it already has. An operation that can *never* move the
> balance carries no field at all.**

So every declaration is `int | None` except the ones that always charge or always
credit (`/payments/verify`, `/jobs/analyse/{id}`). Two corollaries, both learned
the hard way:

- **Never default to 0.** Zero paints a wallet the user does not have. Null is
  "unchanged", which is what a free run actually means.
- **Never read the balance back just to fill the field.** A read that reports "the
  same number" is a round trip bought for nothing; it also disguises a no-op as a
  transaction. `POST /upskilling/sets/{id}/submit` did exactly this on every
  submit, for a field the client never read.

`POST /jobs/refresh` is the canonical case: a Myro-initiated run (new inventory
this user has never been matched against) prices at 0, so no charge happens and
the balance is null. Declaring it `int` 500'd every free run in prod
(2026-08-08) — and because the ticket is created and compute dispatched *before*
the response serializes, the run proceeded while the client never learned the
ticket id. Guarded by `test_refresh_free_run_reports_a_null_balance`, which
asserts through the response model, not the dispatch layer underneath it.

## Judgment provider

`llm_provider.get_judgment_provider()` is THE model floor for every LLM call that RANKS / JUDGES / VETS / RECOMMENDS (triage, 5/6-axis eval, verdicts, agent picks). It leads with the strong FREE tiers (gpt-oss-120b, llama-3.3-70b) → strong PAID (gpt-4o-mini, llama-70b) → Groq direct, and **never** falls to a small model: `JUDGMENT_OR_TIERS` is derived by *exclusion* (any OR tier containing gemma/granite/nano/glm-flash drops whole, so a reorder can't leak a 4B model) and Gemini flash-lite is omitted — a total strong-model outage fails the run (→ refund) rather than emitting a confidently-wrong shortlist. Rationale: a weak model's judgment failure is silent (it answers "successfully"); only the model floor catches it. See `feedback_no_cheap_models_judgment` + ADR-0017. Cheap tiers stay valid for *extraction* (CV parse, screenshot OCR) — only judgment is floored.

## Writer floor

`llm_provider.get_writer_provider()` is THE model floor for every LLM call that WRITES prose the user will put on their CV — per-bullet rewrite + variants + stream, intake draft, `place_metric`, whole-CV restructure, job-path tailor polish. Writing a CV bullet is a judgment-grade generation: a small model *truncates* a rich bullet into a fragment instead of synthesizing it (gemma-3-4b turned "Enhanced sales conversion by co-designing AI bots with campaign measurement…" into "Enhanced sales conversion consistency" — the core-loop trust break). So writing is floored the same way judgment is. `WRITER_OR_TIERS = JUDGMENT_OR_TIERS reordered PAID-strong-first` (same small-model exclusion, inherited structurally by derivation — no second list to keep in sync), because the user is watching a blocking spinner and a free-tier queue can't be allowed to stall it. **The floor is owned INSIDE each writing module, not passed by callers** (mirrors "F1 owned inside `compute_job_matches`"): `cv_rewrite` / `cv_intake` / `cv_restructure` take a `provider=None` that resolves `get_writer_provider()` — the arg is a test-only override; no caller can lower the floor. Verdict/classification calls (JD coverage, gap classification) stay on the judgment lane — writing ≠ judging.

## Mentor grounding

`mentor_grounding.assemble(query, user_id, shelf)` is the ONE seam every Mentor writing surface composes to write from: the authored CV playbook (STAR/XYZ/ATS via `mentor_retriever` — the *method*, injected into the prompt, **never surfaced to the user**), the user's OWN verified career stories (`memory_recall` — the truthful raw material), and candidate NUMBERS already present in those stories with provenance (`CandidateMetric`). Reservoir-first: a metric-less bullet is quantified from the user's real history ("your 'Sales bots' story mentions 40%", confirmed before it lands) before it is ever asked for or — never — invented (ADR-0016). Everything is fail-soft: grounding is leverage, never an outage; a surface with no grounding still writes on the static rule. Before this, only `cv_rewrite` assembled grounding, ad-hoc — the two-"Mentor" depth gap users felt. Product rule: **grounding is HOW Myro makes the line great, not WHAT the user sees.** Recruiters care about STAR; the user only cares whether the line is the best it can be, so the card leads with the stronger line + a plain-language reason it wins (their language), and never shows a "grounded in the playbook" badge.

## CV Weave

"Tailor with Mentor" — the draft-first whole-CV tailor for one job (`app/services/cv_weave.py` + `cv_weave_interview.py`, router `/cv/weave/*`; grill locks 2026-07-16, memory `project_tailor_weave_mentor`). Flow: explicit tap → option-driven interview over ONLY the JD asks coverage couldn't prove (candidates mined deterministically from the user's own stories + CV lines — no LLM; free-text fallback; ONE skippable thin-answer probe) → ONE writer-floor weave pass proposes each CV role's 2–4 strongest pointers rewritten against the JD → per-ROLE accept → apply writes the job-tailored `deterministic` version (living master untouched; gap answers bank as global stories via the dump pipeline). Supersedes the per-ask MentorWalk on the playground (append-only, never converged — the walk stays only as the prep room's coverage panel).

**Invariants**
- **Honesty is structural, per role**: a proposed role block must pass `loses_metrics` + `gains_foreign_numbers` (allowed = the user's stories + interview answers) + `loses_substance` over the old lines it claims (`from`/`dropped` accounting — nothing vanishes silently). A failing role falls back to its ORIGINAL bullets, flagged `guarded`; a proposal with zero surviving changes is not delivered (or charged).
- **Money**: flat 50 coins per weave RUN (`CV_WEAVE_XP_COST`), preflight-funded, charged only after a deliverable proposal exists, unique ledger ref per run; the cached proposal (`job_deepenings:cv_weave`) replays free; interview/answer/apply are free.
- **Fingerprint gate**: the proposal records a hash of the master's experience section; apply 409s on mismatch — a draft never lands on a CV it wasn't written for.
- **Coverage reads stories ∪ CV bullets** (`jd_coverage.assess(cv_bullets=…)`, `source: "story"|"cv"`): a line already on the CV can no longer read "Missing" (the Oracle/mit20 trust breach). Embedding-less stories self-heal via `career_reservoir.backfill_missing_embeddings` before mining.

## CandidatePool

The seam that decides WHICH jobs reach the brain (`app/services/matching/candidate_pool.py`). Unions the deterministic selectors so a role-right job reaches triage regardless of how it was found:

1. **skill-overlap** — `get_candidate_job_ids_for_skills` + `get_top_matches` scoring (the caller's overlap pool).
2. **title_filter** (career-ops) — `get_candidate_job_ids_for_roles`: jobs whose TITLE matches the target roles, recall via the index-backed title ilike (`idx_jobs_job_title_trgm`), precision via `_role_match_score` (all tokens of some role present — no fabricated relevance), gated by the same freshness + location rules.

**Invariants**
- Overlap is a **ranking signal inside the pool, no longer the gate**. A title-matched job with zero skill overlap still enters (`merge_triage_pool` reserves up to half the pool for title-only candidates, as zero-overlap rows) and the **strong-model triage — not overlap — does the real selection**. This is the "brain is boss, overlap only cost-bounds" shape.
- `assemble` **fails open** — a title-selector error leaves the overlap pool intact + emits `metric candidate_pool.title_selector_failed`.
- Same seam the semantic retrieval slice (`project_semantic_job_retrieval` Slice 2) unions into later — swap `title_ids` for semantic ids, same merge.

## Match Run

The ONE module every match surface routes through (`app/services/matching/match_run.py`): **compute → Agent Picks regen → fresh-match notification**. Before it, only the scrape sweep did picks + notify; a paid Refresh and the CV-upload initial match computed but left the picks band stale and never notified — so the outputs of a match run drifted per-path. `run_match(repo, user_id, batch_week, *, force, excluded_job_ids, on_progress, notify, regenerate_picks, scrape_batch)` returns the `MatchComputeOutcome` so ticket/dispatch callers read the same shape.

**Invariants**
- Picks + notify are **best-effort side-effects** (guarded, logged) — a failure in either never loses the compute or its outcome.
- `notify=False` where the user watches the reveal live (paid Refresh, onboarding initial); background runs (sweep, future login-confirm async) notify — debounced 12h, so it's spam-safe.
- The **100-coin charge** (`MATCH_RUN_COST`) is a property of a run but lives at the entry seam that owns the wallet + reveal ticket (`job_refresh` charges at dispatch, `_dispatch` refunds on failure). This module owns the WORK, not the charge.
- Callers: `job_refresh/_pipeline` (paid Refresh worker), `cv_workflow` (onboarding initial), `scrape_sweep` (background sweep). Every one now gets identical outputs.

---

## Targeting Brief

The single read for "what Myro knows about what this user wants" — one module (`app/services/matching/targeting.py`) assembles the confirmed `user_profiles` targeting columns AND the `user_memory` fact store (authored + distilled) so no consumer re-assembles its own subset.

**Two constructors, two halves**

- `for_ranking(jobs_repo, user_id)` → `ranking_profile()`: the dict the matcher + Career Ops prompt consume — columns passed through untouched, memory riding as `known_facts` (the key intent-chat established). `llm_ranker.build_system_prompt` renders it as the "What Myro remembers about this candidate" block.
- `for_preflight(db, user_id)` → `preflight()`: the "Refresh your matches" pre-flight manifest (`GET /jobs/refresh/preflight`) — empty fields gap-filled from memory facts (`deal_breakers` ← constraint/work_mode, `career_goal` ← aspiration), with a `prefilled` provenance map and `memory_count`.

**Invariants**

- **Fill-empty-only.** A user-entered column value is never overwritten by memory — even a junk one; the modal is where the user fixes it.
- **Prefill is draft-only.** Silent prefill lands in the modal's staging buffer; persistence happens only through the user's Run/Save action, so the distiller's propose-only lock on profile columns holds.
- **Role titles are the one write vocabulary.** The modal edits human titles; `onboarding_service.role_title_updates(titles)` is the single derivation of the `target_roles` cluster union (shared by `save_target`, intent-chat, and `PUT /users/me/profile` when `target_role_titles` is sent). A surface can no longer desync titles from the matcher read model.
- **Memory is fail-soft.** `list_active` degrades to `[]` (safe_read); a repo without a client (test fakes) carries no facts. Matching never breaks on the memory layer.
- The module is the test surface (`test_targeting_brief.py`): fact→field mapping, the prompt block, and title derivation are tested once, not through each router.

---

## Seniority Eligibility

The deterministic boundary that protects a candidate from implausible job levels
before a job reaches the feed or the Career Ops ranking pool.

**Terms**

- **Target Seniority** — the candidate's durable level preference in
  `user_profiles.target_seniority`: `intern`, `entry`, `mid`, `senior`,
  `lead`, `executive`, or `any`. It is a targeting preference, not a
  per-visit filter.
- **Job Seniority** — the canonical normalized level of a posting. It is
  source-owned and generated prospectively by the scraper from the provider's
  structured level/experience data, title, and JD; Myro may make a
  deterministic compatibility read for incomplete legacy rows but never
  backfills the source table.
- **Eligibility Boundary** — the server-side hard gate that filters
  incompatible jobs before the browse feed, candidate selection, and
  Career-Ops ranking. A client-side filter alone is never sufficient.
- **Stretch Scope** — an explicit, temporary expansion to the next higher
  compatible level. It is opt-in, URL-backed for back-navigation, and never
  admits senior, lead, or executive postings for an intern or entry candidate.

**Default policy**

- Intern and entry candidates receive Intern + Entry postings by default.
- Mid, senior, lead, and executive postings are excluded from those default
  feeds; titles such as Vice President are never a fresher stretch.
- Career Ops ranks and explains jobs only after this boundary. It may rank an
  opted-in adjacent stretch below at-level work, but cannot override the gate.
- Target seniority persists with the candidate profile. Browse state persists
  in the URL so opening a role, navigating back, or reloading does not require
  the candidate to restate their intent.

---

## Career Band Eligibility

The role-family boundary that prevents a candidate from being recommended jobs
from an unrelated career path before a job reaches the feed or Career Ops.

**Terms**

- **Career Band** — one of four broad role families: `engineering_data`,
  `business_product_operations`, `research_people_public_impact`, or
  `design_creative`. It is coarser than the existing controlled
  `role_domain`; `role_domain` remains the detailed functional classification.
- **Primary Career Band** — the candidate's durable default role family. Myro
  derives it from their CV and target-role titles, persists it in the profile,
  and lets the candidate correct it.
- **Explored Career Bands** — zero or more additional role families the
  candidate explicitly enables. They are the only valid cross-band route.
- **Job Career Band** — the deterministic family assigned to a job from its
  source role domain and explicit title signals. A title such as Product
  Designer may take the Design & Creative band even if its detailed role domain
  is Product Management.
- **Career Band Boundary** — the server-side hard gate that admits a posting
  only when its Job Career Band is the Primary Career Band or an explicitly
  Explored Career Band. Unknown bands do not become silent cross-band matches.

**Default policy**

- Existing detailed domains map into the four bands: Engineering & Data
  (software, data, IT, manufacturing); Business, Product & Operations
  (finance, consulting, product, sales, operations, supply chain, risk, general
  management); Research, People & Public Impact (research, HR, legal and
  compliance); and Design & Creative (UX/UI, graphic, visual, content/design).
- A job reaches browse or Career Ops only when it passes both the Career Band
  Boundary and the Seniority Eligibility Boundary.
- When the eligible entry-level pool is thin, Myro reports that inventory truth;
  it does not fill the feed by silently crossing into Engineering or MBA roles.
- Career-band expansion is a deliberate persisted preference. It is not an
  implicit consequence of a search string, skill overlap, or LLM verdict.

---

## FilterSpec

The one structured filter vocabulary for "what jobs to search for". Before it, that intent was expressed three incompatible ways — the NL parser dict, the authed feed's long `feed_jobs(**kwargs)`, and the intent-chat diff. `FilterSpec` (`app/services/matching/filter_spec.py`) is a frozen dataclass every producer maps into and every query surface reads out of.

**Producers** (build a spec): `FilterSpec.from_nl_parse(parsed)` (landing NL search), `from_intent_diff(diff)` (Delta-4 intent chat), `from_memory(facts)` (Phase-2 distilled `user_memory`).

**Consumers** (map a spec to the tuned SQL): `public_kwargs()` → `public_job_query`, `feed_kwargs()` → `feed_jobs` (query dimensions only), `company_drill_kwargs()` → `search_jobs_by_filters`.

**Invariants**
- A field is **not a filter until a mapper hands it to a method that understands it**. `seniority` / `salary` are targeting/memory facts the feed SQL takes no param for, so `feed_kwargs` simply omits them — the spec can carry more than any one surface consumes.
- `location_prefs` distinguishes `None` (unset) from `()` (explicit-empty) because `build_location_scope` treats them the same but the browse-scope branches deliberately pass `[]`; the mapper preserves the distinction.
- Producers **canonicalise vocabulary once**: `work_mode` → `location_mode`, mode validated against `{remote,hybrid,onsite}`, blanks dropped. Downstream never re-validates.

## JobQuery

The resolver that runs a `FilterSpec` against a jobs repository (`app/services/matching/job_query.py`). Thin call adapter — `public` / `feed` / `company_drill` each map a spec (plus, for `feed`, the injected user-context: CV skill keys, target roles, draining-queue exclusions, follow set) onto the exact keyword call the repo already exposes, then return its raw result dict.

**Invariants**
- `JobQuery` **delegates, never rewrites** — `feed_jobs` / `public_job_query` / `search_jobs_by_filters` stay the single home of the query SQL. The routers became adapters (build a spec → resolve); the tuned SQL is byte-for-byte the same call.
- The **spec stays a pure, cacheable description** of the user-expressed search; per-request personal context is injected at `JobQuery.feed` time, not carried on the spec.

---

## Company Recommendation

The single rule for "which other companies to suggest from a company surface" — `pickRelatedCompanies(all, current, limit)` in `frontend/lib/companies/related.ts`. Pure and deterministic: same-industry peers first (ranked by open-role count desc), then a fixed alphabetical-ring backbone.

**Invariants**
- **One rule, two adapters** — the public company page (`RelatedCompanies` server block) and the logged-in `CompanyDrawer` both delegate here, so anon and authenticated surfaces recommend identically. Never inline a second selection.
- **The backbone guarantees the crawl mesh** — every company always emits ≥6 alphabetical-ring links, so every company receives ≥6 inbound links (no crawl-orphan) regardless of industry data. Industry-first ordering must never drop the backbone.
- Reads `industry` straight off `analytics.by_company[]` — no separate industry fetch.

---

## Generative Text Stream

The one seam for typing an LLM answer at a user over SSE (ADR-0009). `services/text_stream.py` owns the token/done/error envelope, the "never swap provider mid-stream" rule, the empty-stream guard, the typewriter cache replay, and the charge-only-on-`done` hook. Every live-text surface — why-you-fit (`analyse`), deepeners (`deepen`), per-bullet Mentor rewrite (`/cv/rewrite-bullet/stream`) — is a thin caller: build messages, pass a `finalize` closure, return `text_stream.response(...)`. Before this, `analyse` and `deepen` each hand-inlined a byte-identical copy of the envelope + loop + charge logic, and rewrite didn't stream at all (a blocking `complete()` behind a dead spinner).

**Two ways in**
- `live(provider, messages, *, max_tokens, finalize)` — stream a fresh answer; `finalize(full_text)` runs once after a complete stream and returns the `done` payload (where a caller charges + persists). It may raise `StreamAbort(message, recoverable)` to end on `error` instead — nothing was charged.
- `replay(text, *, done=…)` — re-type already-paid text (idempotent cache hit); no provider, no charge.

**Invariants**
- `finalize` runs only after a non-empty stream. A provider failure or an empty stream ends on `error{recoverable:true}` and `finalize` never runs — so a caller that charges inside `finalize` never charges a failed stream (charge-on-success, ADR-0004).
- The provider ladder (A→B→C) resolves pre-first-token only; once a `token` is emitted the provider is committed. A mid-stream death is `error{recoverable:true}`, never a silent swap (`LLMProvider.stream_complete`).
- A terminal-with-no-prose result (the no-fabrication `question`, or a pre-stream error) is a single `one(...)` frame — no token stream.
- `response()` sets `X-Accel-Buffering: no` so an intermediary can't buffer the whole stream and deliver it at once (which would look like a blocking load despite streaming).
- The module is the test surface (`test_text_stream.py`) — the envelope is tested once against a fake provider, not re-tested through each router.

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
- **fast** — a user is staring at a loading screen: CV upload parse+score, paid Job Refresh, **the initial match-compute** (the onboarding result screen polls for its shortlist every 2.5s — the most-watched job in the product), **CV layout enrichment** (`cv_structured_enrich`: the user is not blocked on it, but the CV playground where onboarding ends is).
- **bulk** — nobody is waiting: skill-edit re-tag.

The lane is a claim about **whether someone is waiting**, not about how heavy the work is. Filing a watched job under bulk is how it ends up behind an unwatched queue — which is exactly what put the layout parse, and briefly the initial match, on the wrong side of a user's spinner.

A Job Runner listens to lanes in priority order `[fast, bulk]` — RQ pops fast first, only touching bulk when fast is empty. A flood of bulk work can never delay a waiting user.

## Job Runner

A worker process (separate from the web process) that consumes Work Lanes fast-first. Run **2** for redundancy — one keeps serving while the other restarts/deploys. Each Runner caps its own in-flight jobs low; the true provider ceiling is the **Provider Budget**, not the per-Runner cap. Entry point `app/workers/jobs_compute_worker.py`, generalised from the job-refresh-only worker.

**Retry policy** — 3 retries with growing backoff (~5s/15s/45s) on TRANSIENT failure only (provider-unavailable, 429 rate-limit, timeout, network). PERMANENT failures (no skills, scanned/short PDF, taxonomy-unmapped) fail fast + refund immediately with no retry.

## Provider Budget

A single global ceiling on concurrent LLM calls, shared across all Job Runners and web requests — a Redis token bucket. A caller must take a token before calling the provider and returns it after. Total in-flight provider calls stay bounded no matter how many Job Runners exist, so scaling Runners for reliability never raises 429 risk. Lives behind `LLMProvider.complete` — every LLM caller (parse, score, polish, rank, vision) inherits it unchanged. Paired with rate-limit-aware retry+backoff inside `complete` (classify 429/5xx/timeout vs hard-fail; honour `Retry-After`).

## Overload Policy

Uploads are never rejected for load (your "never fail an upload" rule). At peak the durable rail absorbs the spike; the loading screen surfaces honest backpressure ("high demand — still working, you're in line"), feeding the >90s honest-copy state of the CV-loading redesign. Charge stays at enqueue; refund only on terminal failure after retries.

## Listing Verification

Whether a job we surface still exists. Two triggers, one truth — every verdict lands in the same `jobs` transition (`listing_confidence` · `last_verified_live_at` · quarantine/retire ladder), so the surface never has to ask which path checked it.

- **Drain sweep** — background belt over the whole corpus. Claims work via `claim_verify_targets`, which selects the oldest-unchecked rows and stamps `last_verification_attempt_at` in the *same* statement under `FOR UPDATE SKIP LOCKED`. Claim-on-read is what makes a crashed sweep cost one batch instead of re-serving the same rows forever, and `NULLS FIRST` ordering keeps the never-checked tail draining ahead of any re-check. The queue is **confidence-agnostic**: a row marked `active` re-enters once stale, because a queue scoped to low-confidence rows lets verified listings decay invisibly.
- **Intent gate** (`app/services/job_liveness.py`) — jumps the queue for the single listing a user is about to act on (open / apply), cached ~6h. This is where a ghost actually costs someone effort, so it is checked at that moment rather than on a calendar. Volume is user-actions/day, not corpus size.

**`unknown` is a first-class verdict.** A 401/403/429/timeout from an ATS is not evidence a role is gone; it resolves to `unknown` and the surface discloses "couldn't check". Only real closure evidence (404/410, explicit closed-marker copy) may read as `closed`.

**Liveness is not freshness.** `last_seen` records when the scraper last *ingested* a row, not when anyone confirmed it exists — while the scraper does not re-crawl, `last_seen` carries no liveness information at all and must not be rendered as if it does.
