"use client"

import { useEffect, useState } from "react"

/**
 * Turns a boolean `loading` into a single "this is taking a while" flag after a
 * threshold, so a section can reassure a waiting user instead of shimmering in
 * silence (a slow load and a dead one look identical otherwise).
 *
 * One threshold, not the old two-tier phase machine: the dashboard is a set of
 * parallel client queries, not a server job with stages, so there is nothing
 * truthful to narrate before the slow tail (dashboard-loading grill Q1/Q5).
 * Sections normally paint well under the default 6s; crossing it means
 * genuinely slow, worth one inline, non-shaming line — scoped to the section,
 * never a global floating banner.
 *
 * The timer resets whenever `loading` flips back to false, so a fast refetch
 * never inherits a stale "slow" flag.
 */
export function useIsSlow(loading: boolean, afterMs = 6000): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    setSlow(false)
    const t = setTimeout(() => setSlow(true), afterMs)
    return () => clearTimeout(t)
  }, [loading, afterMs])

  return slow
}
