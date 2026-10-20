/**
 * WeaveReview — the Accept stepper: one card per step, Keep mine / Take this.
 *
 * The page turns on the click. Nothing here waits on the write: the overlay
 * advances optimistically and rolls back only if the landing actually failed,
 * so a Take never freezes the card it just decided.
 *
 * FD2 (2026-10-20): a fresh review leads with "Take all" — every card in one
 * write, the same guards on every line — with "Review each" for anyone who
 * wants the stepper. There is no "Every line is decided" screen: when the last
 * write lands the modal closes and the paper is the answer. A write still in
 * flight shows "Saving…"; a failed one stays open and says so.
 */
"use client"

import { useEffect, useState } from "react"

import type { WeaveStep } from "@/lib/cv/weave-steps"
import { WeaveExtrasCard } from "./weave-extras-card"
import { WeaveRoleCard } from "./weave-role-card"

export function WeaveReview({
  steps, idx, originals, currentSummary, currentSkillsLine,
  error, saving, onToggleOriginal, onDecide, onTakeAll, onBack, onDone,
}: {
  steps: WeaveStep[]
  idx: number
  originals: Set<number>
  currentSummary: string
  currentSkillsLine: string
  error: string | null
  /** A landing is still being written. */
  saving: boolean
  onToggleOriginal: (i: number) => void
  onDecide: (action: "take" | "keep") => void
  onTakeAll: () => void
  onBack: () => void
  onDone: () => void
}) {
  const step = steps[idx]
  const [stepping, setStepping] = useState(false)
  const settled = !step && !saving && !error

  useEffect(() => {
    if (settled) onDone()
  }, [settled, onDone])

  if (!step) {
    return (
      <div className="tw-review">
        {error ? (
          <>
            <p className="tw-err" role="alert">{error}</p>
            <div className="tw-review-actions">
              <button type="button" className="tw-btn tw-btn-primary" onClick={onDone}>
                Back to the paper
              </button>
            </div>
          </>
        ) : (
          <p className="tw-settled-sub" aria-live="polite">Saving…</p>
        )}
      </div>
    )
  }

  const offerAll = idx === 0 && !stepping && steps.length > 1

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
      {offerAll ? (
        <div className="tw-review-actions">
          <button type="button" className="tw-btn tw-btn-ghost" onClick={() => setStepping(true)}>
            Review each
          </button>
          <button type="button" className="tw-btn tw-btn-primary" onClick={onTakeAll}>
            Take all
          </button>
        </div>
      ) : (
        <div className="tw-review-actions">
          <button type="button" className="tw-btn tw-btn-ghost" onClick={() => onDecide("keep")}>
            Keep mine
          </button>
          <button type="button" className="tw-btn tw-btn-primary" onClick={() => onDecide("take")}>
            Take this
          </button>
        </div>
      )}
      {idx > 0 && (
        <button type="button" className="tw-back" onClick={onBack}>← Back</button>
      )}
    </div>
  )
}
