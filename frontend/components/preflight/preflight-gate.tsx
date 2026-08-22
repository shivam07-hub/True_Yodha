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
import { dataKeys, invalidateTargetRoleData } from "@/lib/domain-data"
import { applyErrorMessage } from "@/lib/preflight/apply-error"
import { visibleConflicts } from "@/lib/preflight/conflicts"
import { useOrder, useOrderMutations, usePreflightPrice, invalidateOrder } from "@/lib/preflight/use-order"
import type { LineKind, OrderProposal } from "@/lib/preflight/types"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { useXPStore } from "@/store/xpStore"
import { refreshIsLive, type UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

import { contractLine } from "@/lib/preflight/prose"
import { PreflightHeader } from "./preflight-header"
import { ScreenCanvas } from "./screen-canvas"
import { ScreenDone, ScreenRunning } from "./screen-running"

import "./preflight.css"

type Mode = "canvas" | "running" | "done"
type Verdict = "kept" | "dropped" | null

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
  const balance = useXPStore((s) => s.balance)
  const client = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: order } = useOrder(token, open)
  // Its own request. The order renders the moment IT lands; only the Run button
  // waits on this one. See `usePreflightPrice`.
  const { data: price } = usePreflightPrice(token, open)
  const { answerLine, rewordLine, addLine, apply } = useOrderMutations(token)

  const [mode, setMode] = useState<Mode>("canvas")
  const [proposals, setProposals] = useState<OrderProposal[]>([])
  const [proposalAnswers, setProposalAnswers] = useState<Record<string, Verdict>>({})
  const [pending, setPending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const turnRef = useRef(0)

  // Reset ephemeral state on every open — the order stays in the cache.
  useEffect(() => {
    if (!open) return
    setProposals([]); setProposalAnswers({}); setPending(false)
    setStarting(false); setError(null); setMode("canvas")
    turnRef.current += 1
    const t = setTimeout(() => dialogRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

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
  }, [refreshVm.state, refreshVm.errorMessage])

  const requestClose = useCallback(() => {
    if (refreshIsLive(refreshVm.state)) return
    close()
  }, [close, refreshVm.state])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, requestClose])

  const contract = useMemo(() => (order ? contractLine(order) : null), [order])

  // ── conversation turn: something new the user said ─────────────────────────
  const saySomething = useCallback(async (text: string) => {
    if (!token) return
    const turn = ++turnRef.current
    setPending(true); setError(null)
    try {
      // The server owns what "the user just said" means. Storing it first
      // means proposals reference the same order revision the review does.
      await preflight.setSaid(token, text)
      if (turn !== turnRef.current) return
      const res = await preflight.proposals(token, { utterance: text })
      if (turn !== turnRef.current) return
      setProposals(res.proposals)
      setProposalAnswers({})
      await invalidateOrder(client)
    } catch {
      if (turn !== turnRef.current) return
      setError("Myro couldn't read that just then. Your words are saved — try again.")
    } finally {
      if (turn === turnRef.current) setPending(false)
    }
  }, [client, token])

  // A proposal accepted here writes the same effect the old batch commit did,
  // one at a time — the server dedupes and every apply reads the fresh order.
  const answerProposal = useCallback(async (id: string, verdict: Verdict) => {
    setProposalAnswers((prev) => ({ ...prev, [id]: verdict }))
    if (verdict !== "kept") return
    const proposal = proposals.find((p) => p.id === id)
    if (!proposal) return
    try {
      await apply.mutateAsync({ effects: proposal.effects, origin: "preflight" })
      // Narrowing is free: the roles already scored can be re-read against the
      // new order without a run. The market sheet did this and the gate did
      // not, so the same accepted proposal changed the feed from one door and
      // not the other.
      invalidateTargetRoleData(client)
    } catch (err) {
      // Keep the server's reason — a 409 says the order changed elsewhere and
      // the user needs to see it, not a generic "didn't stick".
      setError(applyErrorMessage(err))
      setProposalAnswers((prev) => ({ ...prev, [id]: null }))
      await invalidateOrder(client)
    }
  }, [apply, client, proposals])

  /**
   * A line added straight into a slot.
   *
   * No proposals round trip and no LLM turn: the user picked the slot by
   * picking which group's "+" to press, so the kind is already known. That
   * makes the add deterministic, instant and free — the conversational path
   * stays for the case where they have a sentence rather than a line.
   */
  const addToSlot = useCallback(async (kind: LineKind, text: string) => {
    if (!token) return
    setError(null)
    try {
      await addLine.mutateAsync({ kind, text, origin: "preflight" })
    } catch (err) {
      setError(applyErrorMessage(err))
      await invalidateOrder(client)
    }
  }, [addLine, client, token])

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
  }, [client, order, refreshVm, starting, token])

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
        <PreflightHeader
          onClose={requestClose}
          closable={!refreshIsLive(refreshVm.state)}
        />

        <div className="pf-body">
          {/* `/preflight/order` runs ~8s on a cold read, and the shell used to
              render its chrome over an empty box for all of it — a titled,
              closable, entirely blank modal. Plates in outline say the same
              thing the real ones will: this is a list, it is coming. */}
          {mode === "canvas" && !order ? <CanvasSkeleton /> : null}

          {mode === "canvas" && order ? (
            <ScreenCanvas
              order={order}
              proposals={proposals}
              proposalAnswers={proposalAnswers}
              pending={pending}
              sayFirst={intent === "say"}
              price={price ?? null}
              balance={balance}
              starting={starting}
              error={error}
              onSaySomething={saySomething}
              onAnswerLine={answerLine}
              onRewordLine={rewordLine}
              onAnswerProposal={answerProposal}
              onAddLine={addToSlot}
              onOpenCoins={close}
              onRun={run}
            />
          ) : null}

          {mode === "running" ? (
            <ScreenRunning
              lifecycle={refreshVm.state === "computing" ? "computing" : "queued"}
              label={refreshVm.progressLabel}
              done={refreshVm.progressDone}
              total={refreshVm.progressTotal}
              revealed={refreshVm.revealed}
              contract={contract}
            />
          ) : null}

          {mode === "done" ? (
            <ScreenDone
              matches={refreshVm.matchesWritten ?? 0}
              scanned={refreshVm.progressTotal ?? 0}
              onSeeMatches={() => { close(); onSeeMatches() }}
              onRunAgain={() => {
                refreshVm.reset()
                setMode("canvas")
                setProposals([])
                setProposalAnswers({})
                void invalidateOrder(client)
              }}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The canvas, in outline, while the order is still in flight. */
function CanvasSkeleton() {
  return (
    <div className="pf-canvas" aria-hidden>
      <div className="pf-skeleton-head" />
      <div className="pf-plate-list">
        <div className="pf-skeleton-plate" data-w="long" />
        <div className="pf-skeleton-plate" data-w="short" />
        <div className="pf-skeleton-plate" data-w="mid" />
        <div className="pf-skeleton-plate" data-w="long" />
      </div>
    </div>
  )
}
