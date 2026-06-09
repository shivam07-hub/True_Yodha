/**
 * Page-fill estimate for the CV playground (DESIGN_cv_playground_redesign §5).
 *
 * The "ideal one-page CV" is modelled as a deterministic LINE BUDGET, not a
 * pixel measurement of the dark on-screen preview (whose typography differs from
 * the exported PDF). A line budget is honest, browser-free testable, and is the
 * `ideal_cv_spec` metadata the redesign asked for. The meter it drives is a SOFT
 * signal + soft export block (never a hard trap), per the locked decision.
 *
 * Exact pagination remains the exported PDF's job — this is an estimate that
 * moves monotonically as the user includes/excludes bullets.
 */

/** Metadata describing the target one-page CV. Defaults; later per-template. */
export const IDEAL_CV_SPEC = {
  page: "A4" as const,
  fontPt: 10.5,
  marginsIn: 0.6,
  /** Approx. characters per line on A4 printable width at 10.5pt. */
  charsPerLine: 98,
  /** Approx. usable body text lines on one A4 page at this spec. */
  lineBudget: 50,
  // Soft section caps — surfaced as gentle nudges, never blocks.
  summaryLinesMax: 3,
  bulletsPerRole: [3, 5] as const,
  bulletLinesMax: 2,
  skillsLinesMax: 2,
} as const

export interface PageFill {
  /** 0..n, where 1.0 == exactly one page. */
  ratio: number
  /** round(ratio * 100) — may exceed 100 when content spills. */
  pct: number
  /** Estimated page count, min 1. */
  pages: number
  /** True when content fits on one page. */
  fits: boolean
}

/** Estimate how many rendered lines a block of text occupies. Empty → 0. */
export function estimateLines(
  text: string | null | undefined,
  charsPerLine: number = IDEAL_CV_SPEC.charsPerLine,
): number {
  const t = (text ?? "").trim()
  if (!t) return 0
  return Math.max(1, Math.ceil(t.length / charsPerLine))
}

/** Turn a used-line count into a page-fill estimate against the ideal budget. */
export function pageFillFromLines(usedLines: number): PageFill {
  const ratio = Math.max(0, usedLines) / IDEAL_CV_SPEC.lineBudget
  return {
    ratio,
    pct: Math.round(ratio * 100),
    pages: Math.max(1, Math.ceil(ratio - 1e-6)),
    fits: ratio <= 1 + 1e-6,
  }
}

/** Severity band for the meter colour (ok → tight → over). */
export function pageFillBand(fill: PageFill): "ok" | "tight" | "over" {
  if (fill.ratio <= 1 + 1e-6) return "ok"
  if (fill.ratio <= 1.15) return "tight"
  return "over"
}
