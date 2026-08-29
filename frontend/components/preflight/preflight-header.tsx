"use client"

/**
 * Persistent header — where you are, how to go back, how to leave.
 *
 * The old header carried the surface's name and a close button and nothing
 * else: the canvas had one mode, so a progress bar would have been counting
 * phases that did not exist. The journey has five steps, so it does.
 *
 * The ribbon itself is `<StepRibbon>` — shared with onboarding, because that
 * surface had the same defect and was about to get the same fix a second time.
 * What stays here is the modal's own chrome: its name, its close, and the
 * decision that the wait screens get no ribbon at all (a run has been charged
 * for; offering to navigate away from it is not navigation, it is a trap).
 */

import { Icon } from "@/components/cv/builder/icons"
import { StepBack, StepRibbon, type RibbonStep } from "@/components/journey/journey-chrome"
import { STEPS, type StepKey, type StepNeed } from "@/lib/preflight/journey"

export function PreflightHeader({
  current,
  need,
  onBack = null,
  onJump,
  onClose,
  closable = true,
}: {
  /** Absent on the wait screens — see above. */
  current?: StepKey
  need?: Record<StepKey, StepNeed>
  onBack?: (() => void) | null
  onJump?: (step: StepKey) => void
  onClose: () => void
  /** A run in flight has been charged for. Closing mid-stream would hide it,
   *  so the exit leaves rather than pretending the modal is dismissible. */
  closable?: boolean
}) {
  const ribbon: RibbonStep[] | null =
    current && need && onJump
      ? STEPS.map((step) => {
          const n = need[step.key]
          return {
            key: step.key,
            title: step.title,
            asks: n.blocking || n.guesses > 0,
            askLabel: n.blocking
              ? "needs an answer"
              : n.guesses > 0
                ? `${n.guesses} to answer`
                : undefined,
          }
        })
      : null

  return (
    <div className="pf-head">
      <div className="pf-head-row">
        {onBack ? <StepBack onBack={onBack} /> : <span className="pf-head-spacer" aria-hidden />}

        <div className="pf-eyebrow">Myro Search</div>

        {closable ? (
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : (
          <span className="pf-head-spacer" aria-hidden />
        )}
      </div>

      {ribbon && current && onJump ? (
        <StepRibbon
          steps={ribbon}
          current={current}
          onJump={(key) => onJump(key as StepKey)}
          label="Search steps"
        />
      ) : null}
    </div>
  )
}
