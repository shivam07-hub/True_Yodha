/**
 * Display mapping for skill demand bands. The band value itself is computed
 * backend-side (percentile of weighted_demand) — see jobs_workflow.py — so this
 * file is presentation only. Single source of truth for the band lives on the
 * server; this only decides how each band reads + colours.
 */

import type { DemandBand } from "@/lib/api"

interface BandDisplay {
  label: string
  /** Tier token family reused for colour, so the badge matches the design system. */
  tone: "strong" | "building" | "gap" | "muted"
}

const BAND_DISPLAY: Record<DemandBand, BandDisplay> = {
  very_high: { label: "VERY HIGH DEMAND", tone: "strong" },
  high: { label: "HIGH DEMAND", tone: "strong" },
  moderate: { label: "IN DEMAND", tone: "building" },
  low: { label: "SOME DEMAND", tone: "building" },
  none: { label: "", tone: "muted" },
}

export function demandBandDisplay(band: DemandBand | undefined): BandDisplay | null {
  if (!band || band === "none") return null
  return BAND_DISPLAY[band]
}

/**
 * Fallback band for gap skills sourced from job gaps (no backend weighted_demand
 * band). Derives a coarse band from how many target jobs want it.
 */
export function bandFromJobCount(jobCount: number): DemandBand {
  if (jobCount >= 5) return "very_high"
  if (jobCount >= 3) return "high"
  if (jobCount >= 1) return "moderate"
  return "none"
}
