"use client"

/**
 * The composer, shown on the first step while the order is still empty.
 *
 * It used to be a screen of its own — `OpeningPad`, on a canvas that rendered
 * either the pad OR the slots, never both. So a first-time user said a
 * sentence and waited for a model to decide what they meant, with no way to
 * simply name a role. Here it sits ABOVE the work slot's own picker, so the
 * two doors are on one screen: say it in a sentence, or choose a title.
 *
 * The sentence path is the one that needs a model. `/preflight/proposals`
 * decides which slot each claim in it belongs to; the picker below needs no
 * inference at all, because choosing a title says which slot it fills.
 */

import { useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SayPad } from "@/components/myro/say-pad"
import { cvReadCopy, rolesWaitingCopy } from "@/lib/preflight/say-it"
import type { Order, OrderPrice } from "@/lib/preflight/types"

export function StepOpen({
  order,
  price,
  pending,
  onSubmit,
}: {
  order: Order
  /** null until `GET /preflight/price` lands. The pad is fully usable without
   *  it — the hero simply holds off rather than guessing a number. */
  price: OrderPrice | null
  pending: boolean
  onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState("")
  const idle = value.trim().length === 0
  const waiting = price ? rolesWaitingCopy(price.new_jobs_count) : null
  /* The one screen where "Myro has already read you" is news. On every later
     step the chips' own rails say it per line; here there are no chips yet. */
  const know = cvReadCopy((order.cv_readiness ?? "") === "ready", order.memory_count)

  return (
    <div className="pf-open">
      {waiting ? (
        <div className="pf-open-hero">
          <span>{waiting.n}</span>
          <p>{waiting.lede}</p>
        </div>
      ) : null}
      {know ? <p className="pf-open-know">{know}</p> : null}
      <div className="pf-compose">
        <SayPad
          value={value}
          maxLength={600}
          autoFocus
          onChange={setValue}
          onSubmit={() => { if (!idle && !pending) onSubmit(value.trim()) }}
          placeholder="e.g. sales strategy in Gurgaon, B2B, nothing below 18L"
          aria-label="Name the work"
        />
        <button
          type="button"
          className="pf-send tm-control-focus"
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
