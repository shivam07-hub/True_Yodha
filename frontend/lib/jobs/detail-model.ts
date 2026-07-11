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
