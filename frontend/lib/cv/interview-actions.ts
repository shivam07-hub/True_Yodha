/**
 * The interview's way out, per question (FD2, 2026-10-20).
 *
 * Every question before the last offers "Weave now" at its price, so a person
 * who wants the tailored CV is one click from it on question 1, not five
 * skips. The last question keeps a single button: skipping it IS weaving.
 * The price is "up to": a weave that reworks no role is free (FD5, 2026-10-22).
 */
export interface InterviewActions {
  skipLabel: string
  /** null on the last question. */
  weaveNowLabel: string | null
}

/** The one label for starting a weave: the action and its price. */
export function startLabel(cost: number): string {
  return `Weave now · up to ${cost}`
}

export function interviewActions(index: number, total: number, cost: number): InterviewActions {
  const last = index >= total - 1
  return {
    skipLabel: last ? `Skip & weave · up to ${cost}` : "Skip",
    weaveNowLabel: last ? null : startLabel(cost),
  }
}

/** What the overlay does once it knows the interview and the draft. */
export type OpeningRun = "interview" | "run" | "refresh" | "start"

/**
 * A weave run charges up to its price, so the overlay starts one by itself
 * only when the control that opened it showed that price: the header's
 * "Tailor with Mentor" with its cost (Shivam, 2026-11-17). An auto-open, a
 * `?mentor=1` link or the hand-over from an empty gap deck lands on "start":
 * one button with the price on it. Questions are asked either way; their
 * buttons carry the price.
 */
export function openingRun(opts: {
  questions: number
  staleDraft: boolean
  pricedPress: boolean
}): OpeningRun {
  if (opts.staleDraft) return opts.pricedPress ? "refresh" : "start"
  if (opts.questions > 0) return "interview"
  return opts.pricedPress ? "run" : "start"
}
