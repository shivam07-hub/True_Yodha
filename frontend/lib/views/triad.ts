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
} as const satisfies Record<string, TriadView>

export type TriadPage = keyof typeof TRIAD_DEFAULTS

/** localStorage key namespace. */
export function triadStorageKey(page: TriadPage): string {
  return `tm.view.${page}`
}
