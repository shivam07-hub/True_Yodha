/**
 * Pure model for the CV-upload progress surface.
 *
 * Why this is a module and not private constants inside the component: the
 * slow-notice threshold shipped as `SLOW_AFTER_MS = 75_000` and was compared
 * against a value in SECONDS, so the notice needed ~21 hours to appear and
 * never once did. Nothing caught it because none of it was reachable from a
 * test — `tsc` cannot see a unit mismatch between two numbers, and there is no
 * render in the pipeline to notice a message that never appears.
 *
 * Every threshold, unit and state decision lives here, in seconds, named so the
 * unit is on the identifier. The component renders; it does not decide.
 */

import type { CVUploadPhase } from "@/lib/cv-upload-state"

const PHASE_LABELS: Record<CVUploadPhase, string> = {
  queued: "Preparing your analysis",
  reading: "Reading your CV",
  finding_skills: "Extracting your skills",
  structuring_cv: "Preparing your CV review",
  ready: "Opening your CV review",
  failed: "Analysis stopped",
}

/** The persisted worker phase is the only narration source. */
export function currentPhaseLabel(phase: CVUploadPhase | null): string {
  return PHASE_LABELS[phase ?? "queued"]
}

/** SECONDS. The unit is in the name deliberately — see the module note. */
export const SLOW_AFTER_S = 75

/** Whole seconds since `startedAt`. Never negative, never NaN: a clock skew or
 *  an unparseable timestamp reads as 0, not as a wild number on screen. */
export function elapsedSeconds(startedAt: string | null, now: number): number {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}

/** `elapsed` is SECONDS. Passing milliseconds here is the original bug; the
 *  parameter name and the test around it are what keep it from returning. */
export function isSlow(elapsedInSeconds: number): boolean {
  return elapsedInSeconds >= SLOW_AFTER_S
}

export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(safe / 60)
  const r = safe % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

/** Band verdict for the reveal beat — leads with the path forward, never a
 *  judgement (ND1). Derived from the engine score alone. */
export function revealVerdict(score: number): string {
  if (score >= 80) return "Strong CV. A few sharpens and it’s recruiter-ready."
  if (score >= 60) return "Solid base — a handful of fixes will make it land harder."
  if (score >= 40) return "Good raw material. The fixes below are where the points are."
  return "Early draft — let’s turn what you’ve done into what a recruiter reads."
}
