# ADR-0011 — Loading Model (which loader for which kind of wait)

- **Status**: Accepted (CV-upload phases shipped; /home section-readiness PR1 shipped; teal-field fill PR2 shipped 2026-06-01)
- **Date**: 2026-06-01
- **Related**: ADR-0008 (durable background work — server jobs run on a separate worker) · ADR-0009 (progress-stream protocol — live token/phase/progress over SSE) · ADR-0003 (page-scoped CSS) · `project_cv_loading_redesign` (server phases, no lying clock) · `project_dashboard_loading_redesign` (parallel client queries, section readiness, teal-field playground)

## Context

Myro has accumulated several user-facing waits, and they were each getting a bespoke loader with no shared theory of *why* that shape was right. Two concrete failures forced the question:

1. **CV upload** showed a fake "20–30s" countdown that lied — the work is a sequential server job whose real duration is unknown, so any clock is a guess. (`project_cv_loading_redesign`.)
2. **`/home`** showed a generic "Loading your dashboard…" gate plus a "FIRST CV IN 10 min" first-run pill flashed at a 16k-XP veteran. The root cause: `/home` is **parallel client queries**, but it was modelled as a single blocking phase — one global gate strangling a set of regions that resolve independently. (`project_dashboard_loading_redesign`.)

The two waits are fundamentally different shapes, and treating them the same is what produced both lies. We need one decision rule, not one loader.

## Decision

**The loader follows the shape of the work. Three kinds, three models.**

| Kind of wait | Truthful structure | Model | Surfaces |
|---|---|---|---|
| **Sequential server job** (one process, ordered stages, unknown total time) | discrete phases the server actually passes through | **Phases** — narrate the *current real phase*, live-elapsed, **never an estimate** | CV upload (Reading → Scoring → Ready), match-refresh, skill-edit recompute |
| **Parallel client queries** (N independent fetches, each resolves on its own clock) | per-region readiness; there is no global sequence to narrate | **Section-readiness** — each region paints when *its own* query resolves; no global gate; per-section ~6s slow tail; no happy-path narration | `/home` (Hero/Banner + Jobs feed) |
| **Destination unknown** (can't pick a layout yet) | nothing to skeleton — the layout itself is the pending decision | **Full-bleed ambient field** — alive-and-working, no fake skeleton | OAuth callback (`/home` vs `/welcome` after token exchange) |

Two cross-cutting rules sit on top:

**A. Truth over comfort.** A loader may say *what is happening now* (current phase) or *that a wait is genuinely slow* (after a fixed threshold, non-shaming) — never *how long it will take* and never a happy-path narration the user didn't need. The 2-tier 3s/8s "stuck" machine and the 20–30s clock are both retired for this reason.

**B. The "fill" is a teal-edge field, not a grey shimmer.** Wherever a region is waiting, the placeholder is rendered as a **real-shape skeleton card** (reuses the live classes → zero reflow) floating over a shared **`<TealField>`** primitive: an inset teal rim plus ~10 faint particles that drift on their own and bend toward pointer/finger. It is ambient and reactive but has no goal, score, or win-state — lively to watch, harmless to abandon. One primitive, two modes:

- `mode="full-bleed"` — the destination-unknown loader (exported as `EdgeGlow`, OAuth call site unchanged).
- `mode="masked"` — backdrop behind a section's real-shape skeleton; the field recedes per section as each query resolves and its card crossfades to real content.

### Perf / a11y contract for the field (load-bearing)

This is a reactive animation on a hot path, so the rules are strict and tested (`components/loading/field-motion.ts` is a headless, dependency-injected engine so teardown is unit-provable):

- **transform/opacity only.** Pointer/touch events only stash the latest position; *all* DOM writes happen in **one rAF tick per frame** — input is coalesced, never per-event.
- **Mounts only while a section loads. Hard teardown on ready:** unmount removes every listener and cancels the rAF. A reactive loader still ticking after content paints is a battery bug — the engine's `stop()` is idempotent and a frame queued before stop never re-arms.
- **Paused on tab blur** (visibilitychange).
- **~8–12 particles, DOM/SVG not canvas.**
- **`prefers-reduced-motion` → static teal rim only** — no particles, no reactivity (the original passive `EdgeGlow` pulse).

## Why not the alternatives

- **One universal loader for everything.** Rejected — it is exactly what produced the two lies. A parallel-query page narrated as a sequence gates on its slowest fetch; a server job rendered as independent sections has no real sections to show.
- **Phases for `/home`.** Rejected — there is no server sequence; the queries are parallel. Inventing phases means inventing an order that doesn't exist.
- **Estimated time remaining anywhere.** Rejected — server-job duration is genuinely unknown (LLM provider chain latency varies wildly), so any number is a lie. Live-elapsed + current-phase is the truthful substitute.
- **Grey shimmer fill.** Rejected per `project_dashboard_loading_redesign` Q5+ — replaced by the teal-field so the wait is lively without being a blocking spinner.
- **Full-bleed teal until *all* sections ready.** Rejected (Q7-B) — it hides already-loaded data behind the field and rewards the slowest section. The field is `masked` per section so a fast score card goes solid while a slow jobs card stays a lively panel.
- **Canvas particle system / gyro tilt.** Rejected — canvas adds a paint surface and DPR cost; gyro triggers an iOS permission prompt on a loader (creepy + friction). DOM transforms + pointer/touch + idle drift only.

## Consequences

- One mental model: *look at the shape of the wait, pick the row in the table.* New waits don't get a bespoke loader.
- `<TealField>` is the single source for the teal motif — OAuth inherits the liveliness for free and the motif can't drift between surfaces.
- The field's perf contract is enforceable in CI: `field-motion.ts` runs headless in Node with fake deps, so "no listener/rAF leak after teardown" is a unit test, not a manual battery check.
- Section-readiness composes: `SectionGate` wraps each region; each section owns its co-located real-shape skeleton (no central skeleton to orphan). Adding a `/home` region = one more gate, not a rewrite of a global gate.

## Status notes

- CV-upload phases: shipped (`project_cv_loading_redesign`, `cv_upload_jobs.current_phase`).
- `/home` section-readiness + pill-bug fix: shipped (PR1, `project_dashboard_loading_redesign`).
- `<TealField>` reactive playground + `EdgeGlow` refactor: shipped (PR2, 2026-06-01).
- Match-refresh / skill-edit already stream phases via ADR-0009; they sit in the **Phases** row and need no change here.
