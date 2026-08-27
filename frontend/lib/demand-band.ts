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
 * Band for a skill's demand across the WHOLE tracked-job corpus.
 * Used only by `scripts/gen-taxonomy-artifacts.ts` for the /taxonomy
 * in-demand tier. Personal skill-path demand lives on GET /career-skill-path
 * and is never derived from a job-count heuristic in the client.
 */
export function bandFromCorpusJobCount(jobCount: number): DemandBand {
  if (jobCount >= 200) return "very_high"
  if (jobCount >= 100) return "high"
  if (jobCount >= 50) return "moderate"
  if (jobCount >= 20) return "low"
  return "none"
}

