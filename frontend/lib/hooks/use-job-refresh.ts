"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { jobs, type RefreshOutcomeKind } from "@/lib/api"
import { JOB_MATCHES_CACHE_PARTS, LEGACY_JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import { clearLocalCache, userCacheKey } from "@/lib/local-cache"
import { readSse, type SseEvent } from "@/lib/streaming/read-sse"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { useMatchRunStore } from "@/store/matchRunStore"
import { useXPStore } from "@/store/xpStore"

export const REFRESH_XP_COST = MYRO_COINS_POLICY.matchRefreshCost

export type RefreshState =
  | "idle"
  | "charging"
  | "queued"
  | "computing"
  | "done"
  | "error_insufficient_xp"
  | "error_failed"

export type { RefreshOutcomeKind }

/** A search the user is waiting on — not dismissible, not re-clicked. */
export function refreshIsLive(state: RefreshState): boolean {
  return state === "charging" || state === "queued" || state === "computing"
}

function lifecycleOf(ticketState: string | undefined): RefreshState {
  if (ticketState === "computing") return "computing"
  if (ticketState === "done") return "done"
  return "queued"
}

function tokenizedErrorMessage(message: string): string {
  return message.replace(/\bxp\b/gi, "tokens")
}

export interface RevealedJob {
  title: string | null
  company: string | null
}

export interface UseJobRefreshResult {
  state: RefreshState
  progressLabel: string | null
  cost: number
  canAfford: boolean
  matchesWritten: number | null
  outcomeKind: RefreshOutcomeKind | null
  errorMessage: string | null
  /** Per-job reveal (ADR-0009): jobs ranked so far / total shortlisted. */
  progressDone: number | null
  progressTotal: number | null
  revealed: RevealedJob[]
  refresh: () => void
  /** Stream a run that was ALREADY dispatched and charged elsewhere.
   *
   *  The pre-flight signs its order off through `POST /preflight/run`, which
   *  projects the kept lines onto the profile and then starts the same
   *  `JobRefresh`. Calling `refresh()` afterwards would charge a second time for
   *  one search, so the gate hands the ticket here instead. One run path, one
   *  charge, one progress stream. */
  attach: (ticket: AttachedTicket) => void
  reset: () => void
}

export interface AttachedTicket {
  ticket_id: string
  state?: "queued" | "computing" | "done"
  progress_label: string
  new_coin_balance?: number | null
}

interface DoneResult {
  matches_written?: number | null
  outcome_kind?: RefreshOutcomeKind | null
  new_coin_balance?: number | null
  progress_label?: string | null
}

interface ErrResult {
  state?: string
  new_coin_balance?: number | null
}

/** Job Refresh view-model — see CONTEXT.md "Job Refresh". ADR-0009 PR2: a single
 *  SSE stream replaces the old 1s status poll. */
export function useJobRefresh(token: string | null): UseJobRefreshResult {
  const balance = useXPStore((s) => s.balance)
  const applyXpChange = useXPStore((s) => s.applyXpChange)

  const [state, setState] = useState<RefreshState>("idle")
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [matchesWritten, setMatchesWritten] = useState<number | null>(null)
  const [outcomeKind, setOutcomeKind] = useState<RefreshOutcomeKind | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progressDone, setProgressDone] = useState<number | null>(null)
  const [progressTotal, setProgressTotal] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<RevealedJob[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const setRanking = useMatchRunStore((s) => s.setRanking)

  useEffect(() => {
    setRanking(refreshIsLive(state))
    return () => setRanking(false)
  }, [state, setRanking])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const finishDone = useCallback(
    (result: DoneResult) => {
      stopStream()
      if (result.new_coin_balance != null) {
        applyXpChange({ newBalance: result.new_coin_balance, action: "match_refresh" })
      }
      setState("done")
      setProgressLabel(result.progress_label ?? null)
      setMatchesWritten(result.matches_written ?? 0)
      setOutcomeKind(result.outcome_kind ?? null)
      if (token) {
        clearLocalCache(userCacheKey(token, JOB_MATCHES_CACHE_PARTS))
        clearLocalCache(userCacheKey(token, LEGACY_JOB_MATCHES_CACHE_PARTS))
      }
      // Do not invalidate the feed here. The search still holds the lane until
      // the user looks at the matches — a feed/warm refetch now is the 73s
      // judgment-lane call that races the ranking that just finished.
    },
    [applyXpChange, stopStream, token],
  )

  const finishError = useCallback(
    (message: string, refundBalance?: number | null) => {
      stopStream()
      if (refundBalance != null) {
        applyXpChange({ newBalance: refundBalance, action: "match_refresh" })
      }
      setState("error_failed")
      setErrorMessage(message)
      setProgressLabel(null)
      setOutcomeKind(null)
    },
    [applyXpChange, stopStream],
  )

  const startStream = useCallback(
    (ticketId: string) => {
      if (!token) return
      stopStream()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const onEvent = (ev: SseEvent) => {
        if (ev.type === "phase") {
          setProgressLabel((ev.label as string) ?? null)
          if (ev.phase === "queued") setState("queued")
          else if (ev.phase === "computing") setState("computing")
        } else if (ev.type === "progress") {
          setState("computing")
          setProgressDone((ev.done as number) ?? null)
          setProgressTotal((ev.total as number) ?? null)
          setRevealed(((ev.revealed as RevealedJob[]) ?? []).filter((r) => r && (r.title || r.company)))
        } else if (ev.type === "done") {
          finishDone((ev.result as DoneResult) ?? {})
        } else if (ev.type === "error") {
          const res = (ev.result as ErrResult) ?? {}
          finishError((ev.message as string) || "Refresh failed. Please try again.", res.new_coin_balance)
        }
      }

      void readSse(`/jobs/refresh/${ticketId}/stream`, token, onEvent, ctrl.signal).catch(
        (err: unknown) => {
          if ((err as Error)?.name === "AbortError") return
          finishError((err as Error)?.message || "Lost connection to refresh status.")
        },
      )
    },
    [token, stopStream, finishDone, finishError],
  )

  const refresh = useCallback(async () => {
    if (!token) return
    if (refreshIsLive(state)) return
    if (balance < REFRESH_XP_COST) {
      setState("error_insufficient_xp")
      setErrorMessage(`Not enough tokens. Refresh costs ${REFRESH_XP_COST} tokens.`)
      setProgressLabel(null)
      setOutcomeKind(null)
      return
    }
    setState("charging")
    setErrorMessage(null)
    setMatchesWritten(null)
    setOutcomeKind(null)
    setProgressDone(null)
    setProgressTotal(null)
    setRevealed([])
    setProgressLabel("Charging tokens")
    try {
      const ticket = await jobs.refresh(token)
      if (ticket.new_coin_balance != null) {
        applyXpChange({ newBalance: ticket.new_coin_balance, action: "match_refresh" })
      }
      setState(lifecycleOf(ticket.state))
      setProgressLabel(ticket.progress_label)
      startStream(ticket.id)
    } catch (err) {
      const msg = (err as Error).message || ""
      const normalizedMsg = msg.toLowerCase()
      if (normalizedMsg.includes("insufficient xp") || normalizedMsg.includes("insufficient tokens")) {
        setState("error_insufficient_xp")
        setErrorMessage(`Not enough tokens. Refresh costs ${REFRESH_XP_COST} tokens.`)
      } else {
        setState("error_failed")
        setErrorMessage(msg ? tokenizedErrorMessage(msg) : "Refresh failed. Please try again.")
      }
      setProgressLabel(null)
      setOutcomeKind(null)
    }
  }, [balance, applyXpChange, startStream, state, token])

  const attach = useCallback(
    (ticket: AttachedTicket) => {
      if (ticket.new_coin_balance != null) {
        applyXpChange({ newBalance: ticket.new_coin_balance, action: "match_refresh" })
      }
      setErrorMessage(null)
      setMatchesWritten(null)
      setOutcomeKind(null)
      setProgressDone(null)
      setProgressTotal(null)
      setRevealed([])
      setState(lifecycleOf(ticket.state))
      setProgressLabel(ticket.progress_label)
      startStream(ticket.ticket_id)
    },
    [applyXpChange, startStream],
  )

  const reset = useCallback(() => {
    stopStream()
    setState("idle")
    setProgressLabel(null)
    setMatchesWritten(null)
    setOutcomeKind(null)
    setErrorMessage(null)
    setProgressDone(null)
    setProgressTotal(null)
    setRevealed([])
  }, [stopStream])

  useEffect(() => () => stopStream(), [stopStream])

  return {
    state,
    progressLabel,
    cost: REFRESH_XP_COST,
    canAfford: balance >= REFRESH_XP_COST,
    matchesWritten,
    outcomeKind,
    errorMessage,
    progressDone,
    progressTotal,
    revealed,
    refresh,
    attach,
    reset,
  }
}
