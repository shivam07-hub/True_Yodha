# ADR 0019 — View-triad labels are per-page; semantics stay canonical

**Status:** Accepted
**Date:** 2026-06-07
**Supersedes:** the *label-uniformity* clause of ADR-0003 (the rule that the three triad views carry one user-facing string each, app-wide). ADR-0003's **semantics** (Intel / Map / Audit) and its sticky-pref + page-default machinery remain in force.
**Related:** ADR-0003 (view triad), `memory/project_intel_map_audit_pattern.md`, `memory/project_skill_intel_redesign.md`, nav job-feed redesign (2026-06-01)

---

## Context

ADR-0003 (2026-05-23) made **Intel / Map / Audit** the canonical 3-view triad and asserted *"The terms are reserved ubiquitous-language — backend, frontend, and design all use these strings verbatim."* One vocabulary, one component (`<ViewTriadToggle>` + `useTriadView`), one learning cost.

**What actually happened in the code (grounded, 2026-06-07):**

1. **The shared primitive has near-zero adoption.** `grep` for `ViewTriadToggle` / `useTriadView` across `frontend/`:
   - `components/ui/view-triad-toggle.tsx` (the definition itself)
   - `lib/hooks/use-results-sort.ts` — only *mirrors the pattern* in a comment; does not render the component.
   - **No page mounts `<ViewTriadToggle>`.** Skills/Practice rolls a **bespoke** `PracticeViewToggle` (`components/skills/practice-view-toggle.tsx`, labels Practice/Map/Audit). CV, Tracker, and Home never adopted the triad component at all. ADR-0003's Phases 2–5 (Skills rewire, CV, Tracker, Home) **never shipped**.

2. **The `intel` label drifted.** `lib/views/triad.ts` now has `TRIAD.intel.label = "Live Job Data"`. That string is the **`/market` nav label** (job-feed redesign, 2026-06-01 — see `lib/nav-items.ts`) and appears hardcoded in 11 files (market, myro, tokens, newsletter, top-nav, footer, cv pipeline, playground, nav-items, YourMoveCard, triad.ts). The triad's `intel` *semantic* (signal density — high-throughput lists) got conflated with one specific surface (the public job-data feed).

3. **The graph confirms these are different concepts.** `graphify-out/GRAPH_REPORT_frontend.md` (940 nodes · 50 communities) detects `components/public/intel` as a **separate community** from `components/skills` and `app/(authed)/forge`. The "intel = Live Job Data" surface and the "intel = your skills list" surface are structurally distinct in the codebase — so a single global label for the `intel` view cannot be correct on both.

**The trigger.** The Skill-Intelligence redesign (`project_skill_intel_redesign`, commit `74ee48a`) needs to restore the triad on `/forge` (its first view = the user's **skills list**). Wiring it to the shared component would render that tab as **"Live Job Data"** — wrong. ADR-0003's own "What this preserves" section bet on a single label per view; that bet is the thing breaking.

## Decision

**The three triad view *keys* (`intel` / `map` / `audit`) and their *semantics* stay canonical and immutable. The user-facing *label* for each view becomes per-page, resolved through a label map.**

1. **Semantics unchanged.** `intel` = signal density (high-throughput lists, deltas). `map` = spatial layout (radar, heatmap, graph). `audit` = evidence walkthrough. These are reserved ENG/internal ubiquitous language — backend identifiers, query keys, `localStorage["tm.view.{page}"]`, issue text all use `intel`/`map`/`audit` verbatim.

2. **Labels are per-page.** `lib/views/triad.ts` splits the per-view record: keep `key` + `glyph` + `meaning`; move the human string to a resolver `triadLabel(page, view)` backed by a `TRIAD_PAGE_LABELS` map with a sensible default per view. A page declares only the labels where it diverges from the default.

3. **Seed labels (extensible):**

   | page    | intel          | map   | audit  |
   | ------- | -------------- | ----- | ------ |
   | default | Intel          | Map   | Audit  |
   | skills  | **Skills**     | Map   | Audit  |
   | market  | **Live Job Data** | Map | Audit |
   | home    | **Live Job Data** | Map | Audit |
   | cv      | Versions       | Map   | Audit  |
   | tracker | Pipeline       | Map   | Audit  |

   (Only the seed `skills` + `market`/`home` rows are load-bearing today; the rest are placeholders for the deferred CV/Tracker/Home migrations.)

4. **The shared component becomes the one true toggle.** `<ViewTriadToggle page=… />` reads `triadLabel(page, view)`. The bespoke `PracticeViewToggle` is retired; `/forge` rewires to `useTriadView("skills")`. This is what finally makes the shared primitive adoptable — label rigidity was the thing blocking adoption, not the component.

## Considered Options

- **A — Keep one global label per view (status quo ADR-0003).** Rejected: mislabels the Skills list as "Live Job Data". The premise is already violated in code.
- **B — Per-page label resolver, keys/semantics canonical (accepted).** Preserves the one-vocabulary win for ENG while letting each surface read true to its content. Minimal churn; makes the dead shared component usable.
- **C — Drop the triad, let every page name its own views.** Rejected: throws away the conceptual-integrity goal of ADR-0003; re-pays the learning cost N times; the semantics *are* sound.
- **D — Rename the `intel` key to something neutral.** Rejected: the key/semantic is fine; only the *label* is page-dependent. Renaming the key churns backend + storage + the other surfaces for no gain.

## Consequences

- **Honors Brooks conceptual integrity at the right layer:** one *semantic* vocabulary (immutable), many *labels* (surface-true). ENG and Design still speak `intel/map/audit`; users read words that match what they see.
- **Unblocks the Skills triad restore** (`project_skill_intel_redesign` — bespoke `PracticeViewToggle` → `useTriadView("skills")`, intel tab = "Skills").
- **Pays down ADR-0003 adoption debt:** the shared component finally has a real consumer; CV/Tracker/Home migrations can follow against one toggle.
- **Design-over-words:** the label *is* the affordance; no helper text restating what a tab shows.

## Migration plan

1. **This ADR + `triad.ts` refactor** — split label from semantic, add `TRIAD_PAGE_LABELS` + `triadLabel(page, view)`, update `<ViewTriadToggle>` to resolve per-page. Seed the table above.
2. **Skills/Practice rewire** — replace `PracticeViewToggle` with `<ViewTriadToggle page="skills">` + `useTriadView("skills")`; delete the bespoke toggle. (Note: the forge dial still leads the intel view body per `project_skill_intel_redesign` — that's a layout choice, not a triad concern.)
3. **CV / Tracker / Home** — adopt the shared toggle as each surface is next touched (unchanged from ADR-0003's phased intent).

## What this is NOT

- Not a change to the triad semantics, defaults map, or sticky-pref storage — those are ADR-0003 and stand.
- Not a routing change — `?view=` remains an additive concern.
- Note: ADRs 0010/0011/0012 cite "ADR-0003 (page-scoped CSS)" — a stale mis-citation unrelated to the view triad. This ADR does not touch that; it supersedes only the triad's label-uniformity clause.
