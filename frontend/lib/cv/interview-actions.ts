/**
 * The interview's way out, per question (FD2, 2026-10-20).
 *
 * Every question before the last offers "Weave now" at its price, so a person
 * who wants the tailored CV is one click from it on question 1, not five
 * skips. The last question keeps a single button: skipping it IS weaving.
 */
export interface InterviewActions {
  skipLabel: string
  /** null on the last question. */
  weaveNowLabel: string | null
}

export function interviewActions(index: number, total: number, cost: number): InterviewActions {
  const last = index >= total - 1
  return {
    skipLabel: last ? `Skip & weave · ${cost}` : "Skip",
    weaveNowLabel: last ? null : `Weave now · ${cost}`,
  }
}
