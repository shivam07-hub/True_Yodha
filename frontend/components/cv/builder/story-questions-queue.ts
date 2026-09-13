/**
 * Which completion question the band is asking, and whether it shows — pure.
 *
 * Same split as `story-review-queue`: the branching lives apart from the
 * component so it can be tested without a query client, a DOM or a stylesheet.
 * These are the rules that decide whether a user trusts a standing queue, so
 * they are worth asserting directly.
 */
import type { StoryQuestion } from "@/lib/api"

/** Below this a "tell me more" is not an answer, it is a shrug. Mirrors the
 *  server's own floor in the completion router. */
export const MIN_ANSWER = 12

export interface QuestionsState {
  /** Nothing to ask and nothing set aside — the band renders nothing at all.
   *  An empty queue is not a state worth a card, and it is certainly not worth
   *  a congratulation. */
  hidden: boolean
  at: number
  question: StoryQuestion | null
  /** One question has nothing to defer to, so it is offered no Later. */
  canDefer: boolean
}

/** The two ask counts come from the server and are NOT derived here. They
 *  overlap — a bullet can be missing its number and never have been told — so
 *  `total - missingNumber` is not the number of stories to tell. Deriving it
 *  reported zero for a queue whose only question was asking for both. */
export function questionsState(
  questions: StoryQuestion[],
  setAside: number,
  cursor: number,
): QuestionsState {
  const n = questions.length
  const at = n === 0 ? 0 : ((cursor % n) + n) % n
  return {
    hidden: n === 0 && setAside === 0,
    at,
    question: n === 0 ? null : questions[at],
    canDefer: n > 1,
  }
}

/** Whether an answer is long enough to be worth banking. */
export function canBank(draft: string): boolean {
  return draft.trim().length >= MIN_ANSWER
}
