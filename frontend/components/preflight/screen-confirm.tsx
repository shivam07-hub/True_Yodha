"use client"

/**
 * Screen 3 — confirm, in three rounds.
 *
 * This screen replaces two failed shapes at once. Eight guesses in one list is a
 * wall nobody reads to the bottom of; eight separate screens is an
 * interrogation. Three named rounds with a tally that is itself clickable keeps
 * the whole set legible — you can see there are four won't-takes and two
 * leanings without scrolling through them, and jump between rounds at will.
 *
 * The order block sits above everything, always. Without it the rounds are
 * questions with no subject, and the user loses what they came to search for
 * while judging Myro's reading of it.
 */

import { GuessRow } from "./guess-row"
import { ROUND_LABEL, ROUND_LEAD, type OrderLine, type OrderRound, type RoundKey } from "@/lib/preflight/types"

import "./guess-row.css"

export function ScreenConfirm({
  said,
  marketLines,
  rounds,
  lineById,
  activeRound,
  onPickRound,
  onAnswer,
  onReword,
  busy,
}: {
  said: string
  /** Lines the market sheet added. Shown here so the pre-flight never hides a
   *  change the user made somewhere else — one order, two surfaces. */
  marketLines: OrderLine[]
  rounds: OrderRound[]
  lineById: Map<string, OrderLine>
  activeRound: number
  onPickRound: (index: number) => void
  onAnswer: (lineId: string, status: "kept" | "dropped" | "unanswered") => void
  onReword: (lineId: string, text: string) => void
  busy?: boolean
}) {
  const round = rounds[activeRound]
  if (!round) return null

  const linesOf = (r: OrderRound) => r.line_ids.map((id) => lineById.get(id)).filter(Boolean) as OrderLine[]
  const answeredIn = (r: OrderRound) => linesOf(r).filter((l) => l.status !== "unanswered").length

  return (
    <>
      <div className="pf-order-block">
        <div className="pf-order-eyebrow">The order · you set this</div>
        <div className="pf-order-said">{said || "Nothing said yet."}</div>
        {marketLines.length > 0 ? (
          <div className="pf-order-added">
            <div className="pf-order-eyebrow">Added from the market sheet</div>
            {marketLines.map((line) => (
              <div key={line.id} className="pf-order-added-line">
                <span data-sign aria-hidden>+</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pf-tally" role="tablist" aria-label="Confirm rounds">
        {rounds.map((r, i) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            className="pf-tally-btn tm-control-focus"
            aria-current={i === activeRound ? "true" : undefined}
            aria-selected={i === activeRound}
            aria-label={`${ROUND_LABEL[r.key as RoundKey]} — ${answeredIn(r)} of ${r.line_ids.length} answered`}
            onClick={() => onPickRound(i)}
          >
            <span className="pf-tally-label">{ROUND_LABEL[r.key as RoundKey]}</span>
            <span className="pf-tally-count">
              {answeredIn(r)} / {r.line_ids.length}
            </span>
          </button>
        ))}
      </div>

      <div className="pf-round-head">
        <div className="pf-round-eyebrow">
          Round {activeRound + 1} of {rounds.length} · Myro guessed these
        </div>
        <p className="pf-round-lead">{ROUND_LEAD[round.key as RoundKey]}</p>
      </div>

      <div>
        {linesOf(round).map((line) => (
          <GuessRow
            key={line.id}
            line={line}
            busy={busy}
            onAnswer={(status) => onAnswer(line.id, status)}
            onReword={(text) => onReword(line.id, text)}
          />
        ))}
      </div>
    </>
  )
}
