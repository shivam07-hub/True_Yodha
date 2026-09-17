/**
 * Weave steps — what the Accept stepper walks, and where it opens.
 *
 * Pure. No React, no network. The CV-WIDE lines (summary, skills line) are a
 * step like any role: they reach the paper only when the user has been shown
 * them and said yes (ADR-0016). Before this module they rode along silently on
 * whichever role happened to be decided first.
 *
 * One definition of "is the stepper finished" lives here — `tailor-order`'s
 * landing and the overlay's own index both read it, so they cannot disagree.
 */
import type { WeaveProposal, WeaveRole } from "@/lib/api"

export type WeaveStep =
  | { kind: "extras"; summary: string | null; skillsLine: string | null }
  | { kind: "role"; role: WeaveRole }

export interface WeaveProgress {
  decidedRoles: number[]
  extrasDecided: boolean
}

/** True when the proposal rewrote at least one CV-wide line. */
export function hasExtras(summary: string | null, skillsLine: string | null): boolean {
  return Boolean(summary || skillsLine)
}

/** The stepper's cards, in the order they are decided: extras first (it is the
 *  whole-CV claim), then every changed role in CV order. */
export function buildSteps(proposal: WeaveProposal | null | undefined): WeaveStep[] {
  if (!proposal) return []
  const summary = proposal.summary ?? null
  const skillsLine = proposal.skills_line ?? null
  const steps: WeaveStep[] = []
  if (hasExtras(summary, skillsLine)) steps.push({ kind: "extras", summary, skillsLine })
  for (const role of proposal.roles) {
    if (role.changed) steps.push({ kind: "role", role })
  }
  return steps
}

export function isDecided(step: WeaveStep, progress: WeaveProgress): boolean {
  return step.kind === "extras"
    ? progress.extrasDecided
    : progress.decidedRoles.includes(step.role.role_index)
}

/** First step with no Keep/Take yet. `steps.length` means every one is decided —
 *  the stepper's settled state, not an error. */
export function firstUndecidedStep(steps: WeaveStep[], progress: WeaveProgress): number {
  const at = steps.findIndex(s => !isDecided(s, progress))
  return at === -1 ? steps.length : at
}

/** How many cards are still waiting on the user — over primitives, so the
 *  landing can answer it from a bare GET without rebuilding the card list. */
export function stepsRemaining(
  changedRoleIndexes: number[],
  decidedRoles: number[],
  extrasPresent: boolean,
  extrasDecided: boolean,
): number {
  const done = new Set(decidedRoles)
  const roles = changedRoleIndexes.filter(i => !done.has(i)).length
  return roles + (extrasPresent && !extrasDecided ? 1 : 0)
}
