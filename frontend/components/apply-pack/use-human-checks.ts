"use client"

import { useQuery } from "@tanstack/react-query"

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
