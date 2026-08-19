"use client"

/**
 * The two composers the canvas hosts: the opening pad shown when nothing
 * has been said, and the "+ add another line" chip once the canvas has
 * content. Both flow through the same `/preflight/proposals` fetch — the
 * canvas hands them one `onSubmit` and does not care which composer fired.
 */

import { useCallback, useEffect, useRef, useState } from "react"

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

export function AddMoreLine({
  onSubmit, pending,
}: {
  onSubmit: (text: string) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback((commit: boolean) => {
    if (commit) {
      const text = draft.trim()
      if (text) onSubmit(text)
    }
    setDraft("")
    setOpen(false)
  }, [draft, onSubmit])

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener("mousedown", outside)
    return () => document.removeEventListener("mousedown", outside)
  }, [open, close])

  if (!open) {
    return (
      <button type="button" className="pf-add-line tm-control-focus" onClick={() => setOpen(true)}>
        add another line
      </button>
    )
  }
  return (
    <div ref={ref} className="pf-add-line pf-add-line-open">
      <SayPad
        size="compact"
        value={draft}
        maxLength={240}
        autoFocus
        onChange={setDraft}
        onSubmit={() => close(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(false) } }}
        aria-label="Add a line"
        placeholder="something Myro should also know…"
      />
      <div className="pf-add-line-actions">
        <button
          type="button"
          className="pf-plate-action"
          data-role="cancel"
          onClick={() => close(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="pf-plate-action"
          data-role="save"
          onClick={() => close(true)}
          disabled={!draft.trim() || pending}
        >
          Add
        </button>
      </div>
    </div>
  )
}
