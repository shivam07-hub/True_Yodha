"use client"

/**
 * Screen 4 — review the order.
 *
 * The brief here is the surface's whole promise, which is why its grammar is a
 * spec (`lib/preflight/prose`) rather than a template literal. And the contract
 * line under it — *Myro runs on the N lines above and nothing else* — has to be
 * literally true, so it counts unanswered guesses as dropped, because that is
 * what the server does to them.
 *
 * Drift since the last search sits above the cost, answerable in place. Run
 * stays one tap whether those rows are answered or not.
 */

import Link from "next/link"

import { briefFrom, contractLine } from "@/lib/preflight/prose"
import { dropIdsForPick, visibleConflicts } from "@/lib/preflight/conflicts"
import { formatCount } from "@/lib/format"
import { KIND_EYEBROW, type LineStatus, type OrderState } from "@/lib/preflight/types"
import { ConflictCard } from "./conflict-card"
import { GuessRow } from "./guess-row"

import "./guess-row.css"

export function ScreenReview({
  order,
  memoryCount,
  cvReady,
  runCost,
  newJobs,
  balance,
  onOpenCoins,
  onAnswer,
  onReword,
  onStartOver,
}: {
  order: OrderState
  memoryCount: number
  cvReady: boolean
  runCost: number
  newJobs: number
  balance: number
  onOpenCoins: () => void
  onAnswer: (lineId: string, status: LineStatus) => void
  onReword: (lineId: string, text: string) => void
  onStartOver: () => void
}) {
  const free = runCost === 0
  const short = !free && balance < runCost
  const drift = order.last_run_at
    ? order.lines.filter((line) => line.status === "unanswered")
    : []
  const disputes = visibleConflicts(order)
  const folded = order.duplicates_collapsed ?? 0

  return (
    <>
      <div className="pf-signed">Signed off · this is what Myro runs</div>
      <p className="pf-brief">{briefFrom(order)}</p>
      <p className="pf-contract">{contractLine(order)}</p>
      {folded > 0 ? (
        <p className="pf-folded">{folded} duplicate {folded === 1 ? "line" : "lines"} folded</p>
      ) : null}

      <div className="pf-chips">
        {/* The CV WORKSPACE, not `profile.cv_url`. That column holds a Supabase
            storage URL: opening it in a new tab leaves the session behind and
            greets the user with a login screen. The actionable place — read it,
            replace it, upload one — is the route. */}
        <Link className="pf-chip" data-tone={cvReady ? undefined : "warn"} href="/cv">
          {cvReady ? "CV baseline · ready" : "No CV yet · add one"}
          <span aria-hidden>→</span>
        </Link>
        {memoryCount > 0 ? <span className="pf-chip">{memoryCount} notes · read</span> : null}
      </div>

      {disputes.length > 0 ? (
        <div className="pf-disputes">
          {disputes.map((conflict) => (
            <ConflictCard
              key={`${conflict.slot}:${conflict.line_ids.join(",")}`}
              conflict={conflict}
              lines={order.lines}
              onPick={(chosen) => {
                for (const id of dropIdsForPick(conflict, chosen)) onAnswer(id, "dropped")
              }}
            />
          ))}
        </div>
      ) : null}

      {drift.length > 0 ? (
        <div className="pf-drift">
          <div className="pf-order-eyebrow">Since your last search</div>
          {drift.map((line) => (
            <GuessRow
              key={line.id}
              line={line}
              eyebrow={KIND_EYEBROW[line.kind]}
              onAnswer={(status) => onAnswer(line.id, status)}
              onReword={(text) => onReword(line.id, text)}
            />
          ))}
        </div>
      ) : null}

      <div className="pf-cost" data-tone={short ? "short" : undefined}>
        <Coin />
        {short ? (
          <div>
            <strong>Need {runCost} · you have {balance}</strong>{" "}
            <Link href="/tokens" onClick={onOpenCoins} className="tm-control-focus">
              See how Myro Coins work →
            </Link>
          </div>
        ) : free ? (
          <div>
            <strong>Free</strong>
            {" · "}
            {newJobs > 0
              ? `${formatCount(newJobs)} new roles since your last search`
              : "this search is on us"}
          </div>
        ) : (
          <div>
            <strong>{runCost} Myro Coins</strong> · per search
          </div>
        )}
      </div>

      {order.last_run_at ? (
        <button type="button" className="pf-start-over tm-control-focus" onClick={onStartOver}>
          Start over
        </button>
      ) : null}
    </>
  )
}

function Coin() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" stroke="var(--tm-interactive)" strokeWidth="1.4" />
      <path
        d="M10 5.5v9M7.5 8h3.2a1.6 1.6 0 0 1 0 3.2H7.8"
        stroke="var(--tm-interactive)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
