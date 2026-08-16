"use client"

/**
 * Screen 4 — review the order.
 *
 * The brief here is the surface's whole promise, which is why its grammar is a
 * spec (`lib/preflight/prose`) rather than a template literal. And the contract
 * line under it — *Myro runs on the N lines above and nothing else* — has to be
 * literally true, so it counts unanswered guesses as dropped, because that is
 * what the server does to them.
 */

import Link from "next/link"

import { briefFrom, contractLine } from "@/lib/preflight/prose"
import { formatCount } from "@/lib/format"
import type { OrderState } from "@/lib/preflight/types"

export function ScreenReview({
  order,
  memoryCount,
  cvReady,
  cvHref,
  runCost,
  newJobs,
  balance,
  onOpenCoins,
}: {
  order: OrderState
  memoryCount: number
  cvReady: boolean
  cvHref: string
  runCost: number
  newJobs: number
  balance: number
  onOpenCoins: () => void
}) {
  const free = runCost === 0
  const short = !free && balance < runCost

  return (
    <>
      <div className="pf-signed">Signed off · this is what Myro runs</div>
      <p className="pf-brief">{briefFrom(order)}</p>
      <p className="pf-contract">{contractLine(order)}</p>

      <div className="pf-chips">
        <a
          className="pf-chip"
          data-tone={cvReady ? undefined : "warn"}
          href={cvHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {cvReady ? "CV baseline · ready" : "No CV yet · add one"}
          <span aria-hidden>↗</span>
        </a>
        {memoryCount > 0 ? <span className="pf-chip">{memoryCount} notes · read</span> : null}
      </div>

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
