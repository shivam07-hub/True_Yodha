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
import { openingScreen } from "@/lib/preflight/opening-screen"
import { useOrder, useOrderMutations, invalidateOrder } from "@/lib/preflight/use-order"
import type { OrderProposal } from "@/lib/preflight/types"
import { useRefreshGateStore } from "@/store/refreshGateStore"
import { useXPStore } from "@/store/xpStore"
import { refreshIsLive, type UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

import { PreflightHeader, type Stage } from "./preflight-header"
import { ScreenSayIt } from "./screen-say-it"
import { ScreenProposals, type ProposalAnswer } from "./screen-proposals"
import { ScreenConfirm } from "./screen-confirm"
import { ScreenReview } from "./screen-review"
import { ScreenDone, ScreenRunning } from "./screen-running"
import { MyroTyping } from "./typing"
import { UserSaidBubble } from "./user-said-bubble"
import { GateFooter } from "./gate-footer"

import "./preflight.css"
import "./proposals.css"

type Screen = "start" | "proposals" | "confirm" | "ready" | "running" | "done"

const STAGE_OF: Record<Screen, Stage> = {
  start: "say", proposals: "say", confirm: "confirm", ready: "run", running: "run", done: "run",
}

export function PreflightGate({
  token,
  refreshVm,
  onSeeMatches,
}: {
  token: string | null
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
  const { answerLine, rewordLine, setSaid, apply } = useOrderMutations(token)

  const [screen, setScreen] = useState<Screen>("start")
  const [said, setSaidLocal] = useState("")
  const [reply, setReply] = useState("")
  const [proposals, setProposals] = useState<OrderProposal[]>([])
  const [answers, setAnswers] = useState<Record<string, ProposalAnswer>>({})
  const [rewording, setRewording] = useState<string | null>(null)
  const [rewordDraft, setRewordDraft] = useState("")
  const [round, setRound] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freshStart, setFreshStart] = useState(false)
  const [seated, setSeated] = useState(false)
  const turnRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setSeated(false)
      setFreshStart(false)
      return
    }
    setSaidLocal(""); setProposals([]); setAnswers({})
    setRewording(null); setRound(0); setError(null); setThinking(false); setStarting(false)
    turnRef.current += 1
    const t = setTimeout(() => dialogRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || seated) return
    const next = openingScreen(order, freshStart)
    if (!next) return
    setSeated(true)
    setScreen(next)
  }, [open, order, freshStart, seated])

  /* The run's own state drives the last two screens, so the modal cannot claim
     a run finished while the stream says otherwise. A failed stream returns to
     review so they can try again — sitting on a frozen log line was the trap. */
  useEffect(() => {
    if (refreshVm.state === "queued" || refreshVm.state === "computing") setScreen("running")
    else if (refreshVm.state === "done") setScreen("done")
    else if (refreshVm.state === "error_failed" || refreshVm.state === "error_insufficient_xp") {
      setStarting(false)
      setError(refreshVm.errorMessage)
      setScreen("ready")
    }
  }, [refreshVm.state, refreshVm.errorMessage])

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
    if (refreshIsLive(refreshVm.state)) return
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
    const turn = ++turnRef.current
    setSaidLocal(text)
    setThinking(true)
    setError(null)
    setScreen("proposals")
    try {
      await setSaid.mutateAsync(text)
      if (turn !== turnRef.current) return
      const res = await preflight.proposals(token, { utterance: text })
      if (turn !== turnRef.current) return
      setReply(res.reply || "Got it. Say yes to the ones that are right.")
      setProposals(res.proposals)
      // Nothing to answer → the guesses are the only thing left to confirm.
      if (res.proposals.length === 0) setScreen(rounds.length ? "confirm" : "ready")
    } catch {
      if (turn !== turnRef.current) return
      setError("Myro couldn't read that just then. Your words are saved — try again, or carry on.")
      setReply("I've saved that. Let's look at what I already had.")
    } finally {
      if (turn === turnRef.current) setThinking(false)
    }
  }

  function editSaid() {
    turnRef.current += 1
    setThinking(false)
    setError(null)
    setProposals([])
    setAnswers({})
    setRewording(null)
    setScreen("start")
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

  /** Single-flight. The run CHARGES, and this button had no in-flight guard: a
   *  sign-off that takes a few seconds looks like nothing happened, the user
   *  presses again, and every call that reaches the server is another debit.
   *  The server refuses to charge twice inside its dedupe window too — a client
   *  guard does not survive two tabs or a reload — but the click must not queue
   *  a second charge in the first place. */
  async function run() {
    if (!token || starting) return
    setStarting(true)
    setError(null)
    try {
      const result = await preflight.run(token)
      refreshVm.attach(result)
      setScreen("running")
      void invalidateOrder(client)
      void client.invalidateQueries({ queryKey: dataKeys.profile() })
    } catch (err) {
      // The server either charged and dispatched, or did neither — it stamps the
      // ticket only after the charge succeeds. Never promise "nothing was
      // charged" for a request whose outcome we did not see.
      setError((err as Error)?.message || "Couldn't start the search. Try again in a moment.")
      setStarting(false)
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
        <PreflightHeader
          stage={STAGE_OF[screen]}
          compact={screen === "start"}
          confirmProgress={
            screen === "confirm" && rounds.length > 0
              ? { current: round + 1, total: rounds.length }
              : undefined
          }
          onClose={requestClose}
          closable={!refreshIsLive(refreshVm.state)}
        />

        <div className="pf-body">
          {!(seated || screen === "running" || screen === "done") ? null : (
            <>
          {screen === "start" && seated ? (
            <ScreenSayIt
              draft={said}
              starters={order?.starters ?? []}
              memoryCount={order?.memory_count ?? 0}
              cvReady={(order?.cv_readiness ?? "") === "ready"}
              newJobs={order?.new_jobs_count ?? 0}
              runCost={runCost}
              balance={balance}
              busy={setSaid.isPending}
              onSubmit={submitSaid}
            />
          ) : null}

          {screen === "proposals" ? (
            thinking ? (
              <div className="pf-trail">
                <UserSaidBubble text={said} onEdit={editSaid} />
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
                onEditSaid={editSaid}
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
              onAnswer={answerLine}
              onReword={rewordLine}
            />
          ) : null}

          {screen === "ready" && order ? (
            <ScreenReview
              order={order}
              memoryCount={order.memory_count}
              cvReady={order.cv_readiness === "ready"}
              runCost={runCost}
              newJobs={order.new_jobs_count}
              balance={balance}
              onOpenCoins={close}
              onAnswer={answerLine}
              onReword={rewordLine}
              onStartOver={() => {
                setFreshStart(true)
                setScreen("start")
              }}
            />
          ) : null}

          {screen === "running" ? (
            <ScreenRunning
              lifecycle={refreshVm.state === "computing" ? "computing" : "queued"}
              label={refreshVm.progressLabel}
              done={refreshVm.progressDone}
              total={refreshVm.progressTotal}
              revealed={refreshVm.revealed}
            />
          ) : null}

          {screen === "done" ? (
            <ScreenDone
              matches={refreshVm.matchesWritten ?? 0}
              scanned={refreshVm.progressTotal ?? 0}
              onSeeMatches={() => { close(); onSeeMatches() }}
              onRunAgain={() => { refreshVm.reset(); setScreen("ready"); void invalidateOrder(client) }}
            />
          ) : null}

          {error ? (
            <p role="alert" className="pf-contract" style={{ color: "var(--tm-danger)" }}>{error}</p>
          ) : null}
            </>
          )}
        </div>

        {(seated || screen === "running" || screen === "done") ? (
        <GateFooter
          screen={screen}
          thinking={thinking}
          rounds={rounds.length}
          round={round}
          unanswered={unanswered}
          proposalDrops={proposalDrops}
          acceptedNow={acceptedNow}
          ranBefore={Boolean(order?.last_run_at) && !freshStart}
          free={free}
          runCost={runCost}
          short={short}
          busy={apply.isPending || starting}
          onBack={() => {
            if (screen === "proposals") setScreen("start")
            else if (screen === "confirm") {
              if (round > 0) setRound(round - 1)
              else setScreen(proposals.length ? "proposals" : (order?.last_run_at && !freshStart ? "ready" : "start"))
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
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
