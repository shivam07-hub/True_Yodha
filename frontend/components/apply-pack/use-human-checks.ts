"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { humanChecks, type HumanCheck } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

export function useHumanChecks(token: string | null) {
  return useQuery({
    queryKey: dataKeys.humanChecks(),
    queryFn: () => humanChecks.mine(token as string),
    enabled: !!token,
    staleTime: 60 * 1000,
    select: (data) => data.checks,
  })
}

/** A check bought without a job or a profile, waiting to be spent. */
export function heldCheck(checks: HumanCheck[] | undefined): HumanCheck | null {
  return checks?.find((c) => c.status === "unassigned") ?? null
}

/** Spend a held check on one job. The stakes line and the room's offer both
 *  spend through this, so the two can never disagree about what spending does. */
export function useSpendCheck(token: string) {
  const queryClient = useQueryClient()
  const [spending, setSpending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function spend(checkId: string, jobId: string) {
    setSpending(true)
    setError(null)
    try {
      await humanChecks.useOnJob(token, checkId, jobId)
      await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use the check. Try again.")
    } finally {
      setSpending(false)
    }
  }
  return { spend, spending, error }
}
