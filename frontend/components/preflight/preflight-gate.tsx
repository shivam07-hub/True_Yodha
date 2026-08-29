"use client"

/**
 * Myro Search — one canvas, one modal, one order, ONE DOOR.
 *
 * /market carried two buttons side by side: "Not it? Tell Myro →" opened a
 * bottom sheet, "Myro Search" opened this. Both called
 * `/preflight/proposals`, both wrote the same `preflight_orders` row, both ran
 * on the same engine — and nothing on screen said so, so telling Myro what was
 * wrong and making it count were two separate errands. The sheet also priced
 * its own apply from a client constant ("Apply & re-run · 150") while the run
 * costs `MATCH_RUN_COST`.
 *
 * There is one modal now, with two landings: `intent: "review"` opens on the
 * slots ("here is what I will search for"), `intent: "say"` opens on the say
 * band ("something is off — tell me"). Same order, same proposals, same price,
 * one place to look.
 *
 * The shell owns the fewest things possible: the modal chrome, escape, the
 * three lifecycle modes (canvas · running · done), and the network turns that
 * mutate the order or dispatch a run. Every decision about a line, a guess,
 * or a conflict lives inside `<ScreenCanvas>`; every decision about the wait
 * lives inside `<ScreenRunning>` / `<ScreenDone>`.
 *
 * What this replaced: a shell that walked the user through six named screens
 * (start · proposals · confirm · ready · running · done), each state its own
 * mode, none of them the whole picture. Signing off happened four steps from
 * seeing the order. The canvas moves the review to the top; the running and
 * done overlays keep the shell's shape when a run takes over.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"

import { preflight } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { visibleConflicts } from "@/lib/preflight/conflicts"
import { useOrder, usePreflightPrice, invalidateOrder } from "@/lib/preflight/use-order"
import { useMatchRunStore } from "@/store/matchRunStore"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { useXPStore } from "@/store/xpStore"
import { refreshIsLive, type UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

import { useOrderTurns } from "./use-order-turns"

import { Journey } from "./journey"
import { PreflightHeader } from "./preflight-header"
import { ScreenDone, ScreenRunning } from "./screen-running"

import "./preflight.css"
import "./surface.css"
import "./journey.css"
// Dropped by `bfd99924` (the canvas rebuild) and imported by nothing for two
// days: `screen-running.tsx` says the shell loads it, and the shell did not.
// Both wait screens — the hero, the streaming stack, the count, and every
// number on "Run complete" — rendered with no rules at all.
import "./screen-running.css"

type Mode = "canvas" | "running" | "done"

export function PreflightGate({
  token,
  refreshVm,
  onSeeMatches,
}: {
  token: string | null
  /** Run VM shared with the surface's own button — see `useMyroSearch`. */
  refreshVm: UseJobRefreshResult
  onSeeMatches: () => void
}) {
  const open = useRefreshGateStore((s) => s.open)
  const intent = useRefreshGateStore((s) => s.intent)
  const close = useRefreshGateStore((s) => s.closeRefreshGate)
  const setHold = useMatchRunStore((s) => s.setHold)
  const balance = useXPStore((s) => s.balance)
  const client = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: order } = useOrder(token, open)
  // Its own request. The order renders the moment IT lands; only the Run button
  // waits on this one. See `usePreflightPrice`.
  const { data: price } = usePreflightPrice(token, open)
  const {
    answerLine, rewordLine,
    proposals, proposalAnswers, pending, error,
    setError, reset: resetTurns,
    undoLast, saySomething, proposeTopic, answerProposal, addToSlot,
  } = useOrderTurns(token)

  const [mode, setMode] = useState<Mode>("canvas")
  /** `order.log` length when this modal opened. Everything before it is
   *  history; everything after it is something the user just did. */
  const [logBase, setLogBase] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)

  // Reset ephemeral state on every open — the order stays in the cache.
  useEffect(() => {
    if (!open) return
    resetTurns()
    setStarting(false); setMode("canvas"); setLogBase(null)
    const t = setTimeout(() => dialogRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open, resetTurns])

  // A refresh's own state drives the wait modes. A failure returns to the
  // canvas so the user can try again — sitting on a frozen log was the trap.
  useEffect(() => {
    if (refreshVm.state === "queued" || refreshVm.state === "computing") setMode("running")
    else if (refreshVm.state === "done") setMode("done")
    else if (refreshVm.state === "error_failed" || refreshVm.state === "error_insufficient_xp") {
      setStarting(false)
      setError(refreshVm.errorMessage)
      setMode("canvas")
    }
  }, [refreshVm.state, refreshVm.errorMessage, setError])

  // Ranking is J0 for as long as this modal is the wait. Feed/warm/rails stay
  // paused through "Run complete" so a 73s judgment-lane call cannot start
  // behind the glass. Lifted when they look, or when they leave the wait.
  useEffect(() => {
    setHold(open && (starting || mode === "running" || mode === "done"))
    return () => setHold(false)
  }, [open, starting, mode, setHold])

  const releaseAfterRun = useCallback(() => {
    setHold(false)
    void client.invalidateQueries({ queryKey: dataKeys.jobs() })
    void client.invalidateQueries({ queryKey: ["jobFeed"] })
  }, [client, setHold])

  const requestClose = useCallback(() => {
    if (refreshIsLive(refreshVm.state)) return
    if (refreshVm.state === "done") releaseAfterRun()
    close()
  }, [close, refreshVm.state, releaseAfterRun])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, requestClose])

  // The log accumulates for the life of the order, so "the last entry" is not
  // the same question as "the thing you just did". Baseline it on open.
  useEffect(() => {
    if (!open || !order) return
    setLogBase((base) => (base === null ? order.log.length : base))
  }, [open, order])

  /**
   * The one change this session that can be taken back.
   *
   * Dropping a line is otherwise a ONE-WAY DOOR: the groups render the
   * resolver's placed lines, the asks render the unanswered ones, and a dropped
   * line appears in neither — so a mis-tap on a statement the user wanted was
   * unrecoverable without retyping it. The reversal machinery (`log`,
   * `LogEntry.prev`, `lines.undo`) has existed and been tested since the order
   * shipped; the market bottom-sheet was its only caller, and deleting that
   * surface orphaned it.
   *
   * The LAST entry only. The sheet showed a running changelog; a list of
   * everything you have done is chrome, and one step back is what a mis-tap
   * actually needs.
   */
  const undoable = useMemo(() => {
    if (!order || logBase === null || order.log.length <= logBase) return null
    return order.log[order.log.length - 1] ?? null
  }, [order, logBase])


  // ── run ────────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (!token || starting) return
    if (order && visibleConflicts(order).length > 0) return
    setStarting(true); setError(null)
    try {
      const result = await preflight.run(token)
      refreshVm.attach(result)
      setMode("running")
      await invalidateOrder(client)
      void client.invalidateQueries({ queryKey: dataKeys.profile() })
    } catch (err) {
      // The server stamps the ticket only after the charge succeeds. Never
      // promise "nothing was charged" for a request whose outcome we did not
      // see — say what's true.
      setError((err as Error)?.message || "Couldn't start the search. Try again in a moment.")
    } finally {
      setStarting(false)
    }
  }, [client, order, refreshVm, setError, starting, token])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="pf-scrim" onClick={requestClose} role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Myro Search"
        className="pf-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The journey renders its own header — the ribbon is a step control,
            not modal chrome, and the back chevron only exists while there is a
            step to go back to. The wait screens keep the bare header. */}
        {mode === "canvas" && order ? (
          <Journey
            order={order}
            proposals={proposals}
            proposalAnswers={proposalAnswers}
            pending={pending}
            intent={intent}
            price={price ?? null}
            balance={balance}
            starting={starting}
            error={error}
            closable={!refreshIsLive(refreshVm.state)}
            onClose={requestClose}
            onSaySomething={saySomething}
            onProposeTopic={proposeTopic}
            onAnswerLine={answerLine}
            onRewordLine={rewordLine}
            onAnswerProposal={answerProposal}
            onAddLine={addToSlot}
            undoable={undoable}
            onUndo={undoLast}
            onOpenCoins={close}
            onRun={run}
          />
        ) : (
          <>
            <PreflightHeader
              onClose={requestClose}
              closable={!refreshIsLive(refreshVm.state)}
            />
            <div className="pf-body">
              {/* `/preflight/order` runs ~8s on a cold read, and the shell used
                  to render its chrome over an empty box for all of it — a
                  titled, closable, entirely blank modal. The outline says the
                  same thing the real screen will: this is a list, it is
                  coming. */}
              {mode === "canvas" ? <StepSkeleton /> : null}

              {mode === "running" ? (
                <ScreenRunning
                  lifecycle={refreshVm.state === "computing" ? "computing" : "queued"}
                  label={refreshVm.progressLabel}
                  done={refreshVm.progressDone}
                  total={refreshVm.progressTotal}
                  revealed={refreshVm.revealed}
                />
              ) : null}

              {mode === "done" ? (
                <ScreenDone
                  matches={refreshVm.matchesWritten ?? 0}
                  onSeeMatches={() => {
                    releaseAfterRun()
                    close()
                    onSeeMatches()
                  }}
                  onRunAgain={() => {
                    refreshVm.reset()
                    setMode("canvas")
                    resetTurns()
                    void invalidateOrder(client)
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** The first step, in outline, while the order is still in flight. */
function StepSkeleton() {
  return (
    <div className="pf-step" aria-hidden>
      <div className="pf-step-head">
        <div className="pf-skeleton-head" />
      </div>
      <div className="pf-chips">
        <div className="pf-skeleton-chip" data-w="mid" />
        <div className="pf-skeleton-chip" data-w="short" />
        <div className="pf-skeleton-chip" data-w="long" />
      </div>
    </div>
  )
}
