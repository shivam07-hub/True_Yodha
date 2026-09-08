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
/** A page REGION painting. Grill-locked (dashboard-loading Q1/Q5): sections
 *  normally paint well under this, so crossing it means genuinely slow. */
export const SECTION_SLOW_MS = 6000

/** An ACTION the user started with a click. Far shorter than a section's: they
 *  are watching the control they just pressed, and they know how long their own
 *  click should take. Under this a reassurance flickers and reads as jank; over
 *  it, silence reads as broken. One number, in one place — the alternative is
 *  every component picking its own by feel. */
export const ACTION_SLOW_MS = 1200

export function useIsSlow(loading: boolean, afterMs = SECTION_SLOW_MS): boolean {
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
