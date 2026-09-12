/**
 * Which duplicate question the review space is asking — pure.
 *
 * Lives apart from the component so it can be tested without a query client,
 * a DOM, or the component's stylesheet. The band's whole branching is here:
 * whether there is anything to show, which pair is up, and whether it is a
 * story question or a role question.
 */
import type { MergeSuggestion, ReviewView, StoryPair } from "@/lib/api"

export interface ReviewState {
  /** Nothing waiting and nothing done — the band renders nothing at all. */
  hidden: boolean
  waiting: number
  at: number
  pair: StoryPair | null
  rolePair: MergeSuggestion | null
}

/** What the band shows for one payload and cursor. Pure, so the branching is
 *  tested without a query client: which question is up, whether it is a story
 *  or a role, and whether there is anything to show at all. */
export function reviewState(data: ReviewView | undefined, cursor: number): ReviewState {
  if (!data) return { hidden: true, waiting: 0, at: 0, pair: null, rolePair: null }
  const waiting = data.story_pairs.length + data.role_pairs.length
  const hidden =
    waiting === 0 && data.merged_for_you.length === 0 && data.you_decided === 0 && data.tidied_roles === 0
  const at = waiting === 0 ? 0 : ((cursor % waiting) + waiting) % waiting
  const pair = at < data.story_pairs.length ? data.story_pairs[at] : null
  const rolePair = pair ? null : data.role_pairs[at - data.story_pairs.length] ?? null
  return { hidden, waiting, at, pair, rolePair }
}
