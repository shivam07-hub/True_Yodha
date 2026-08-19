"use client"

/**
 * The pre-flight, on one surface.
 *
 * Six screens (start · proposals · confirm · ready · running · done) folded
 * into one scroll. Every settled line renders as a `<Plate>` — rail on the
 * left edge when the user authored it, no rail when Myro guessed. Every
 * unanswered guess renders as a `<HeardRow>` with the semantic yes/no pair
 * (vermilion accept, crimson decline, both filled). Contradictions land as
 * `<ConflictPlate>` inside the same list.
 *
 * The `Say` composer is the top of the canvas, not a screen. Empty order →
 * the composer is the only child, ask included. A standing order → the
 * composer collapses into "add another line", opening a `SayPad` on click
 * that flows through the same `/preflight/proposals` fetch as the opening
 * turn. One code path, one place lines are born.
 *
 * `run` is the shell's job — the canvas only says when it is OK to press
 * (no visible conflicts) and how much the button reads. The shell owns the
 * ticket, the charge and the wait screen.
 */

import { useMemo, useState } from "react"
import Link from "next/link"

import { visibleConflicts } from "@/lib/preflight/conflicts"
import { formatCount } from "@/lib/format"
import {
  KIND_EYEBROW,
  type LineStatus,
  type Order,
  type OrderProposal,
} from "@/lib/preflight/types"
import { contractLine } from "@/lib/preflight/prose"

import { AddMoreLine, OpeningPad } from "./canvas-pads"
import { ConflictPlate } from "./conflict-plate"
import { HeardRow } from "./heard-row"
import { Plate } from "./plate"

type Verdict = "kept" | "dropped" | null

export function ScreenCanvas({
  order,
  proposals,
  proposalAnswers,
  pending,
  balance,
  starting,
  error,
  onSaySomething,
  onAnswerLine,
  onRewordLine,
  onAnswerProposal,
  onOpenCoins,
  onRun,
}: {
  order: Order
  /** Proposals returned from the last `/preflight/proposals` fetch. Shown
   *  inline as heard rows the user can accept or decline; unanswered ones are
   *  dropped when Run is pressed. */
  proposals: OrderProposal[]
  proposalAnswers: Record<string, Verdict>
  /** True while the LLM is drafting a reply after the pad submits. */
  pending: boolean
  balance: number
  starting: boolean
  error: string | null
  onSaySomething: (text: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
  onAnswerProposal: (id: string, verdict: Verdict) => void
  onOpenCoins: () => void
  onRun: () => void
}) {
  const kept = useMemo(() => order.lines.filter((l) => l.status === "kept"), [order.lines])
  const unanswered = useMemo(() => order.lines.filter((l) => l.status === "unanswered"), [order.lines])
  const conflicts = visibleConflicts(order)
  const runCost = order.run_cost ?? 0
  const free = runCost === 0
  const short = !free && balance < runCost
  const cvReady = (order.cv_readiness ?? "") === "ready"
  const hasWork = kept.length > 0 || (order.said ?? "").trim().length > 0

  return (
    <div className="pf-canvas">
      {hasWork ? (
        <CanvasHeading order={order} cvReady={cvReady} />
      ) : (
        <OpeningPad
          order={order}
          balance={balance}
          runCost={runCost}
          onSubmit={onSaySomething}
          pending={pending}
        />
      )}

      {hasWork ? (
        <div className="pf-plate-list">
          {kept.map((line) => (
            <Plate
              key={line.id}
              line={line}
              eyebrow={KIND_EYEBROW[line.kind]}
              onReword={(text) => onRewordLine(line.id, text)}
              onDrop={() => onAnswerLine(line.id, "dropped")}
            />
          ))}
          {conflicts.map((conflict) => (
            <ConflictPlate
              key={`${conflict.slot}:${conflict.line_ids.join(",")}`}
              conflict={conflict}
              lines={order.lines}
              onDrop={(id) => onAnswerLine(id, "dropped")}
            />
          ))}
          <AddMoreLine onSubmit={onSaySomething} pending={pending} />
        </div>
      ) : null}

      {(unanswered.length > 0 || proposals.length > 0) && hasWork ? (
        <HeardFold
          proposals={proposals}
          proposalAnswers={proposalAnswers}
          unanswered={unanswered}
          onAnswerLine={onAnswerLine}
          onAnswerProposal={onAnswerProposal}
        />
      ) : null}

      {error ? (
        <p role="alert" className="pf-canvas-error">{error}</p>
      ) : null}

      {hasWork ? (
        <RunBar
          contract={contractLine(order)}
          runCost={runCost}
          balance={balance}
          free={free}
          short={short}
          blocked={conflicts.length > 0}
          busy={starting}
          newJobs={order.new_jobs_count}
          onOpenCoins={onOpenCoins}
          onRun={onRun}
        />
      ) : null}
    </div>
  )
}

function CanvasHeading({ order, cvReady }: { order: Order; cvReady: boolean }) {
  const said = (order.said ?? "").trim()
  return (
    <div className="pf-canvas-heading">
      <h2>{said || "Sign off — Myro runs on the lines below."}</h2>
      <p className="pf-canvas-sub">
        <Link href="/cv" className="tm-control-focus">
          {cvReady ? "CV baseline · ready" : "no CV yet · add one"} →
        </Link>
      </p>
    </div>
  )
}

function HeardFold({
  proposals, proposalAnswers, unanswered, onAnswerLine, onAnswerProposal,
}: {
  proposals: OrderProposal[]
  proposalAnswers: Record<string, Verdict>
  unanswered: Order["lines"]
  onAnswerLine: (id: string, status: LineStatus) => void
  onAnswerProposal: (id: string, verdict: Verdict) => void
}) {
  const [open, setOpen] = useState(proposals.length > 0)
  const total = proposals.length + unanswered.length
  return (
    <div className="pf-heard-fold">
      <button
        type="button"
        className="pf-heard-toggle tm-control-focus"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{total} {total === 1 ? "thing" : "things"} Myro heard</span>
        <span className="pf-heard-arrow" aria-hidden>{open ? "↓" : "→"}</span>
      </button>
      {open ? (
        <div className="pf-heard-list">
          {proposals.map((p) => (
            <HeardRow
              key={p.id}
              text={p.value}
              sourceNote={p.why}
              answered={proposalAnswers[p.id] ?? null}
              onAnswer={(verdict) => onAnswerProposal(p.id, verdict)}
            />
          ))}
          {unanswered.map((line) => (
            <HeardRow
              key={line.id}
              text={line.text}
              source={line.source}
              sourceNote={line.source_note}
              answered={null}
              disableYes={line.unusable}
              onAnswer={(verdict) => onAnswerLine(line.id, verdict === "kept" ? "kept" : "dropped")}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RunBar({
  contract, runCost, balance, free, short, blocked, busy, newJobs, onOpenCoins, onRun,
}: {
  contract: string; runCost: number; balance: number; free: boolean; short: boolean
  blocked: boolean; busy: boolean; newJobs: number
  onOpenCoins: () => void; onRun: () => void
}) {
  return (
    <div className="pf-canvas-runbar">
      <div className="pf-canvas-contract">{contract}</div>
      {short ? (
        <div className="pf-canvas-cost" data-tone="short">
          <strong>Need {runCost} · you have {balance}</strong>{" "}
          <Link href="/tokens" onClick={onOpenCoins} className="tm-control-focus">
            See how Myro Coins work →
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        className="pf-canvas-run tm-control-focus"
        onClick={onRun}
        disabled={busy || blocked || short}
        aria-disabled={busy || blocked || short}
      >
        <span>Run</span>
        <span className="pf-canvas-run-sep" aria-hidden>·</span>
        <span className="pf-canvas-run-cost">
          {free ? (newJobs > 0 ? `Free · ${formatCount(newJobs)} new roles` : "Free") : `${runCost} coins`}
        </span>
      </button>
    </div>
  )
}
