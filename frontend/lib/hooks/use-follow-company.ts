"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "@/lib/api"
import type { FollowedCompany, FollowedCompaniesResponse } from "@/lib/api"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"

const COST = XP_POLICY.followCompanyCost
const LIMIT = XP_POLICY.followedCompanyLimit
const FLOOR = XP_POLICY.followCompanyFloor

// ── IH2 reasons, single source ───────────────────────────────────────────────
const REASON_LIMIT = `Heatmap limit ${LIMIT}`
const REASON_XP = "Not enough XP"

/**
 * Pure IH2 gate: can this company be *added* right now?
 * Returns the blocking reason, or null when the follow is allowed.
 * Already-followed returns null (it's not addable, but that's not a *block* to
 * surface — the caller treats it as a no-op / unfollow path).
 * Exported so the cap/floor math is testable without React.
 */
export function followGateReason(args: {
  name: string
  followedNames: string[]
  count: number
  balance: number
}): string | null {
  const { name, followedNames, count, balance } = args
  if (followedNames.includes(name)) return null
  if (count >= LIMIT) return REASON_LIMIT
  if (balance - COST < FLOOR) return REASON_XP
  return null
}

export interface FollowError {
  /** Company name the failed action targeted. */
  name: string
  /** Human-facing message — backend detail string, or a local IH2 reason. */
  message: string
}

export interface UseFollowCompany {
  companies: FollowedCompany[]
  followedNames: string[]
  count: number
  isLoading: boolean
  /** True for any company whose follow/unfollow is in flight (per-name). */
  isPending: (name: string) => boolean
  /** IH2 gate: may this *not-yet-followed* company be added right now? */
  canFollow: (name: string) => boolean
  /** Why canFollow is false (undefined when it's allowed or already followed). */
  disabledReason: (name: string) => string | undefined
  follow: (name: string) => void
  unfollow: (name: string) => void
  /** Follow if absent, unfollow if present. */
  toggle: (name: string) => void
  /** Last failed action, for callers that want to surface it inline. */
  error: FollowError | null
  clearError: () => void
}

/**
 * useFollowCompany — the one deep module for the "follow a target company" act.
 *
 * Owns the whole optimistic contract so no caller can get it half-right:
 *   click → optimistic chip add/remove (instant) → authoritative XP echo on
 *   success → rollback + error on failure. The heavy heatmap pipeline (per-row
 *   useQueries on /market) is a *separate*, background concern — this hook only
 *   makes the follow act itself instant, which is the point: feedback now,
 *   pipeline later.
 *
 * Also owns the IH2 invariant (cost 10 · floor −30 · cap 10) via canFollow /
 * disabledReason, reading the live XP balance — so cap/floor gating lives in one
 * place instead of being re-derived at each star/chip.
 *
 * Single canonical cache key ["followedCompanies", token]; pass enabled to gate
 * the fetch (e.g. only when a settings tab is open).
 */
export function useFollowCompany(
  token: string | null,
  opts: { enabled?: boolean } = {},
): UseFollowCompany {
  const queryClient = useQueryClient()
  const { balance, applyXpChange } = useXPStore()
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<FollowError | null>(null)

  const queryKey = ["followedCompanies", token] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => users.followedCompanies(token!),
    enabled: !!token && (opts.enabled ?? true),
    staleTime: 60 * 1000,
  })

  // Memoized off the React Query data ref so consumers (e.g. the /market
  // heatmap's per-company useQueries) get stable arrays and don't re-run on
  // every render.
  const companies = useMemo(() => data?.companies ?? [], [data])
  const followedNames = useMemo(() => companies.map((c) => c.company_name), [companies])
  const count = companies.length

  const markPending = useCallback((name: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
  }, [])

  const mutation = useMutation({
    mutationFn: async ({ name, follow }: { name: string; follow: boolean }) => {
      if (follow) return users.followCompany(token!, name)
      await users.unfollowCompany(token!, name)
      return null
    },
    onMutate: async ({ name, follow }) => {
      markPending(name, true)
      setError(null)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<FollowedCompaniesResponse>(queryKey)
      queryClient.setQueryData<FollowedCompaniesResponse>(queryKey, (old) => {
        if (!old) return old
        const next = follow
          ? [{ company_name: name, created_at: new Date().toISOString() }, ...old.companies]
          : old.companies.filter((c) => c.company_name !== name)
        return { companies: next, total: next.length }
      })
      return { previous }
    },
    onSuccess: (result) => {
      if (result && typeof result.new_xp_balance === "number") {
        applyXpChange({ newBalance: result.new_xp_balance, action: "follow_company" })
      }
    },
    onError: (err, vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      setError({ name: vars.name, message: err instanceof Error ? err.message : "Could not update." })
    },
    onSettled: (_d, _e, vars) => {
      markPending(vars.name, false)
      // Reconcile against the server once the dust settles (IH5 ordering, total).
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const isPending = useCallback((name: string) => pending.has(name), [pending])

  const canFollow = useCallback(
    (name: string) =>
      !followedNames.includes(name) &&
      followGateReason({ name, followedNames, count, balance }) === null,
    [followedNames, count, balance],
  )

  const disabledReason = useCallback(
    (name: string): string | undefined =>
      followGateReason({ name, followedNames, count, balance }) ?? undefined,
    [followedNames, count, balance],
  )

  const follow = useCallback(
    (name: string) => {
      if (!token) return
      if (followedNames.includes(name)) return
      const blocked = followGateReason({ name, followedNames, count, balance })
      if (blocked) {
        setError({ name, message: blocked })
        return
      }
      mutation.mutate({ name, follow: true })
    },
    [token, followedNames, count, balance, mutation],
  )

  const unfollow = useCallback(
    (name: string) => {
      if (!token) return
      if (!followedNames.includes(name)) return
      mutation.mutate({ name, follow: false })
    },
    [token, followedNames, mutation],
  )

  const toggle = useCallback(
    (name: string) => {
      if (followedNames.includes(name)) unfollow(name)
      else follow(name)
    },
    [followedNames, follow, unfollow],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    companies,
    followedNames,
    count,
    isLoading,
    isPending,
    canFollow,
    disabledReason,
    follow,
    unfollow,
    toggle,
    error,
    clearError,
  }
}
