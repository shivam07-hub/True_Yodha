"use client"

/**
 * The opening pad — the composer shown when nothing has been said yet.
 *
 * It is the one place a sentence becomes lines: it runs through
 * `/preflight/proposals`, so Myro decides which slot each claim belongs to.
 * Once the canvas has content the slots carry their own adds, which need no
 * inference at all — the user picked the slot by picking which "+" to press.
 */

import { useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SayPad } from "@/components/myro/say-pad"
import { cvReadCopy, rolesWaitingCopy, searchCostCopy } from "@/lib/preflight/say-it"
import type { Order } from "@/lib/preflight/types"

export function OpeningPad({
  order, balance, runCost, onSubmit, pending,
}: {
  order: Order
  balance: number
  runCost: number
  pending: boolean
  onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState("")
  const idle = value.trim().length === 0
  const waiting = rolesWaitingCopy(order.new_jobs_count)
  const know = cvReadCopy((order.cv_readiness ?? "") === "ready", order.memory_count)
  const price = searchCostCopy(runCost, balance)

  return (
    <div className="pf-canvas-open">
      {waiting ? (
        <div className="pf-canvas-hero">
          <span>{waiting.n}</span>
          <p>{waiting.lede}</p>
        </div>
      ) : null}
      {know ? <p className="pf-canvas-know">{know}</p> : null}
      <div className="pf-canvas-price" data-short={price.short ? "true" : undefined}>{price.text}</div>
      <h2 className="pf-canvas-ask">Name the work. I&apos;ll go find it.</h2>
      <p className="pf-canvas-help">
        Say it the way you&apos;d say it to a friend. Place, pay floor, the stuff you won&apos;t take.
      </p>
      <div className="pf-canvas-compose">
        <SayPad
          value={value}
          maxLength={600}
          autoFocus
          onChange={setValue}
          onSubmit={() => { if (!idle && !pending) onSubmit(value.trim()) }}
          placeholder="e.g. sales strategy in Gurgaon, B2B, nothing below 18L"
          aria-label="Name the work. I'll go find it."
        />
        <button
          type="button"
          className="pf-canvas-send tm-control-focus"
          data-idle={idle ? "true" : undefined}
          onClick={() => { if (!idle && !pending) onSubmit(value.trim()) }}
          aria-label="Send"
          disabled={idle || pending}
        >
          <Icon name="arrow-right" size={17} />
        </button>
      </div>
    </div>
  )
}

