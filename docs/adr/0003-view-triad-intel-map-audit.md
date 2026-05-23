# ADR 0003 — View triad: Intel / Map / Audit

**Status:** Accepted
**Date:** 2026-05-23
**Context:** Saturday-morning mobile audit (image 10 / image 8 reading-fatigue findings). Skills page already implements an Intel / Map / Audit segmented control. Other surfaces (Home, CV, Tracker, Market) each invented their own view vocabulary, so the same conceptual switch costs the user a re-learn on every page.

## Decision

Adopt **Intel / Map / Audit** as the canonical 3-view triad across every primary page in Myro. The terms are reserved ubiquitous-language — backend, frontend, and design all use these strings verbatim.

### Semantics

| View   | Meaning                                                                 | Examples                                                |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Intel  | **Signal density.** High-throughput lists, deltas, leaderboards.        | Top Movers; Skills list; today's diary entries.         |
| Map    | **Spatial layout.** Relationships between entities.                     | Skills × Company heatmap; domain radar; commit graph.   |
| Audit  | **Evidence walkthrough.** One-by-one proof, lineage, verification.      | Skill evidence audit; CV bullet provenance; ATS audit.  |

### Defaults

Pages declare which view leads when the user arrives fresh. Defaults live in `lib/views/triad.ts`:

| Page    | Default view |
| ------- | ------------ |
| Skills  | Intel        |
| CV      | Map          |
| Tracker | Audit        |
| Home    | Intel        |

A sticky per-user preference (localStorage key `tm.view.{page}`) overrides the default at runtime. URL params can be wired later as a separate concern.

### Shared primitives

- `lib/views/triad.ts` — `TriadView` type, `TRIAD` semantics map, `TRIAD_DEFAULTS`, `triadStorageKey()`. Single source of truth.
- `components/ui/view-triad-toggle.tsx` — `<ViewTriadToggle page value onChange />` segmented control + `useTriadView(page)` hook for sticky persistence.

## Why this preserves conceptual integrity

Per Brooks (*The Design of Design*), conceptual integrity is the most important attribute of a usable system. Three reasons this matters here:

1. **One vocabulary, one learning cost.** A user who learns Intel on Skills should recognize Intel on Tracker without instruction. The current state — bespoke view labels per page — pays the learning cost N times.
2. **One toggle component.** A bug fix or accessibility improvement to the triad toggle propagates to every page. Today's mobile audit found inconsistent ellipsis thresholds, inconsistent active-state colors, and sticky-position bugs that would have been impossible if a single component owned the chrome.
3. **Backend, frontend, design speak the same words.** When Eng files an issue against "the audit view," PM and Design know exactly which surface and which semantic they mean. No translation layer.

## What this is NOT

- Not a layout primitive. Pages still own their own grid / sidebar / hero. Triad governs which *content mode* is visible inside the page body.
- Not a routing change. URL params (`?view=`) are an additive concern; this ADR only defines the vocabulary and persistence layer.
- Not a backend contract. The triad is purely a frontend / UX concern. Backend endpoints serve the same data regardless of view.

## Migration plan

Phased rollout so each page redesign can be reviewed independently:

1. **Phase 1 (this ADR — shipped).** Foundation only: types, toggle component, ADR. No page rewrites.
2. **Phase 2 — Skills page.** Audit the existing Intel/Map/Audit implementation against the canonical semantics. Replace bespoke `view` state with `useTriadView("skills")`.
3. **Phase 3 — CV page.** Repurpose existing baseline / playground / PDF views into Intel (version list) / Map (commit graph) / Audit (ATS audit).
4. **Phase 4 — Tracker page.** Define Intel = open pipeline list, Map = stage funnel, Audit = per-application history.
5. **Phase 5 — Home (Mission Control).** Define Intel = next moves, Map = score radar, Audit = recent diary evidence.

Each phase ships as its own PR. Each PR must update CONTEXT.md if it introduces new domain terms.

## Open questions for follow-up

- Should the toggle default to compact (glyph-only) on mobile to reclaim horizontal space? Probably yes — defer until Phase 2.
- Does Tracker need a fourth view (Inbox / triage)? If so, we have a vocabulary problem to resolve before Phase 4.
- URL deep-linking (`?view=intel`) is intentionally out of scope here. File a separate ADR if/when product wants shareable view URLs.
