"use client"

/**
 * Sign off — the whole order on one screen, and the door for "this is wrong".
 *
 * The last step, and the one a settled order opens straight onto: everything
 * Myro will run on, dense enough to read without scrolling, plus the say band
 * underneath it. The band sits below the groups rather than above them because
 * the groups answer "what will Myro search for" and the band answers "and if
 * that is wrong?" — a composer above the state it edits reads as a form; below
 * it, as a reply.
 *
 * The contract sentence and the Run button are NOT here. They live in the
 * pinned footer, which is the other half of the fix: the control that charges
 * the user was previously the last thing in a 1,100px scroll.
 */

import Link from "next/link"

import type { LineStatus, Order, OrderLine, OrderProposal } from "@/lib/preflight/types"
import type { SlotCopy } from "@/lib/preflight/slots"

import { Chip } from "./chip"
import { ChipGroup } from "./chip-group"
import { HeardRow } from "./heard-row"
import { SayBand } from "./say-band"
import type { StepGroup } from "./step-slot"

type Verdict = "kept" | "dropped" | null

export function StepSignoff({
  order,
  title,
  groups,
  facts,
  guesses,
  proposals,
  proposalAnswers,
  sayFirst,
  busy,
  onAdd,
  onAnswerLine,
  onRewordLine,
  onAnswerProposal,
  onSaySomething,
  onProposeTopic,
}: {
  order: Order
  /** The resolved work, in Myro's voice — "tech sales · IT Sales · TAM". */
  title: string
  groups: StepGroup[]
  facts: OrderLine[]
  /** Anything still unanswered that no earlier step claimed. */
  guesses: OrderLine[]
  proposals: OrderProposal[]
  proposalAnswers: Record<string, Verdict>
  /** The modal was opened straight onto the say band. One door, two landings. */
  sayFirst?: boolean
  busy?: boolean
  onAdd: (kind: SlotCopy["addKind"], text: string, roleFamily?: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
  onAnswerProposal: (id: string, verdict: Verdict) => void
  onSaySomething: (text: string) => void
  onProposeTopic: (topic: string) => void
}) {
  const said = (order.said ?? "").trim()
  const cvReady = (order.cv_readiness ?? "") === "ready"
  const allLines = order.lines
  const asks = guesses.length + proposals.length

  return (
    <div className="pf-step" data-step="signoff">
      <div className="pf-step-head">
        {/* The user's own sentence stays as a QUOTE, never as the heading. A
            user who typed "sales startefy" got their own typo set at 26px as
            the title of Myro's screen, which reads as Myro's mistake. */}
        <h2 className="pf-step-title" data-tight="true">{title || "Sign off"}</h2>
        {said && said !== title ? <p className="pf-signoff-said">“{said}”</p> : null}
        <p className="pf-step-lede">
          <Link href="/cv" className="tm-control-focus">
            {cvReady ? "CV baseline · ready" : "no CV yet · add one"} →
          </Link>
        </p>
      </div>

      <div className="pf-step-body" data-dense="true">
        {groups.map((group) => (
          <ChipGroup
            key={group.copy.label}
            copy={group.copy}
            arity={group.arity}
            filled={group.filled}
            lines={group.lines}
            conflicts={group.conflicts}
            allLines={allLines}
            busy={busy}
            onAdd={onAdd}
            onAnswerLine={onAnswerLine}
            onRewordLine={onRewordLine}
          />
        ))}

        {facts.length > 0 ? (
          <section className="pf-group" aria-label="Not a filter">
            <div className="pf-group-head">
              <h3 className="pf-group-label">Not a filter</h3>
            </div>
            <div className="pf-chips">
              {facts.map((line) => (
                <Chip
                  key={line.id}
                  line={line}
                  busy={busy}
                  onReword={(text) => onRewordLine(line.id, text)}
                  onDrop={() => onAnswerLine(line.id, "dropped")}
                />
              ))}
            </div>
          </section>
        ) : null}

        {asks > 0 ? (
          <section className="pf-asks" aria-label="Waiting on you">
            <div className="pf-group-head">
              <h3 className="pf-group-label">
                {asks === 1 ? "One to answer" : `${asks} to answer`}
              </h3>
            </div>
            {proposals.map((p) => (
              <HeardRow
                key={p.id}
                text={p.value}
                sourceNote={p.why}
                answered={proposalAnswers[p.id] ?? null}
                onAnswer={(verdict) => onAnswerProposal(p.id, verdict)}
              />
            ))}
            {guesses.map((line) => (
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
          </section>
        ) : null}

        <SayBand
          focused={sayFirst}
          pending={!!busy}
          onTopic={onProposeTopic}
          onSay={onSaySomething}
        />
      </div>
    </div>
  )
}
