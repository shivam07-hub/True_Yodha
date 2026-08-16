"use client"

/**
 * The persistent header — title, close, and the three-chapter ribbon.
 *
 * Name · Check · Search are chapters, not clicks. Checking can take several
 * turns; when it does, the current label says which, so the bars do not
 * pretend the work is equal.
 */

import { Icon } from "@/components/cv/builder/icons"

export type Stage = "say" | "confirm" | "run"

const STAGES: { key: Stage; label: string }[] = [
  { key: "say", label: "Name" },
  { key: "confirm", label: "Check" },
  { key: "run", label: "Search" },
]

export function PreflightHeader({
  stage,
  onClose,
  closable = true,
  compact = false,
  confirmProgress,
}: {
  stage: Stage
  onClose: () => void
  /** A run in flight has been charged for. Closing mid-stream would hide it, so
   *  the exit leaves rather than pretending the modal is dismissible. */
  closable?: boolean
  /** Screen 1's question is the heading. Hide "Myro Search" so the two don't fight. */
  compact?: boolean
  confirmProgress?: { current: number; total: number }
}) {
  const index = STAGES.findIndex((s) => s.key === stage)

  return (
    <div className="pf-head" data-compact={compact ? "true" : undefined}>
      <div className="pf-head-row">
        <div>
          <div className="pf-eyebrow">Myro Ops · pre-flight</div>
          {compact ? null : <h3 className="pf-title">Myro Search</h3>}
        </div>
        {closable ? (
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : null}
      </div>

      <div className="pf-ribbon" aria-label="Name, then check, then search. Checking can take a few turns.">
        {STAGES.map((s, i) => {
          const label =
            s.key === "confirm" && confirmProgress && confirmProgress.total > 1
              ? `Check · ${confirmProgress.current} of ${confirmProgress.total}`
              : s.label
          return (
            <div
              key={s.key}
              className="pf-ribbon-step"
              data-state={i < index ? "done" : i === index ? "current" : "future"}
            >
              <div className="pf-ribbon-bar" />
              <div className="pf-ribbon-label">{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
