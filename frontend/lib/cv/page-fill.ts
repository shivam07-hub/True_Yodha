import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"

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

/**
 * THE one-page estimate for a CV. Every surface calls this — there is no second
 * copy to drift from.
 *
 * It used to be written out twice: once in the signed-in workstation and once in
 * the public preview, whose comment claimed to "mirror" it. They diverged, and
 * the signed-in copy was the degraded one — it counted only identity, summary,
 * experience and skills, so PROJECTS, EDUCATION and CERTIFICATIONS were invisible
 * to the meter that gates the signed-in user's download. An anonymous visitor got
 * a more accurate verdict than someone with an account.
 *
 * Measured against a real print render while building one CV: the old signed-in
 * calculation read 54% where the truth was 62% (a populated projects section it
 * ignored entirely), then 110% "spills onto 2 pages" against a CV that genuinely
 * fits at 97%. Both directions wrong. The line budget remains an estimate — see
 * IDEAL_CV_SPEC — but it is now one estimate, over the whole document.
 */
export function computeFill(cv: CVStructured, hidden: Set<string>): PageFill {
  const cpl = IDEAL_CV_SPEC.charsPerLine
  let lines = 3 // contact header

  if (cv.summary && !hidden.has(itemId("summary", 0, cv.summary))) {
    lines += 1 + estimateLines(cv.summary, cpl)
  }

  let expVisible = false
  cv.experience.forEach((e, ei) => {
    const kept = e.bullets.filter((b, bi) => !hidden.has(itemId("exp_bullet", ei * 100 + bi, b)))
    if (kept.length) {
      expVisible = true
      lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0)
    }
  })
  if (expVisible) lines += 1

  let projVisible = false
  cv.projects.forEach((p, pi) => {
    const kept = p.bullets.filter((b, bi) => !hidden.has(itemId("proj_bullet", pi * 100 + bi, b)))
    if (kept.length) {
      projVisible = true
      lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0)
    }
  })
  if (projVisible) lines += 1

  const eduVisible = cv.education
    .map((ed, i) => ({ line: [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · "), i }))
    .filter(({ line, i }) => !hidden.has(itemId("edu", i, line)))
  if (eduVisible.length) lines += 1 + eduVisible.length

  if (cv.skills_line && !hidden.has(itemId("skills_line", 0, cv.skills_line))) {
    lines += 1 + estimateLines(cv.skills_line, cpl)
  }

  const certVisible = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))
  if (certVisible.length) lines += 1 + certVisible.length

  return pageFillFromLines(lines)
}

/** Severity band for the meter colour (ok → tight → over). */
export function pageFillBand(fill: PageFill): "ok" | "tight" | "over" {
  if (fill.ratio <= 1 + 1e-6) return "ok"
  if (fill.ratio <= 1.15) return "tight"
  return "over"
}
