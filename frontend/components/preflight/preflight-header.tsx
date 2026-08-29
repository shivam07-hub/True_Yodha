"use client"

/**
 * Persistent header — where you are, how to go back, how to leave.
 *
 * The old header carried the surface's name and a close button, and nothing
 * else: the canvas had one mode, so a progress bar would have been counting
 * phases that did not exist. The journey has five steps, so it does.
 *
 * The ribbon is UNLABELLED. Six words across 560px is legible and across
 * 375px is not, and a bar that reads at one width and shreds at the other is
 * worse than a bar that reads at both — the step's own title is directly
 * underneath it, three lines down, saying where you are in full.
 *
 * It is also navigation, not decoration. `JourneyProgress` in onboarding made
 * the same move for the same reason: a numbered, ticked sequence that cannot
 * be clicked still looks like one that can, and the only route back was a
 * button that destroyed the answer behind it.
 */

import { Icon } from "@/components/cv/builder/icons"
import { STEPS, type StepKey, type StepNeed } from "@/lib/preflight/journey"

export function PreflightHeader({
  current,
  need,
  onBack = null,
  onJump,
  onClose,
  closable = true,
}: {
  /** Absent on the wait screens: a run owns the whole modal, and a ribbon over
   *  it would offer to navigate away from a search already charged for. */
  current?: StepKey
  need?: Record<StepKey, StepNeed>
  onBack?: (() => void) | null
  onJump?: (step: StepKey) => void
  onClose: () => void
  /** A run in flight has been charged for. Closing mid-stream would hide it,
   *  so the exit leaves rather than pretending the modal is dismissible. */
  closable?: boolean
}) {
  const showRibbon = !!current && !!need && !!onJump
  const at = STEPS.findIndex((s) => s.key === current)

  return (
    <div className="pf-head">
      <div className="pf-head-row">
        {onBack ? (
          <button
            type="button"
            className="pf-back tm-control-focus"
            onClick={onBack}
            aria-label="Back a step"
          >
            <Icon name="chevron-left" size={18} />
          </button>
        ) : (
          <span className="pf-back-spacer" aria-hidden />
        )}

        <div className="pf-eyebrow">Myro Search</div>

        {closable ? (
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : (
          <span className="pf-back-spacer" aria-hidden />
        )}
      </div>

      {showRibbon ? (
        <nav className="pf-ribbon" aria-label="Search steps">
          {STEPS.map((step, i) => {
            const state = i < at ? "done" : i === at ? "current" : "ahead"
            const n = need![step.key]
            return (
              <button
                key={step.key}
                type="button"
                className="pf-seg tm-control-focus"
                data-state={state}
                /* The dot is the answer to "what does Myro still need from
                   me?" at a glance — the question the six slot headers were
                   introduced to answer and could only answer once you had
                   scrolled past all six. */
                data-asks={n.blocking || n.guesses > 0 ? "true" : undefined}
                aria-current={i === at ? "step" : undefined}
                aria-label={
                  n.blocking
                    ? `${step.title} — needs an answer`
                    : n.guesses > 0
                      ? `${step.title} — ${n.guesses} to answer`
                      : step.title
                }
                onClick={() => onJump!(step.key)}
              />
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
