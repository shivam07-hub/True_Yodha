"use client"

/**
 * The pre-flight, on one surface, as six slots.
 *
 * Six screens (start · proposals · confirm · ready · running · done) folded
 * into one scroll — and then, correcting the version that shipped, folded
 * into the SIX SLOTS the backend actually runs on rather than one flat column
 * of every kept line.
 *
 * That flat column was the whole defect. MYRO_SEARCH_REBUILD.md's one idea is
 * that the Order exists to fill a six-slot spec; a single undifferentiated
 * list of twenty statements hides the only structure there is, and leaves the
 * reader unable to answer the question they opened the modal with — *what
 * does Myro still need from me?* Six headers, three of them holding nothing
 * but an invitation, answers it without a word of explanation.
 *
 * Each `<SlotGroup>` owns its plates, its conflicts (a conflict is a
 * statement about that slot's arity, so it belongs beside it) and its own
 * add. `run` stays the shell's job — the canvas only says when it is safe to
 * press and what the button reads.
 */

import { useMemo, useState } from "react"
import Link from "next/link"

import { visibleConflicts } from "@/lib/preflight/conflicts"
import { formatCount } from "@/lib/format"
import { SLOT_COPY } from "@/lib/preflight/slots"
import {
  type LineKind,
  type LineStatus,
  type Order,
  type OrderConflict,
  type OrderLine,
  type OrderProposal,
} from "@/lib/preflight/types"
import { blockedLine, contractLine, missingRoleLine } from "@/lib/preflight/prose"

import { OpeningPad } from "./canvas-pads"
import { HeardRow } from "./heard-row"
import { SlotGroup } from "./slot-group"

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
  onAddLine,
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
  onAddLine: (kind: LineKind, text: string) => void
  onOpenCoins: () => void
  onRun: () => void
}) {
  const conflicts = visibleConflicts(order)

  /**
   * The groups, as the RESOLVER partitioned them.
   *
   * The client used to file `order.lines` into slots itself, mirroring
   * `SLOT_ARITY` and `_SLOT_KINDS`. Two resolvers, and they disagreed in the
   * only direction that matters: the server deduped before filing, this did
   * not, so one statement rendered twice — once as a settled plate, once inside
   * the conflict holding its twin — and the header counted both
   * (`Won't take · 15 of 6`).
   *
   * Now the server names the line ids per slot and the only thing done to them
   * here is the OPTIMISTIC filter: a line the user just dropped disappears on
   * the tap rather than on the response. That is respecting a local edit, not
   * re-deciding what the resolver decided.
   */
  const groups = useMemo(() => {
    const byId = new Map(order.lines.map((l) => [l.id, l]))
    const clashes = new Map<string, OrderConflict[]>()
    for (const conflict of conflicts) {
      const bucket = clashes.get(conflict.slot)
      if (bucket) bucket.push(conflict)
      else clashes.set(conflict.slot, [conflict])
    }
    const live = (ids: string[]): OrderLine[] =>
      ids.flatMap((id) => {
        const line = byId.get(id)
        return line && line.status === "kept" ? [line] : []
      })

    return (order.slots ?? []).map((slot) => {
      const lines = live(slot.line_ids)
      const held = live(slot.contested_ids)
      return {
        slot,
        copy: SLOT_COPY[slot.key],
        lines,
        conflicts: clashes.get(slot.key) ?? [],
        filled: lines.length + held.length,
      }
    })
  }, [order.lines, order.slots, conflicts])

  const kept = useMemo(() => order.lines.filter((l) => l.status === "kept"), [order.lines])
  const unanswered = useMemo(() => order.lines.filter((l) => l.status === "unanswered"), [order.lines])
  const runCost = order.run_cost ?? 0
  const free = runCost === 0
  const short = !free && balance < runCost
  const cvReady = (order.cv_readiness ?? "") === "ready"
  const hasWork =
    kept.length > 0 || conflicts.length > 0 || (order.said ?? "").trim().length > 0

  /**
   * The one slot whose absence is not a preference.
   *
   * `/preflight/run` refuses a roleless order — a search with no role runs
   * against whatever titles the profile still held, which is not the order the
   * user signed off. The bar states that here so nobody meets the 400.
   */
  const hasRole = useMemo(
    () => order.lines.some((l) => l.status === "kept" && l.kind === "role"),
    [order.lines],
  )

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
        <div className="pf-slots">
          {groups.map((group) => (
            <SlotGroup
              key={group.slot.key}
              copy={group.copy}
              arity={group.slot.arity}
              filled={group.filled}
              lines={group.lines}
              conflicts={group.conflicts}
              allLines={order.lines}
              busy={pending}
              onAdd={onAddLine}
              onAnswerLine={onAnswerLine}
              onRewordLine={onRewordLine}
            />
          ))}
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
          contract={
            conflicts.length > 0
              ? blockedLine(conflicts.length)
              : hasRole
                ? contractLine(order)
                : missingRoleLine()
          }
          runCost={runCost}
          balance={balance}
          free={free}
          short={short}
          blocked={conflicts.length > 0 || !hasRole}
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
