"use client"

/**
 * The persistent header — title, close, and the three-segment progress ribbon.
 *
 * Three named segments rather than a percentage, because "62%" of a conversation
 * means nothing and the user's real question is "how much more of this is
 * there". SAY IT · CONFIRM · RUN answers that in three words.
 */

import { Icon } from "@/components/cv/builder/icons"

export type Stage = "say" | "confirm" | "run"

const STAGES: { key: Stage; label: string }[] = [
  { key: "say", label: "Say it" },
  { key: "confirm", label: "Confirm" },
  { key: "run", label: "Run" },
]

export function PreflightHeader({
  stage,
  onClose,
  closable = true,
}: {
  stage: Stage
  onClose: () => void
  /** A run in flight has been charged for. Closing mid-stream would hide it, so
   *  the exit leaves rather than pretending the modal is dismissible. */
  closable?: boolean
}) {
  const index = STAGES.findIndex((s) => s.key === stage)

  return (
    <div className="pf-head">
      <div className="pf-head-row">
        <div>
          <div className="pf-eyebrow">Myro Ops · pre-flight</div>
          <h3 className="pf-title">Myro Search</h3>
        </div>
        {closable ? (
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        ) : null}
      </div>

      <div className="pf-ribbon">
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className="pf-ribbon-step"
            data-state={i < index ? "done" : i === index ? "current" : "future"}
          >
            <div className="pf-ribbon-bar" />
            <div className="pf-ribbon-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
