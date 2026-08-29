/**
 * Where the feed's searches begin and end, as dividers.
 *
 * A run keeps `TRACK_QUOTA` (20) rows per search and deep-evaluates `TRACK_DEEP`
 * (8) of them. The other twelve are real jobs with a real overlap score that the
 * brain has not read yet — it reads them when one is opened. So a two-search
 * feed has four stretches in its ranked head, and without a mark between them
 * the reader has no way to tell a search boundary from a scroll, or an unread
 * row from a bad one.
 *
 * The mark is the divider the feed ALREADY has — the one that separates the
 * ranked picks from the browse tail, and which exists for exactly this reason:
 * "so the verdicts stopping reads as intentional, not a glitch". One device,
 * one short label, no new component and no explanatory sentence.
 *
 * ORDER IS NOT DECIDED HERE. `_rank_feed_rows` sorts the ranked head by
 * (which search, read first, then fit) and this reads the boundaries out of the
 * order it was given. A client that regrouped would be a second ordering, and
 * the last time this surface had two of those they disagreed.
 *
 * A SINGLE-TRACK USER GETS NOTHING. `_track_specs` returns () for them, so every
 * row is evaluated exactly as before and every `track_id` is null: no search
 * header, no tier divider, a screen byte-identical to the one before tracks
 * existed. That is 83% of users, and it is an invariant, not an optimisation.
 */

import type { JobFeedItem, Track } from "@/lib/api"

export interface FeedDivider {
  beforeJobId: string
  label: string
  /** `track` names a search — the user's own words, and the loudest thing on
   *  the row. `tier` is the quiet line where the brain stopped reading. */
  kind: "track" | "tier"
}

/** A row the run kept but the brain has not read. Real job, real overlap score,
 *  no verdict — `MatchEval` renders it `checking` and upgrades it in place when
 *  the row is opened. */
function unread(job: JobFeedItem): boolean {
  return !job.verdict || job.verdict === "checking"
}

export function trackDividers(
  /** The RANKED head only, in the server's order. The browse tail below it was
   *  found by no search and carries no `track_id`. */
  ranked: JobFeedItem[],
  tracks: Track[],
): FeedDivider[] {
  // One search is the state 83% of users are in, and the state everyone was in
  // before tracks existed. It gets no chrome at all.
  if (tracks.length < 2 || ranked.length === 0) return []

  const labels = new Map<number | null, string>(tracks.map((t) => [t.id, t.label]))
  const out: FeedDivider[] = []
  let openTrack: number | null | undefined
  let readSoFar = 0
  let markedTier = false

  for (const job of ranked) {
    const track = job.track_id ?? null
    if (track !== openTrack) {
      const label = labels.get(track)
      // A row whose search was archived since the run keeps its place and its
      // verdict; it simply stops being announced. Dropping it would hide a real
      // job the user was matched to.
      if (label) out.push({ beforeJobId: job.job_id, label, kind: "track" })
      openTrack = track
      readSoFar = 0
      markedTier = false
    }
    if (unread(job)) {
      // Only where the brain actually stopped MID-search. A search with nothing
      // read has no boundary — "Consulting" immediately followed by "Not read
      // yet" is two labels and no content between them, and it says the search
      // failed when it did not.
      if (!markedTier && readSoFar > 0) {
        out.push({ beforeJobId: job.job_id, label: "Not read yet", kind: "tier" })
      }
      markedTier = true
    } else {
      readSoFar += 1
    }
  }
  return out
}
