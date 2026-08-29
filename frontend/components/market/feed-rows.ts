import type { JobFeedItem } from "@/lib/api"
import type { FeedStory } from "./story-card"

/** A heterogeneous feed row: a job card or an interleaved teaching story. */
export type FeedRow =
  | { t: "job"; job: JobFeedItem }
  | { t: "story"; id: string; story: FeedStory }
  /** `scope` is where the ranked picks end and the browse tail begins.
   *  `track` names one of the user's searches; `tier` is the quiet line where
   *  the brain stopped reading inside one. See `lib/jobs/track-sections.ts`. */
  | { t: "divider"; id: string; label: string; kind: "scope" | "track" | "tier" }

/**
 * Weave the (≤2) available story cards into the job list at a calm cadence —
 * roughly one story per five jobs. Signal-gated by the caller: an empty
 * `stories` array yields a pure job feed. Positions shift as earlier stories
 * are inserted so the spacing stays ~5 apart.
 */
export function interleaveStories(
  jobs: JobFeedItem[],
  stories: FeedStory[],
  dividers: Array<{ beforeJobId: string; label: string; kind?: "scope" | "track" | "tier" }> = [],
): FeedRow[] {
  const rows: FeedRow[] = jobs.map((job) => ({ t: "job", job }))
  for (const divider of dividers) {
    const at = rows.findIndex((row) => row.t === "job" && row.job.job_id === divider.beforeJobId)
    const kind = divider.kind ?? "scope"
    // The id carries the kind: a search boundary and the tier line inside it can
    // both target one card, and two rows sharing a key is how the virtual feed
    // hands a row its neighbour's measured height and paints them on top of
    // each other.
    if (at >= 0) rows.splice(at, 0, { t: "divider", id: `${kind}-${divider.beforeJobId}`, label: divider.label, kind })
  }
  const slots = [5, 11]
  let inserted = 0
  stories.slice(0, slots.length).forEach((story, i) => {
    const at = slots[i] + inserted
    if (at <= rows.length) {
      rows.splice(at, 0, { t: "story", id: `story-${story.kind}-${i}`, story })
      inserted++
    }
  })
  return rows
}
