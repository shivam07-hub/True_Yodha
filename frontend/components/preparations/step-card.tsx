"use client"

/**
 * One step of the room's ladder (Unified Prep v2, artboard 2b).
 *
 * The card is a disclosure, not an action: the panel inside owns the real work
 * (and, for the brief, the coin charge). A head that both expanded and spent
 * coins would be two buttons wearing one label.
 *
 * Only the step the room is ON carries accent — border, wash and a filled CTA.
 * Every other card is the same quiet surface, so "where am I" is answered by
 * looking, not by reading four states.
 */

import type { ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { STEP_LABELS } from "./prep-model"

export const CLEAR = 2

/** The mono line on the right of the head. Says where this step stands.
 *
 * The design writes step 4 as "opens at step 3". Nothing gates it: BriefCard
 * sells the brief whenever it is opened, and a state line that claims a gate
 * the code does not enforce is a lie the user finds by paying. It reads "best
 * after step 3" instead — true, and still points at the right order. Whether
 * to make it a real gate is a revenue decision, not a copy one.
 */
export function stepState(
  index: number,
  value: number,
  currentStep: number,
  /** The step's own count, when it has one. 2b states numbers, not adjectives. */
  count?: { answered: number; total: number },
): string {
  if (count && count.total > 0) {
    const tally = `${count.answered}/${count.total}`
    if (value === CLEAR) return `${tally} · clear`
    if (index + 1 === currentStep) return `${tally} · step you're on`
    return tally
  }
  if (value === CLEAR) return "clear"
  if (index + 1 === currentStep) return "step you're on"
  if (index === 3 && currentStep < 3) return "best after step 3"
  return value > 0 ? "started" : "not started"
}

const CTA_LABEL = ["Review", "Start", "Rehearse", "Get it"] as const

export function StepCard({
  index,
  value,
  currentStep,
  sub,
  count,
  cta,
  open,
  onToggle,
  children,
}: {
  index: number
  value: number
  currentStep: number
  sub: string
  /** This step's own count, when the ladder answered one. */
  count?: { answered: number; total: number }
  /** Overrides the step's default verb — step 2 names the level it would start. */
  cta?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const isCurrent = index + 1 === currentStep && value !== CLEAR
  const panelId = `prp-step-panel-${index}`
  const Chevron = open ? ChevronUp : ChevronDown
  const classes = ["prp-step", isCurrent ? "is-current" : "", open ? "is-open" : ""]

  return (
    <section className={classes.filter(Boolean).join(" ")}>
      <button
        type="button"
        className="prp-step-head tm-control-focus"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="prp-step-n" data-state={value} aria-hidden>{index + 1}</span>
        <span className="prp-step-copy">
          <span className="prp-step-title">{STEP_LABELS[index]}</span>
          <span className="prp-step-sub">{sub}</span>
        </span>
        <span className="prp-step-state" data-state={value}>
          {stepState(index, value, currentStep, count)}
        </span>
        <span className="prp-step-cta">
          {value === CLEAR ? "Review" : cta ?? CTA_LABEL[index]} <Chevron size={14} aria-hidden />
        </span>
      </button>
      {open ? (
        <div className="prp-step-panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
