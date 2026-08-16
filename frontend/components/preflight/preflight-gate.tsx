"use client"

/**
 * Myro Search pre-flight — six screens, one modal, one order.
 *
 * This file owns the SHELL: which screen is showing, focus, escape, and the
 * footer for each step. Every decision about the order itself belongs to a
 * module — `lib/preflight/prose` writes the brief, `lib/preflight/use-order`
 * owns the mutations, and the server owns what a `yes` means. Nothing here
 * knows what a deal-breaker is.
 *
 * What it replaced: one screen holding a chat box, six numbered form rows, and a
 * prose sentence that fused two kinds of truth — things the user had said and
 * things Myro had inferred from 66 memory notes — with no attribution on either.
 * The sentence read "You lean toward Prefers roles in corporate functions …
 * You're heading for No." The user could not tell which clause came from where,
 * could not judge one, and could not fix one without rewriting all of it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"

import { preflight } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useOrder, useOrderMutations, invalidateOrder } from "@/lib/preflight/use-order"
import type { OrderProposal } from "@/lib/preflight/types"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { useXPStore } from "@/store/xpStore"
import type { UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

import { PreflightHeader, type Stage } from "./preflight-header"
import { ScreenSayIt } from "./screen-say-it"
import { ScreenProposals, type ProposalAnswer } from "./screen-proposals"
import { ScreenConfirm } from "./screen-confirm"
import { ScreenReview } from "./screen-review"
import { ScreenDone, ScreenRunning } from "./screen-running"
import { MyroTyping } from "./typing"

import "./preflight.css"
import "./proposals.css"

type Screen = "start" | "proposals" | "confirm" | "ready" | "running" | "done"

const STAGE_OF: Record<Screen, Stage> = {
  start: "say", proposals: "say", confirm: "confirm", ready: "run", running: "run", done: "run",
}

export function PreflightGate({
  token,
  cvUrl,
  refreshVm,
  onSeeMatches,
}: {
  token: string | null
  cvUrl?: string | null
  /** The run VM. Shared with the surface's own button so `isRefreshing` always
   *  reflects the actual run — see `useMyroSearch`. */
  refreshVm: UseJobRefreshResult
  onSeeMatches: () => void
}) {
  const open = useRefreshGateStore((s) => s.open)
  const close = useRefreshGateStore((s) => s.closeRefreshGate)
  const balance = useXPStore((s) => s.balance)
  const client = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: order } = useOrder(token, open)
  const { answer, reword, setSaid, apply } = useOrderMutations(token)

  const [screen, setScreen] = useState<Screen>("start")
  const [said, setSaidLocal] = useState("")
  const [reply, setReply] = useState("")
  const [proposals, setProposals] = useState<OrderProposal[]>([])
  const [answers, setAnswers] = useState<Record<string, ProposalAnswer>>({})
  const [rewording, setRewording] = useState<string | null>(null)
  const [rewordDraft, setRewordDraft] = useState("")
  const [round, setRound] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Reopening starts at the question. An order the user already signed off is
     still on the server — it is the SUBJECT of the next conversation, not a
     screen to resume mid-scroll. */
  useEffect(() => {
    if (!open) return
    setScreen("start"); setSaidLocal(""); setProposals([]); setAnswers({})
    setRewording(null); setRound(0); setError(null); setThinking(false)
    const t = setTimeout(() => dialogRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  /* The run's own state drives the last two screens, so the modal cannot claim
     a run finished while the stream says otherwise. */
  useEffect(() => {
    if (refreshVm.state === "computing") setScreen("running")
    else if (refreshVm.state === "done") setScreen("done")
  }, [refreshVm.state])

  const rounds = order?.rounds ?? []
  const lineById = useMemo(
    () => new Map((order?.lines ?? []).map((l) => [l.id, l] as const)),
    [order?.lines],
  )
  const marketLines = useMemo(
    () => (order?.lines ?? []).filter((l) => l.origin === "market" && l.status === "kept"),
    [order?.lines],
  )
  const unanswered = (order?.lines ?? []).filter((l) => l.status === "unanswered").length

  const requestClose = useCallback(() => {
    if (refreshVm.state === "computing") return
    close()
  }, [close, refreshVm.state])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, requestClose])

  /* ── screen 1 → 2 ────────────────────────────────────────────────────────── */

  async function submitSaid(text: string) {
    if (!token) return
    setSaidLocal(text)
    setThinking(true)
    setError(null)
    setScreen("proposals")
    try {
      await setSaid.mutateAsync(text)
      const res = await preflight.proposals(token, { utterance: text })
      setReply(res.reply || "Got it. A few changes to your order from that — say yes to the ones that are right.")
      setProposals(res.proposals)
      // Nothing to answer → the guesses are the only thing left to confirm.
      if (res.proposals.length === 0) setScreen(rounds.length ? "confirm" : "ready")
    } catch {
      setError("Myro couldn't read that just then. Your words are saved — try again, or carry on.")
      setReply("I've saved that. Let's look at what I already had.")
    } finally {
      setThinking(false)
    }
  }

  /* ── screen 2 ────────────────────────────────────────────────────────────── */

  function answerProposal(id: string, next: ProposalAnswer | null) {
    setAnswers((prev) => {
      const copy = { ...prev }
      if (next === null) delete copy[id]
      else copy[id] = next
      return copy
    })
  }

  function rewordProposal(id: string, text: string) {
    if (!text) return
    setProposals((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              value: text,
              why: "reworded by you — this is what Myro saves",
              effects: p.effects.map((e) => (e.op === "add" ? { ...e, text } : e)),
            }
          : p,
      ),
    )
    setAnswers((prev) => ({ ...prev, [id]: "kept" })) // saving a reword counts as yes
    setRewording(null)
  }

  /** Only the accepted proposals land. Unanswered ones are dropped, which is
   *  what the button said would happen. */
  async function commitProposals() {
    const accepted = proposals.filter((p) => answers[p.id] === "kept")
    if (accepted.length) {
      await apply.mutateAsync({
        effects: accepted.flatMap((p) => p.effects),
        origin: "preflight",
      }).catch(() => setError("Couldn't save those. Nothing was applied — try again."))
    }
    setScreen(rounds.length ? "confirm" : "ready")
  }

  /* ── run ─────────────────────────────────────────────────────────────────── */

  async function run() {
    if (!token) return
    setError(null)
    try {
      const result = await preflight.run(token)
      refreshVm.attach(result)
      setScreen("running")
      void invalidateOrder(client)
      void client.invalidateQueries({ queryKey: dataKeys.profile() })
    } catch (err) {
      setError((err as Error)?.message || "Couldn't start the search. Nothing was charged.")
    }
  }

  if (!open || typeof document === "undefined") return null

  const runCost = order?.run_cost ?? 0
  const free = runCost === 0
  const short = !free && balance < runCost
  const acceptedNow = proposals.filter((p) => answers[p.id] === "kept").length
  const proposalDrops = proposals.length - Object.keys(answers).length

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
        <PreflightHeader stage={STAGE_OF[screen]} onClose={requestClose} closable={refreshVm.state !== "computing"} />

        <div className="pf-body">
          {screen === "start" ? (
            <ScreenSayIt
              starters={order?.starters ?? []}
              memoryCount={order?.memory_count ?? 0}
              cvReady={(order?.cv_readiness ?? "") === "ready"}
              busy={setSaid.isPending}
              onSubmit={submitSaid}
            />
          ) : null}

          {screen === "proposals" ? (
            thinking ? (
              <div className="pf-trail">
                <div className="pf-bubble" data-from="user">{said}</div>
                <MyroTyping />
              </div>
            ) : (
              <ScreenProposals
                said={said}
                reply={reply}
                proposals={proposals}
                answers={answers}
                onAnswer={answerProposal}
                onReword={rewordProposal}
                rewording={rewording}
                onRewordOpen={(id, current) => { setRewording(id); setRewordDraft(current) }}
                onRewordClose={() => setRewording(null)}
                rewordDraft={rewordDraft}
                onRewordDraft={setRewordDraft}
              />
            )
          ) : null}

          {screen === "confirm" ? (
            <ScreenConfirm
              said={order?.said ?? said}
              marketLines={marketLines}
              rounds={rounds}
              lineById={lineById}
              activeRound={Math.min(round, Math.max(0, rounds.length - 1))}
              onPickRound={setRound}
              onAnswer={(lineId, status) => answer.mutate({ lineId, status })}
              onReword={(lineId, text) => reword.mutate({ lineId, text })}
              busy={answer.isPending || reword.isPending}
            />
          ) : null}

          {screen === "ready" && order ? (
            <ScreenReview
              order={order}
              memoryCount={order.memory_count}
              cvReady={order.cv_readiness === "ready"}
              cvHref={cvUrl || "/cv"}
              runCost={runCost}
              newJobs={order.new_jobs_count}
              balance={balance}
              onOpenCoins={close}
            />
          ) : null}

          {screen === "running" ? (
            <ScreenRunning
              label={refreshVm.progressLabel}
              done={refreshVm.progressDone}
              total={refreshVm.progressTotal}
              newJobs={order?.new_jobs_count ?? 0}
            />
          ) : null}

          {screen === "done" ? (
            <ScreenDone
              matches={refreshVm.matchesWritten ?? 0}
              scanned={refreshVm.progressTotal ?? 0}
              onSeeMatches={() => { close(); onSeeMatches() }}
              onRunAgain={() => { refreshVm.reset(); setScreen("start"); void invalidateOrder(client) }}
            />
          ) : null}

          {error ? (
            <p role="alert" className="pf-contract" style={{ color: "var(--tm-danger)" }}>{error}</p>
          ) : null}
        </div>

        <GateFooter
          screen={screen}
          thinking={thinking}
          rounds={rounds.length}
          round={round}
          unanswered={unanswered}
          proposalDrops={proposalDrops}
          acceptedNow={acceptedNow}
          free={free}
          runCost={runCost}
          short={short}
          busy={apply.isPending}
          onBack={() => {
            if (screen === "proposals") setScreen("start")
            else if (screen === "confirm") {
              if (round > 0) setRound(round - 1)
              else setScreen(proposals.length ? "proposals" : "start")
            } else if (screen === "ready") setScreen(rounds.length ? "confirm" : "start")
          }}
          onNext={() => {
            if (screen === "proposals") void commitProposals()
            else if (screen === "confirm") {
              if (round < rounds.length - 1) setRound(round + 1)
              else setScreen("ready")
            } else if (screen === "ready") void run()
          }}
        />
      </div>
    </div>,
    document.body,
  )
}

/** The footer states the cost of the next step BEFORE it is taken — how many
 *  guesses get dropped, and what the run charges. */
function GateFooter({
  screen, thinking, rounds, round, unanswered, proposalDrops, acceptedNow,
  free, runCost, short, busy, onBack, onNext,
}: {
  screen: Screen; thinking: boolean; rounds: number; round: number; unanswered: number
  proposalDrops: number; acceptedNow: number
  free: boolean; runCost: number; short: boolean; busy: boolean
  onBack: () => void; onNext: () => void
}) {
  if (screen === "start" || screen === "running" || screen === "done") return null

  // While Myro is still reading, there is nothing to continue TO. The button was
  // offering "Continue · keep 0" over an empty card — a true count of a list
  // that has not arrived, which reads as "Myro found nothing" and invites the
  // one click that skips the proposals. Going back is still valid, so the bar
  // stays (no height jump) and only the primary waits.
  if (screen === "proposals" && thinking) {
    return (
      <div className="pf-foot">
        <button type="button" className="pf-btn pf-btn-ghost tm-control-focus" onClick={onBack}>
          ← say it differently
        </button>
      </div>
    )
  }

  const backLabel =
    screen === "proposals" ? "← say it differently"
      : screen === "confirm" ? (round > 0 ? "← previous round" : "← back to what Myro heard")
        : "← change an answer"

  const nextLabel =
    screen === "proposals"
      ? proposalDrops > 0 ? `Continue · drop ${proposalDrops}` : `Continue · keep ${acceptedNow}`
      : screen === "confirm"
        ? round < rounds - 1 ? "Next round" : "Review the order"
        : free ? "▸ Run · Free" : `▸ Run · ${runCost}`

  return (
    <div className="pf-foot">
      <button type="button" className="pf-btn pf-btn-ghost tm-control-focus" onClick={onBack}>
        {backLabel}
      </button>
      <div className="pf-foot-right">
        {screen === "confirm" && unanswered > 0 ? (
          <span className="pf-drop-note">{unanswered} unanswered → dropped</span>
        ) : null}
        <button
          type="button"
          className="pf-btn pf-btn-primary tm-control-focus"
          onClick={onNext}
          disabled={busy || (screen === "ready" && short)}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
