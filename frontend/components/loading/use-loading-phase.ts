"use client"

import { useEffect, useState } from "react"

/**
 * Turns a boolean `loading` into a three-stage phase so the UI can reassure a
 * waiting user instead of showing a silent skeleton that's indistinguishable
 * from a frozen one:
 *
 *   normal  (0–slowMs)    → silent skeleton, this is fine
 *   slow    (slowMs+)     → "Loading your dashboard…"
 *   stuck   (stuckMs+)    → "Still working — taking longer than usual."
 *
 * The timers reset whenever `loading` flips back to false, so a fast refetch
 * never inherits a stale "stuck" phase.
 */
export type LoadingPhase = "normal" | "slow" | "stuck"

export function useLoadingPhase(
  loading: boolean,
  opts: { slowMs?: number; stuckMs?: number } = {},
): LoadingPhase {
  const { slowMs = 3000, stuckMs = 8000 } = opts
  const [phase, setPhase] = useState<LoadingPhase>("normal")

  useEffect(() => {
    if (!loading) {
      setPhase("normal")
      return
    }
    setPhase("normal")
    const slow = setTimeout(() => setPhase("slow"), slowMs)
    const stuck = setTimeout(() => setPhase("stuck"), stuckMs)
    return () => {
      clearTimeout(slow)
      clearTimeout(stuck)
    }
  }, [loading, slowMs, stuckMs])

  return phase
}
