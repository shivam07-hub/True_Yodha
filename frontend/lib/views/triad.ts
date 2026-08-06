/**
 * Myro view triad — Intel / Map / Audit.
 *
 * Canonical 3-view pattern applied across Skills, CV, Tracker, Home.
 * Backend, frontend, and design must use these terms verbatim — this
 * file is the single source of truth.
 *
 * See: docs/adr/0003-view-triad-intel-map-audit.md
 *      memory: project_intel_map_audit_pattern.md
 */

export type TriadView = "intel" | "map" | "audit"

export interface TriadSemantics {
  /** Stable identifier. */
  key: TriadView
  /** Capitalized label shown to user. Do NOT translate per-page. */
  label: string
  /** Glyph used in segmented toggles. */
  glyph: string
  /** One-line semantic. Display in tooltip / aria-label. */
  meaning: string
}

/** Canonical semantic per view. Keep terse — these strings ship. */
export const TRIAD: Record<TriadView, TriadSemantics> = {
  intel: {
    key: "intel",
    // Default label only. The user-facing label is per-page — see
    // TRIAD_PAGE_LABELS + triadLabel(). ADR-0019: one canonical semantic key,
    // many surface labels.
    label: "Intel",
    glyph: "⊞",
    meaning: "Signal density — high-throughput lists, deltas, leaderboards.",
  },
  map: {
    key: "map",
    label: "Map",
    glyph: "⬡",
    meaning: "Spatial layout — relationships between entities (heatmap, radar, graph).",
  },
  audit: {
    key: "audit",
    label: "Audit",
    glyph: "◈",
    meaning: "Evidence walkthrough — one-by-one proof, lineage, verification.",
  },
}

export const TRIAD_ORDER: TriadView[] = ["intel", "map", "audit"]

/**
 * Page-level defaults. Pages declare which view leads when the user
 * arrives fresh. Sticky per-user pref overrides at runtime.
 */
export const TRIAD_DEFAULTS = {
  skills: "intel",
  cv:     "map",
  tracker: "audit",
  home:   "intel",
  market: "intel",
} as const satisfies Record<string, TriadView>

export type TriadPage = keyof typeof TRIAD_DEFAULTS

/**
 * Per-page user-facing labels (ADR-0019). The triad KEY + SEMANTIC are
 * canonical/immutable; only the displayed string varies by surface, because the
 * same `intel` semantic reads as "Skills" on /practice and "Live Job Data" on
 * /market. A page lists only the views where it diverges from the default.
 */
export const TRIAD_PAGE_LABELS: Partial<Record<TriadPage, Partial<Record<TriadView, string>>>> = {
  skills:  { intel: "Skills" },
  market:  { intel: "Live Job Data" },
  home:    { intel: "Live Job Data" },
  cv:      { intel: "Versions" },
  tracker: { intel: "Pipeline" },
}

/** Resolve the label for a view on a given page: page override → canonical default. */
export function triadLabel(page: TriadPage, view: TriadView): string {
  return TRIAD_PAGE_LABELS[page]?.[view] ?? TRIAD[view].label
}

/**
 * Per-page persistence policy (ADR-0019). Triad views are modes of looking at
 * the same data, not destinations — so a bare visit should land on the page's
 * primary job, not wherever the user last wandered. Pages whose view is a
 * transient navigational position opt OUT of sticky. Explicit URL params always
 * win regardless. Default = sticky (ADR-0003 behavior preserved).
 */
export const TRIAD_STICKY: Record<TriadPage, boolean> = {
  skills: false, // URL-driven on /practice; primary job (Skills) leads every visit
  cv: true,
  tracker: true,
  home: true,
  market: true,
}

/** localStorage key namespace. */
export function triadStorageKey(page: TriadPage): string {
  return `tm.view.${page}`
}
