/**
 * Pure model for the CV-analysis wait — the ONE place that decides what the
 * user is told while Myro reads their CV, on every surface that shows it.
 *
 * Why this is a module and not private constants inside a component: the
 * slow-notice threshold shipped as `SLOW_AFTER_MS = 75_000` and was compared
 * against a value in SECONDS, so the notice needed ~21 hours to appear and
 * never once did. Nothing caught it because none of it was reachable from a
 * test — `tsc` cannot see a unit mismatch between two numbers, and there is no
 * render in the pipeline to notice a message that never appears.
 *
 * Why it is now shared across three surfaces: the same wait was implemented
 * three times (anon /cv-preview, onboarding, authed /cv), with three visual
 * languages, three copy sets and four different "slow" thresholds — 6s, 15s,
 * 40s and 75s — for one piece of work. One of the three narrated its progress
 * from a `setInterval`, ticking stages whether or not anything happened.
 *
 * Every threshold, unit and state decision lives here, in seconds, named so the
 * unit is on the identifier. Components render; they do not decide.
 */

import type { CVUploadPhase } from "@/lib/cv-upload-state"

const PHASE_LABELS: Record<CVUploadPhase, string> = {
  queued: "Preparing your analysis",
  reading: "Reading your CV",
  finding_skills: "Extracting your skills",
  saving: "Saving your analysis",
  structuring_cv: "Preparing your CV review",
  ready: "Opening your CV review",
  failed: "Analysis stopped",
}

/** The persisted worker phase is the only narration source. */
export function currentPhaseLabel(phase: CVUploadPhase | null): string {
  return PHASE_LABELS[phase ?? "queued"]
}

/**
 * The ladder, in the order the worker actually crosses it.
 *
 * `reading` and `structuring_cv` are deliberately absent: raw text is extracted
 * synchronously before the job is accepted, and the layout parse moved off the
 * critical path. Neither is ever written, so a step for either would be a step
 * that never lights — the same lie as a timer, told more slowly. They keep their
 * labels above only so a row persisted before that change still renders.
 */
export const JOB_ANALYSIS_PHASES = ["queued", "finding_skills", "saving"] as const satisfies readonly CVUploadPhase[]

/**
 * SECONDS, and both thresholds are sized from the measured job.
 *
 * Prod, 30 days to 2026-08-04: p50 48s, p90 109s, max 177s. The onboarding
 * surface warned "slower than usual" at 40s, i.e. before the median — it fired
 * for most users, on most uploads, while the pipeline was behaving perfectly.
 * A warning that common is not information, it is the background.
 *
 * So: SLOW sits past p90 (genuinely unusual), STALLED sits near the client's
 * 180s poll timeout, where "still working" stops being a credible claim.
 */
export const SLOW_AFTER_S = 90
export const STALLED_AFTER_S = 150

/** `elapsed` is SECONDS. Passing milliseconds here is the original bug; the
 *  parameter name and the test around it are what keep it from returning. */
export function isSlow(elapsedInSeconds: number): boolean {
  return elapsedInSeconds >= SLOW_AFTER_S && elapsedInSeconds < STALLED_AFTER_S
}

/** A phase that has not advanced this long is not slow, it is stuck. One signup
 *  sat on an unchanging label for minutes after its job had already been
 *  dropped; silence and progress must not look the same. */
export function isStalled(elapsedInSeconds: number): boolean {
  return elapsedInSeconds >= STALLED_AFTER_S
}

/** Whole seconds since `startedAt`. Never negative, never NaN: a clock skew or
 *  an unparseable timestamp reads as 0, not as a wild number on screen. */
export function elapsedSeconds(startedAt: string | null, now: number): number {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
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

// ── The view ─────────────────────────────────────────────────────────────────

export type StepState = "done" | "active" | "pending"

export interface AnalysisStep {
  label: string
  state: StepState
}

export interface AnalysisView {
  headline: string
  steps: AnalysisStep[]
  /** Rendered under the ladder. Null when the wait is behaving normally — the
   *  moving elements already say "working", so a reassurance on top of them is
   *  noise that trains people to ignore the one message that matters. */
  note: string | null
  /** Past the point where "still working" is a credible claim. The surface
   *  should offer a way out, not another sentence. */
  stalled: boolean
}

/**
 * `job` — a durable upload job whose phases the server persists and the client
 *   polls. Every step in the ladder is a fact read off the row.
 * `request` — the logged-out preview: ONE blocking POST that extracts, parses
 *   and scores server-side. The client can observe that it is in flight and
 *   nothing finer, so it gets one honest step rather than three invented ones.
 */
export type AnalysisKind = "job" | "request"

export function analysisView(input: {
  kind: AnalysisKind
  /** Server phase. Ignored for `request`, which has none. */
  phase?: CVUploadPhase | null
  /** Seconds since the CURRENT phase began — the stall clock. Not the total
   *  wait: with three phases the total says nothing about whether the pipeline
   *  is still moving, which is the only question these notices answer. */
  secondsInPhase: number
}): AnalysisView {
  const { kind, phase = null, secondsInPhase } = input
  const stalled = isStalled(secondsInPhase)

  const steps: AnalysisStep[] =
    kind === "request"
      ? [{ label: PHASE_LABELS.reading, state: "active" }]
      : JOB_ANALYSIS_PHASES.map((step, i) => ({
          label: PHASE_LABELS[step],
          state: stepStateFor(phase, i),
        }))

  return {
    headline: stalled ? "This is taking longer than it should" : "Myro is reading your CV.",
    steps,
    note: stalled
      ? "Your CV is saved and nothing is lost. Check again, or carry on and come back."
      : isSlow(secondsInPhase)
        ? "Still working — this one is slower than usual."
        : null,
    stalled,
  }
}

/**
 * Where a step sits relative to the live phase.
 *
 * An unrecognised phase — a legacy `reading`, a value added server-side before
 * this client shipped — resolves to index 0 rather than throwing the ladder
 * away. Work is happening either way; the ladder just cannot say how far.
 */
export function stepStateFor(phase: CVUploadPhase | null, index: number): StepState {
  const at = JOB_ANALYSIS_PHASES.indexOf(phase as (typeof JOB_ANALYSIS_PHASES)[number])
  // `ready` arrives on the terminal poll, one tick before the surface swaps to
  // its result. Everything is genuinely finished, so nothing should still pulse.
  if (phase === "ready") return "done"
  const active = at === -1 ? 0 : at
  if (index < active) return "done"
  if (index === active) return "active"
  return "pending"
}
