"use client"

import * as React from "react"
import Link from "next/link"
import "./loop-bar.css"

/**
 * The Loop Bar (journey treatment B) — a thin strip pinned under the nav that
 * makes the whole loop legible at a glance: 01 Capture → 02 Collect → 03 Tailor →
 * 04 Apply, plus the single most valuable next action ("Next: Tailor Barclays →").
 * It is the always-on orientation half of the Delta-4 promise; <CaptureConfirm>
 * is the at-the-card half.
 *
 * Presentational — the owning surface passes the counts (market from the feed +
 * bootstrap; Collections from its model). One step is `active` (where the user
 * is now). Steps with an href are quiet links; the rest are static markers.
 */
export interface LoopStepModel {
  /** "01 Capture" number is derived from index; this is the word. */
  label: string
  /** Right-hand value, e.g. "12 this wk", "5", "2/5", "3 sent". */
  value?: string
  href?: string
  /** Optional live signal pinned to this step, e.g. "12 new" on Capture. Its own
   *  hit target (button when it triggers an action, link when it routes) so it
   *  reads as an alert without hijacking the step's own link. */
  alert?: { label: string; onClick?: () => void; href?: string }
}

export interface LoopBarModel {
  steps: [LoopStepModel, LoopStepModel, LoopStepModel, LoopStepModel]
  /** 0–3 — the step the user is currently on. */
  activeIndex: number
  /** The one next action; omit to hide the trailing CTA. */
  next?: { label: string; href: string }
}

const NUM = ["01", "02", "03", "04"]

export function LoopBar({ steps, activeIndex, next }: LoopBarModel) {
  return (
    <nav className="tm-loopbar" aria-label="Your job-search loop">
      <ol className="tm-loopbar-steps">
        {steps.map((s, i) => {
          const active = i === activeIndex
          const body = (
            <>
              <span className="tm-loopbar-num" aria-hidden>{NUM[i]}</span>
              <span className="tm-loopbar-label">{s.label}</span>
              {s.value ? <span className="tm-loopbar-val">{s.value}</span> : null}
            </>
          )
          return (
            <li key={s.label} className={`tm-loopbar-step${active ? " is-active" : ""}`}>
              {s.href ? (
                <Link href={s.href} className="tm-loopbar-hit" aria-current={active ? "step" : undefined}>
                  {body}
                </Link>
              ) : (
                <span className="tm-loopbar-hit" aria-current={active ? "step" : undefined}>{body}</span>
              )}
              {s.alert ? (
                s.alert.href ? (
                  <Link href={s.alert.href} className="tm-loopbar-alert">{s.alert.label}</Link>
                ) : (
                  <button type="button" className="tm-loopbar-alert" onClick={s.alert.onClick}>
                    {s.alert.label}
                  </button>
                )
              ) : null}
              {i < steps.length - 1 ? <span className="tm-loopbar-sep" aria-hidden>›</span> : null}
            </li>
          )
        })}
      </ol>
      {next ? (
        <Link href={next.href} className="tm-loopbar-next">
          <span className="tm-loopbar-next-lead">Next:</span> {next.label} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </nav>
  )
}
