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

**Surfaces consuming the hook**

- Mobile top widget: `<ForgeXpPill />` (always-visible, compact 30px).
- Desktop sidebar: `<SidebarForgeTimer />` (104px ring, decorative ticks, shown only when `sessionActive`).
- Forge page: `app/forge/page.tsx` (full dial, skills picker, claim controls).

Adding a fourth surface (PWA push, watch face, embedded widget) is one adapter, no engine change.

---

## CV Version Writer Seam

`CVVersionsRepository.create(spec: CVVersionWriteSpec)` is the single seam through which CV Versions enter the database. Every endpoint that produces a version — upload, save playground, polish, edit — reduces to building a spec and calling this method. The repository owns:

- Computing the next `user_version_number`.
- Propagating `baseline_version_id` from the parent.
- Enforcing invariants: `kind` ↔ `job_id` consistency, parent ownership, baseline-required-on-derivative.
- Snapshot hash, default title, timestamps.

Endpoints never write to `cv_versions` directly. If a new flow needs to create a version, it goes through the spec.
