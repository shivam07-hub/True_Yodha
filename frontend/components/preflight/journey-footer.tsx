"use client"

/**
 * The pinned footer — one sentence, one action, one way past it.
 *
 * The run bar used to be the LAST THING IN THE SCROLL: under six slot groups,
 * the facts, the say band and the heard fold, about 1,100px down on a real
 * order. Pinning it is most of the reason the rebuild is worth doing, and the
 * rule that keeps it honest is that the note says only what the screen above
 * does not already show.
 *
 * The controls themselves are `<StepActions>`, shared with onboarding. What
 * lives here is everything specific to a RUN: what it costs, whether the order
 * can be run at all, and what to say when it cannot.
 */

import Link from "next/link"

import { StepActions } from "@/components/journey/journey-chrome"
import { formatCount } from "@/lib/format"
import type { StepKey } from "@/lib/preflight/journey"
import { blockedLine, contractLine, missingRoleLine } from "@/lib/preflight/prose"
import { searchCostCopy } from "@/lib/preflight/say-it"
import type { Order, OrderConflict, OrderLogEntry, OrderPrice } from "@/lib/preflight/types"

export function JourneyFooter({
  order,
  conflicts,
  hasRole,
  isLast,
  stepKey,
  price,
  balance,
  starting,
  pending,
  error,
  undoable,
  skippable,
  onUndo,
  onOpenCoins,
  onRun,
  onNext,
}: {
  order: Order
  conflicts: OrderConflict[]
  hasRole: boolean
  isLast: boolean
  stepKey: StepKey
  /** null until `GET /preflight/price` lands. Run is the ONE control that
   *  waits for it: pressing it unpriced would be consenting to a charge
   *  nobody has been shown. */
  price: OrderPrice | null
  balance: number
  starting: boolean
  pending: boolean
  error: string | null
  /** The one change made this session that can be taken back, or null. */
  undoable: OrderLogEntry | null
  skippable: boolean
  onUndo: (entryId: string) => void
  onOpenCoins: () => void
  onRun: () => void
  onNext: () => void
}) {
  const runCost = price?.run_cost ?? 0
  const free = !!price && runCost === 0
  const short = !!price && !free && balance < runCost
  const newJobs = price?.new_jobs_count ?? 0
  const blocked = conflicts.length > 0 || !hasRole

  const note = error ? (
    <span role="alert" className="pf-note-error">{error}</span>
  ) : isLast ? (
    <>
      <span>
        {conflicts.length > 0
          ? blockedLine(conflicts.length)
          : hasRole
            ? contractLine(order)
            : missingRoleLine()}
      </span>
      {short ? (
        <span className="pf-note-short">
          {searchCostCopy(runCost, balance).text} ·{" "}
          <Link href="/tokens" onClick={onOpenCoins} className="tm-control-focus">
            See how Myro Coins work →
          </Link>
        </span>
      ) : null}
    </>
  ) : stepKey === "work" && !hasRole ? (
    <span>{missingRoleLine()}</span>
  ) : null

  return (
    <div className="pf-footer">
      <StepActions
        note={note}
        before={
          /* Dropping a chip is otherwise a one-way door — a dropped line
             renders in no group and no ask, so a mis-tap could only be fixed
             by retyping the statement. One step back, never a changelog. */
          undoable ? (
            <div className="pf-undo-row">
              <span className="pf-undo-sign" data-kind={undoable.kind} aria-hidden>
                {undoable.kind === "drop" ? "−" : "+"}
              </span>
              <span className="pf-undo-text">{undoable.text}</span>
              <button
                type="button"
                className="pf-undo tm-control-focus"
                onClick={() => onUndo(undoable.id)}
                disabled={pending}
              >
                Undo
              </button>
            </div>
          ) : null
        }
        primaryLabel={isLast ? "Run" : "Continue"}
        primaryMeta={
          isLast
            ? !price
              ? "pricing"
              : free
                ? newJobs > 0 ? `Free · ${formatCount(newJobs)} new roles` : "Free"
                : `${runCost} coins`
            : undefined
        }
        primaryDisabled={
          isLast ? starting || blocked || short || !price : stepKey === "work" && !hasRole
        }
        onPrimary={isLast ? onRun : onNext}
        secondaryLabel={skippable ? "Skip for now" : null}
        onSecondary={skippable ? onNext : undefined}
      />
    </div>
  )
}
