"use client"

/**
 * Re-read the Job Tracks gate after a tailored CV lands.
 *
 * The server stamps `tailored_cv_created_at` inside that same write, so
 * `can_open` has just flipped and the cached answer is now wrong. The second
 * search offer is not on this landing — it lives on Market / the refresh gate.
 */

import { useQueryClient } from "@tanstack/react-query"

import { trackKeys } from "@/lib/hooks/use-tracks"

export function useTailorGateRefresh(): () => void {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: trackKeys.all() })
}
