import type { CollectionEntry, CollectionOrigin, CollectionStage, JobMatch } from "@/lib/api"
import { verdictMove } from "@/lib/jobs/match-verdict"
import type { SortKey } from "@/lib/dashboard/feed-model"

/* ── The Collection Record, client side ───────────────────────────────────────
 * CONTEXT.md → Collection Record. What is LEFT here after the resolver landed:
 * ordering, the hero verb, and the words. The stage, the origin, the liveness,
 * the counts and the landing are the server's answers now — this file used to
 * derive all five, in parallel with a second copy in the mobile skin, off three
 * caches that could disagree. That is what put one job in two chips.
 *
 * Gone with them: `isMyroSource` / `isExtSource` (read a `source` column that
 * defaults to `system_match` while every save writes `user_discovery`, so it was
 * wrong in both directions), `filterChip`, `splitClosedApps`, `chipCounts`,
 * `buildMyroFound`, `buildCollectionsView`, `buildContinueLane`,
 * `collectionsTriageCtx`, `matchesById`, `appToFeedItem`, `classifyMatch` and
 * `COLLECTION_CHIPS` (which had no consumers at all).
 * ────────────────────────────────────────────────────────────────────────── */

/** Origin is a LABEL. It prints a chip and does nothing else — never a filter. */
export const ORIGIN_LABEL: Record<CollectionOrigin, string> = {
  myro: "Myro found",
  you: "You added",
  extension: "Extension",
}

/**
 * The ONE hero for an entry — one slot, one verb, decided by stage.
 *
 * `kind` is the button tone; `href`/`action` is what it does. Exactly one hero
 * per card, never peers: the market card's hero is Save, and inside the Ops
 * folder the job is already collected, so the verb is the next real move.
 */
export interface Hero {
  label: string
  kind: "go" | "gap" | "quiet"
  /** Where it goes. `null` = the surface supplies an onClick instead. */
  href: string | null
}

const tailorHref = (jobId: string) => `/cv?jobId=${encodeURIComponent(jobId)}`

/**
 * Hero by stage.
 *
 * `found`/`saved` split on the Match Verdict, via the shared `verdictMove`: a
 * strong or worth-it role is worth tailoring now; a stretch is worth closing
 * gaps on first. Both skins used to print "Tailor CV" on every row including
 * stretches — the opposite error to the Jobs face, which printed a move
 * sentence as a second CTA next to Save.
 *
 * `applied` hands off to the Prep room. `closed` has nothing left to do to the
 * listing, so the one useful move is that company's live openings.
 */
export function heroFor(entry: CollectionEntry): Hero {
  const gapCount = entry.job.missing_skills?.length ?? 0
  switch (entry.stage) {
    case "applied":
      return { label: "Prep room", kind: "go", href: `/preparations/${encodeURIComponent(entry.job_id)}` }
    case "closed":
      return { label: entry.job.company ? `More at ${entry.job.company}` : "Find similar roles", kind: "quiet", href: null }
    case "tailored":
      // The CV exists. One hero: open the order it belongs to. "Apply" is not a
      // peer here — it is the Apply Transport control, which the card already
      // renders separately when the listing has a destination.
      return { label: "Open tailored CV", kind: "go", href: tailorHref(entry.job_id) }
    default: {
      const move = verdictMove(entry.job.verdict, gapCount)
      if (move?.kind === "gap") {
        return { label: move.label, kind: "gap", href: "/practice" }
      }
      return { label: "Tailor CV", kind: "go", href: tailorHref(entry.job_id) }
    }
  }
}

/**
 * Order one stage's entries on the user's chosen axis.
 *
 * There is no manual rank on top of it. The heart put one there and nobody ever
 * pressed it — literally zero times in the five weeks it was live. The stage
 * ladder is the ranking, and it is derived from things the user does for their
 * own reasons (saving is the claim, tailoring is the commitment) rather than a
 * curation chore they have to keep up.
 *
 * The applied-sinks rule the old model carried went the same way as its chip:
 * applied rows have their OWN stage, so they cannot outrank live work inside a
 * list they do not belong to.
 */
export function orderEntries(entries: CollectionEntry[], sort: SortKey): CollectionEntry[] {
  const axis = (a: CollectionEntry, b: CollectionEntry): number => {
    if (sort === "company") {
      return (a.job.company ?? "￿").localeCompare(b.job.company ?? "￿", undefined, { sensitivity: "base" })
    }
    if (sort === "recent") {
      return seenAt(b.job) - seenAt(a.job)
    }
    return (b.job.match_score ?? -1) - (a.job.match_score ?? -1)
  }
  return [...entries].sort(axis)
}

function seenAt(job: JobMatch): number {
  const iso = job.first_seen
  return iso ? new Date(iso).getTime() : 0
}

/** Stage-scoped empty copy — never a blanket "nothing here" when the emptiness
 *  has a nameable cause. */
export function emptyCopy(stage: CollectionStage): string {
  switch (stage) {
    case "found":
      return "Nothing has cleared the bar yet — run a Myro Search and the roles worth your time land here."
    case "saved":
      return "Nothing saved yet — save a role from Jobs, paste a link, or send one from the Chrome extension."
    case "tailored":
      return "No tailored CVs yet — pick a saved role and tailor it. That is the one that gets downloaded."
    case "applied":
      return "No applications yet — tailor a saved role, then apply."
    case "closed":
      return "Nothing closed — every listing you're tracking is still up."
  }
}
