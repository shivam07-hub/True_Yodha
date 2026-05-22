"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { type QueryClient } from "@tanstack/react-query"
import { jobs, type RefreshStateResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { clearLocalCache, userCacheKey } from "@/lib/local-cache"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"

export const REFRESH_XP_COST = XP_POLICY.matchRefreshCost

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 30_000

export type RefreshState =
  | "idle"
  | "charging"
  | "computing"
  | "done"
  | "error_insufficient_xp"
  | "error_failed"

export interface UseJobRefreshResult {
  state: RefreshState
  progressLabel: string | null
  cost: number
  canAfford: boolean
  matchesWritten: number | null
  errorMessage: string | null
  refresh: () => void
  reset: () => void
}

/** Job Refresh view-model — see CONTEXT.md "Job Refresh". */
export function useJobRefresh(
  token: string | null,
  queryClient: QueryClient,
): UseJobRefreshResult {
  const balance = useXPStore((s) => s.balance)
  const setBalance = useXPStore((s) => s.setBalance)

  const [state, setState] = useState<RefreshState>("idle")
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [matchesWritten, setMatchesWritten] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollDeadline = useRef<number>(0)
  const activeTicket = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    activeTicket.current = null
  }, [])

  const handleTerminal = useCallback(
    (payload: RefreshStateResponse) => {
      stopPolling()
      if (payload.new_xp_balance != null) setBalance(payload.new_xp_balance)
      if (payload.state === "failed") {
        setState("error_failed")
        setErrorMessage(payload.error || "Refresh failed. Please try again.")
        setProgressLabel(null)
        return
      }
      setState("done")
      setProgressLabel(payload.progress_label)
      setMatchesWritten(payload.matches_written ?? 0)
      if (token) clearLocalCache(userCacheKey(token, ["matches"]))
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
    },
    [queryClient, setBalance, stopPolling, token],
  )

  const poll = useCallback(async () => {
    const ticketId = activeTicket.current
    if (!token || !ticketId) {
      stopPolling()
      return
    }
    if (Date.now() > pollDeadline.current) {
      stopPolling()
      setState("error_failed")
      setErrorMessage("Refresh timed out. Try again — XP will be refunded if compute didn't run.")
      setProgressLabel(null)
      return
    }
    try {
      const payload = await jobs.refreshStatus(token, ticketId)
      if (payload.state === "computing" || payload.state === "queued") {
        setProgressLabel(payload.progress_label)
        return
      }
      handleTerminal(payload)
    } catch (err) {
      stopPolling()
      setState("error_failed")
      setErrorMessage((err as Error).message || "Lost connection to refresh status.")
      setProgressLabel(null)
    }
  }, [handleTerminal, stopPolling, token])

  const startPolling = useCallback(
    (ticketId: string) => {
      stopPolling()
      activeTicket.current = ticketId
      pollDeadline.current = Date.now() + POLL_TIMEOUT_MS
      pollTimer.current = setInterval(poll, POLL_INTERVAL_MS)
    },
    [poll, stopPolling],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    if (state === "charging" || state === "computing") return
    if (balance < REFRESH_XP_COST) {
      setState("error_insufficient_xp")
      setErrorMessage(
        `Not enough XP. Refresh costs ${REFRESH_XP_COST} XP (refunded if no new matches are found).`,
      )
      setProgressLabel(null)
      return
    }
    setState("charging")
    setErrorMessage(null)
    setMatchesWritten(null)
    setProgressLabel("Charging XP")
    try {
      const ticket = await jobs.refresh(token)
      setBalance(ticket.new_xp_balance)
      setState("computing")
      setProgressLabel(ticket.progress_label)
      startPolling(ticket.id)
    } catch (err) {
      const msg = (err as Error).message || ""
      if (msg.includes("Insufficient XP")) {
        setState("error_insufficient_xp")
        setErrorMessage(
          `Not enough XP. Refresh costs ${REFRESH_XP_COST} XP (refunded if no new matches are found).`,
        )
      } else {
        setState("error_failed")
        setErrorMessage(msg || "Refresh failed. Please try again.")
      }
      setProgressLabel(null)
    }
  }, [balance, setBalance, startPolling, state, token])

  const reset = useCallback(() => {
    stopPolling()
    setState("idle")
    setProgressLabel(null)
    setMatchesWritten(null)
    setErrorMessage(null)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return {
    state,
    progressLabel,
    cost: REFRESH_XP_COST,
    canAfford: balance >= REFRESH_XP_COST,
    matchesWritten,
    errorMessage,
    refresh,
    reset,
  }
}
