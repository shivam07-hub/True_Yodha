/**
 * Rate presentation for the Ghost Job Index.
 *
 * Extracted from the report component because these two functions are the only
 * place a number becomes a claim about a named employer, and that deserves a
 * test rather than a reviewer's eye.
 */

export type RateBand = "high" | "mid" | "low" | "none"

/** Severity band for the status marker. A published rate always has >= 20
 *  jointly-observed listings behind it; `none` is a withheld rate. */
export function rateBand(rate: number | null): RateBand {
  if (rate === null) return "none"
  if (rate >= 0.5) return "high"
  if (rate >= 0.2) return "mid"
  return "low"
}

/**
 * A rate never rounds INTO a boundary it did not reach.
 *
 * CRISIL is 515 of 517 — 99.6% — and `Math.round` printed "100%" beside that
 * same row's "2 ads pulled", which is a contradiction next to a company's name.
 * 100% and 0% are reserved for exactly 100% and exactly 0%; everything else is
 * clamped into 1..99.
 */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—"
  if (rate === 1) return "100%"
  if (rate === 0) return "0%"
  return `${Math.min(99, Math.max(1, Math.round(rate * 100)))}%`
}

/** Day counts carry their unit; a withheld median renders as a null cell. */
export function formatDays(value: number | null): string {
  return value === null ? "—" : `${value}d`
}
