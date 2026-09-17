/**
 * Tailor Order landing — where Tailor with Mentor opens.
 *
 * Pure. No React, no network. The playground used to always open the weave
 * overlay; a settled job (every changed role decided, no closable gaps)
 * should not. `landingStep` is the whole answer, the same way it is for Search.
 *
 * "Settled" is `weave-steps` arithmetic, not a second count kept here.
 */
import { hasExtras, stepsRemaining } from "./weave-steps"

export type TailorStep = "proof" | "weave" | "accept" | "gaps" | "paper"
export type TailorOverlay = "weave" | "gaps" | null
export type TailorProposalState = "none" | "current" | "stale"

export interface TailorFacts {
  proposal: TailorProposalState
  /** Every changed role has a Keep or Take on the paper. */
  acceptComplete: boolean
  /** Remaining missing/partial JD rows. null = coverage not in yet — never
   *  claim the order is settled. */
  closableGaps: number | null
}

export interface WeaveGetFacts {
  purchased: boolean
  stale?: boolean
  applied?: boolean
  decided_roles?: number[]
  extras_decided?: boolean
  proposal?: {
    roles: { changed: boolean; role_index?: number }[]
    summary?: string | null
    skills_line?: string | null
  } | null
}

export function factsFromGet(
  get: WeaveGetFacts | null | undefined,
  closableGaps: number | null,
): TailorFacts {
  const changedRoles = (get?.proposal?.roles ?? [])
    .map((r, i) => (r.changed ? r.role_index ?? i : -1))
    .filter((i) => i >= 0)
  const extrasPresent = hasExtras(
    get?.proposal?.summary ?? null,
    get?.proposal?.skills_line ?? null,
  )
  // The summary card is a step like any role — a draft with it still unanswered
  // is not settled, or the landing would skip past a line the user never saw.
  const remaining = stepsRemaining(
    changedRoles,
    get?.decided_roles ?? [],
    extrasPresent,
    Boolean(get?.extras_decided),
  )
  const acceptComplete =
    changedRoles.length === 0 && !extrasPresent ? Boolean(get?.applied) : remaining === 0
  if (!get?.purchased) {
    return { proposal: "none", acceptComplete, closableGaps }
  }
  return {
    proposal: get.stale ? "stale" : "current",
    acceptComplete,
    closableGaps,
  }
}

export function landingStep(facts: TailorFacts): TailorStep {
  if (facts.proposal === "stale") return "weave"
  if (facts.proposal === "none") {
    if (facts.acceptComplete) return facts.closableGaps === 0 ? "paper" : "gaps"
    return "proof"
  }
  if (!facts.acceptComplete) return "accept"
  return facts.closableGaps === 0 ? "paper" : "gaps"
}

export function overlayFor(step: TailorStep): TailorOverlay {
  if (step === "paper") return null
  if (step === "gaps") return "gaps"
  return "weave"
}

/** Cost 50 only when this landing will charge a weave RUN. */
export function willCharge(step: TailorStep): boolean {
  return step === "proof" || step === "weave"
}
