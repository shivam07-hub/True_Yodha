/**
 * detail-model — the ONE Job Plan contract every job-detail skin renders.
 *
 * A job detail is a CV-creation funnel, not a job board page: understand the
 * fit → see the proof (skills you match) → see the gap (skills to build,
 * upvotable) → act (Tailor CV, the footer hero) → then outreach and context.
 * Desktop (`components/dashboard/detail-body.tsx`) and mobile
 * (`mobile/redesign/job-detail-sheet.tsx`) both derive their section order and
 * visibility from here, so the two skins cannot drift apart again — same cure
 * as `lib/collections/model.ts` (one view-model, two skins).
 *
 * Gating rule (design-over-words): a section with nothing to show renders
 * NOTHING — never an empty state announcing its own absence. Sections whose
 * data arrives async behind their own query (reach) self-gate inside their
 * component; this model fixes their POSITION.
 */

export type JobPlanSectionId =
  | "why" // the verdict/why-you-fit prose
  | "skills" // "You already match · N" + "Skills to build · N" (upvote rows)
  | "reach" // Reach the people — self-gates on search/pack availability
  | "jd" // full job description (kept for Tailor CV grounding)
  | "company" // company report + one-tap-collect More Roles
  | "notes" // public applicant notes

/** Funnel order — fixed. The Tailor CV hero is the FOOTER of every skin, so
 *  everything above it either builds conviction or collects; everything below
 *  the skills gap is secondary context. */
export const JOB_PLAN_ORDER: readonly JobPlanSectionId[] = [
  "why",
  "skills",
  "reach",
  "jd",
  "company",
  "notes",
]

/** Liveness states, mirrored from the backend verdict (see CONTEXT.md →
 *  Listing Verification). `unknown` is a real answer, not a failure. */
export type JobLivenessState = "live" | "closed" | "unverified" | "unknown"

export interface LivenessNotice {
  /** `warn` earns colour + prominence; `quiet` is a muted one-liner. */
  tone: "warn" | "quiet"
  text: string
  /** Whether the Apply action should carry a confirmation instead of firing
   *  straight out. Only a real closure verdict blocks — never a failed check. */
  guardsApply: boolean
}

/**
 * What to tell the user about this listing's liveness — the honesty layer of
 * the funnel. Deliberately says something in every state:
 *   live       → the trust payoff, quiet, with when we last saw it
 *   closed     → the one loud state; guards Apply so nobody tailors a dead role
 *   unknown    → we tried and couldn't tell; NEVER dressed up as either verdict
 *   unverified → we haven't checked yet; disclosed rather than implied-live
 *
 * `unverified` is muted on purpose: while the drain belt is still catching up
 * it is the common case, and a loud warning on every card would train users to
 * ignore the one state that matters (`closed`).
 */
export function livenessNotice(
  state: JobLivenessState | null | undefined,
  opts: { relativeAge?: string | null } = {},
): LivenessNotice | null {
  const age = opts.relativeAge
  switch (state) {
    case "live":
      return { tone: "quiet", text: age ? `Listing confirmed live ${age}` : "Listing confirmed live", guardsApply: false }
    case "closed":
      return { tone: "warn", text: "This listing looks closed — it may no longer accept applications", guardsApply: true }
    case "unknown":
      return { tone: "quiet", text: "Couldn't check whether this listing is still open", guardsApply: false }
    case "unverified":
      return { tone: "quiet", text: "Not yet checked by Myro", guardsApply: false }
    default:
      return null
  }
}

export interface JobPlanInput {
  /** Any why/verdict prose available (streamed, cached, or brain summary). */
  hasWhy: boolean
  matchedCount: number
  buildCount: number
  /** Skill gap still loading — keeps the skills slot mounted for its spinner. */
  loadingSkills?: boolean
  hasJd?: boolean
  hasCompany?: boolean
  /** Skin supports the section at all (mobile omits reach/jd/company/notes). */
  supports?: Partial<Record<JobPlanSectionId, boolean>>
}

/** The sections THIS render should mount, in canonical order. */
export function jobPlanSections(input: JobPlanInput): JobPlanSectionId[] {
  const supported = (id: JobPlanSectionId) => input.supports?.[id] !== false
  return JOB_PLAN_ORDER.filter((id) => {
    if (!supported(id)) return false
    switch (id) {
      case "why":
        return input.hasWhy
      case "skills":
        return input.matchedCount > 0 || input.buildCount > 0 || !!input.loadingSkills
      case "reach":
        return true // self-gates on its own query inside ReachSection
      case "jd":
        return !!input.hasJd
      case "company":
        return !!input.hasCompany
      case "notes":
        return true
    }
  })
}
