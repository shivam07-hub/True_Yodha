/**
 * Tailor Order landing — where Tailor with Mentor opens.
 *
 * Pure. No React, no network. The playground used to always open the weave
 * overlay; a settled job (every changed role decided, no closable gaps)
 * should not. `landingStep` is the whole answer, the same way it is for Search.
 */

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
  proposal?: { roles: { changed: boolean }[] } | null
}

export function factsFromGet(
  get: WeaveGetFacts | null | undefined,
  closableGaps: number | null,
): TailorFacts {
  const changed = (get?.proposal?.roles ?? []).filter((r) => r.changed).length
  const decided = get?.decided_roles?.length ?? 0
  const acceptComplete = changed === 0 ? Boolean(get?.applied) : decided >= changed
  if (!get?.purchased) {
    return { proposal: "none", acceptComplete, closableGaps }
  }
  return {
    proposal: get.stale ? "stale" : "current",
    acceptComplete,
    closableGaps,
  }
}

/** First changed role with no Keep/Take yet. `changed.length` means all decided. */
export function firstUndecidedIndex(changedRoleIndexes: number[], decided: number[]): number {
  const done = new Set(decided)
  const at = changedRoleIndexes.findIndex((i) => !done.has(i))
  return at === -1 ? changedRoleIndexes.length : at
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
