/**
 * WeaveReview — the Accept stepper: one card per step, Keep mine / Take this.
 *
 * The page turns on the click. Nothing here waits on the write: the overlay
 * advances optimistically and rolls back only if the landing actually failed,
 * so a Take never freezes the card it just decided.
 */
"use client"

import type { WeaveStep } from "@/lib/cv/weave-steps"
import { WeaveExtrasCard } from "./weave-extras-card"
import { WeaveRoleCard } from "./weave-role-card"

export function WeaveReview({
  steps, idx, originals, currentSummary, currentSkillsLine,
  error, onToggleOriginal, onDecide, onBack, onDone,
}: {
  steps: WeaveStep[]
  idx: number
  originals: Set<number>
  currentSummary: string
  currentSkillsLine: string
  error: string | null
  onToggleOriginal: (i: number) => void
  onDecide: (action: "take" | "keep") => void
  onBack: () => void
  onDone: () => void
}) {
  const step = steps[idx]

  if (!step) {
    return (
      <div className="tw-review">
        <p className="tw-settled-title">Every line is decided.</p>
        <p className="tw-settled-sub">Your tailored draft is on the paper.</p>
        {error && <p className="tw-err" role="alert">{error}</p>}
        <div className="tw-review-actions">
          <button type="button" className="tw-btn tw-btn-primary" onClick={onDone}>
            Back to the paper
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tw-review">
      <div className="tw-review-strip mono" aria-label="Steps">
        {steps.map((s, i) => (
          <span
            key={s.kind === "extras" ? "extras" : s.role.role_index}
            className="tw-review-dot"
            data-state={i < idx ? "done" : i === idx ? "now" : "todo"}
          />
        ))}
        <span className="tw-review-count">{idx + 1} / {steps.length}</span>
      </div>

      {step.kind === "extras" ? (
        <WeaveExtrasCard
          summary={step.summary}
          skillsLine={step.skillsLine}
          currentSummary={currentSummary}
          currentSkillsLine={currentSkillsLine}
        />
      ) : (
        <WeaveRoleCard
          role={step.role}
          originalIndexes={originals}
          onToggleOriginal={onToggleOriginal}
        />
      )}

      {error && <p className="tw-err" role="alert">{error}</p>}
      <div className="tw-review-actions">
        <button type="button" className="tw-btn tw-btn-ghost" onClick={() => onDecide("keep")}>
          Keep mine
        </button>
        <button type="button" className="tw-btn tw-btn-primary" onClick={() => onDecide("take")}>
          Take this
        </button>
      </div>
      {idx > 0 && (
        <button type="button" className="tw-back" onClick={onBack}>← Back</button>
      )}
    </div>
  )
}
