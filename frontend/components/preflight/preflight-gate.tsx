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

import { preflight, tracks as tracksApi } from "@/lib/api"
import { dataKeys, invalidateTargetRoleData } from "@/lib/domain-data"
import { applyErrorMessage } from "@/lib/preflight/apply-error"
import { visibleConflicts } from "@/lib/preflight/conflicts"
import { useOrder, useOrderMutations, usePreflightPrice, invalidateOrder } from "@/lib/preflight/use-order"
import type { LineKind, OrderProposal } from "@/lib/preflight/types"
import { useMatchRunStore } from "@/store/matchRunStore"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { useXPStore } from "@/store/xpStore"
import { refreshIsLive, type UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

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
  const setHold = useMatchRunStore((s) => s.setHold)
  const balance = useXPStore((s) => s.balance)
  const client = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: order } = useOrder(token, open)
  // Its own request. The order renders the moment IT lands; only the Run button
  // waits on this one. See `usePreflightPrice`.
  const { data: price } = usePreflightPrice(token, open)
  const { answerLine, rewordLine, addLine, apply, undo } = useOrderMutations(token)

  const [mode, setMode] = useState<Mode>("canvas")
  const [proposals, setProposals] = useState<OrderProposal[]>([])
  const [proposalAnswers, setProposalAnswers] = useState<Record<string, Verdict>>({})
  const [pending, setPending] = useState(false)
  /** `order.log` length when this modal opened. Everything before it is
   *  history; everything after it is something the user just did. */
  const [logBase, setLogBase] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const turnRef = useRef(0)

  // Reset ephemeral state on every open — the order stays in the cache.
  useEffect(() => {
    if (!open) return
    setProposals([]); setProposalAnswers({}); setPending(false)
    setStarting(false); setError(null); setMode("canvas"); setLogBase(null)
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
   * Dropping a line is otherwise a ONE-WAY DOOR: the plates render the
   * resolver's placed lines, the heard fold renders unanswered ones, and a
   * dropped line appears in neither — so a mis-tap on a statement the user
   * wanted was unrecoverable without retyping it. The reversal machinery
   * (`log`, `LogEntry.prev`, `lines.undo`) has existed and been tested since
   * the order shipped; the market bottom-sheet was its only caller, and
   * deleting that surface orphaned it.
   *
   * The LAST entry only. The sheet showed a running changelog; a list of
   * everything you have done is chrome, and one step back is what a mis-tap
   * actually needs.
   */
  const undoable = useMemo(() => {
    if (!order || logBase === null || order.log.length <= logBase) return null
    return order.log[order.log.length - 1] ?? null
  }, [order, logBase])

  const undoLast = useCallback(async (entryId: string) => {
    setError(null)
    try {
      await undo.mutateAsync(entryId)
    } catch (err) {
      setError(applyErrorMessage(err))
      await invalidateOrder(client)
    }
  }, [client, undo])

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

  /**
   * A named topic — the deterministic half of "something's off".
   *
   * `proposals.from_topic` answers it off a table: no LLM turn, no cost, and it
   * can strike a kept line the topic is about ("no senior management" is what
   * caps the level). A chip is only worth offering INSTEAD of a blank line
   * because of that — routing it through the mentor as a sentence, which is
   * what the say band did on its first pass, spends a turn re-deriving
   * something the click already said.
   *
   * It does not touch `said`: sentence one of the brief is the work the user
   * wants, not the complaint they have about the results.
   */
  const proposeTopic = useCallback(async (topic: string) => {
    if (!token) return
    const turn = ++turnRef.current
    setPending(true); setError(null)
    try {
      const res = await preflight.proposals(token, { topic })
      if (turn !== turnRef.current) return
      setProposals(res.proposals)
      setProposalAnswers({})
    } catch {
      if (turn !== turnRef.current) return
      setError("Myro couldn't read that just then. Nothing changed — try again.")
    } finally {
      if (turn === turnRef.current) setPending(false)
    }
  }, [token])

  // A proposal accepted here writes the same effect the old batch commit did,
  // one at a time — the server dedupes and every apply reads the fresh order.
  const answerProposal = useCallback(async (id: string, verdict: Verdict) => {
    setProposalAnswers((prev) => ({ ...prev, [id]: verdict }))
    if (verdict !== "kept") return
    const proposal = proposals.find((p) => p.id === id)
    if (!proposal) return
    /**
     * A SECOND SEARCH is not an order edit.
     *
     * `/order/apply` acts on add and drop, so an `open_track` effect sent there
     * is a silent no-op — the user would say yes and nothing would exist. It
     * goes to `POST /tracks`, which re-checks the gate at write time: the
     * proposal was built when `can_open` was true, and it may not be by the
     * time the yes lands. A 409 there is not a failure to hide, it is the
     * reason, and the server writes it in words that never say "locked".
     */
    const track = proposal.effects.find((e) => e.op === "open_track")
    if (track) {
      try {
        await tracksApi.open(token!, {
          label: track.text,
          role_titles: track.role_titles ?? [],
        })
      } catch (err) {
        setError((err as Error)?.message || "Couldn't open that search just now.")
        setProposalAnswers((prev) => ({ ...prev, [id]: null }))
      }
      return
    }
    try {
      await apply.mutateAsync({ effects: proposal.effects, origin: "preflight" })
      // Narrowing is free: the roles already scored can be re-read against the
      // new order without a run. The market sheet did this and the gate did
      // not, so the same accepted proposal changed the feed from one door and
      // not the other.
      //
      // A WIDENING proposal is the opposite — it brings roles into scope that
      // have never been rated, and re-reading cannot rate them. Refetching the
      // feed there spends a read to show the user the same list, which is how
      // "I accepted it and nothing happened" becomes "I accepted it and it
      // took a second to not happen". The server already classifies which is
      // which; it just had nobody listening.
      if (!proposal.costly) invalidateTargetRoleData(client)
    } catch (err) {
      // Keep the server's reason — a 409 says the order changed elsewhere and
      // the user needs to see it, not a generic "didn't stick".
      setError(applyErrorMessage(err))
      setProposalAnswers((prev) => ({ ...prev, [id]: null }))
      await invalidateOrder(client)
    }
  }, [apply, client, proposals, token])

  /**
   * A line added straight into a slot.
   *
   * No proposals round trip and no LLM turn: the user picked the slot by
   * picking which group's "+" to press, so the kind is already known. That
   * makes the add deterministic, instant and free — the conversational path
   * stays for the case where they have a sentence rather than a line.
   */
  const addToSlot = useCallback(async (kind: LineKind, text: string, roleFamily?: string) => {
    if (!token) return
    setError(null)
    try {
      await addLine.mutateAsync({ kind, text, origin: "preflight", role_family: roleFamily })
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
                    setProposals([])
                    setProposalAnswers({})
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
