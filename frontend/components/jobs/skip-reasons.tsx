"use client"

import * as React from "react"
import { PERSONAL_REASONS, sendPersonalFeedback } from "@/lib/jobs/feedback"
import type { FeedbackSurface, PersonalReasonCode } from "@/lib/api"

/**
 * "Why not this one?" — the seven reasons `job_feedback_events` already accepts,
 * offered the moment a job is hidden.
 *
 * ONE component for every surface, because the answer now does something:
 * `matching/passed_on` counts "Not my role" across a user's skips and stops
 * picking the directions that keep coming back. Before that it was a shrug the
 * desktop collected and the phone never asked for at all — 10 reasons on 194
 * skips, read by nothing.
 *
 * Answering is optional and stays one tap away from not answering: the chips sit
 * beside Undo, and ignoring them is the same cost as before (none).
 */
export function SkipReasonChips({
  token,
  jobId,
  surface,
  chipClassName,
  rowClassName,
  notedClassName,
}: {
  token: string
  jobId: string
  surface: FeedbackSurface
  chipClassName: string
  rowClassName: string
  notedClassName: string
}) {
  const [picked, setPicked] = React.useState<PersonalReasonCode | null>(null)

  if (picked) {
    // What it actually does, in the words of the thing it changes. Never "we'll
    // improve your recommendations" — that is a promise with no receipt.
    return (
      <span className={notedClassName}>
        {picked === "not_my_role"
          ? "Noted. Say it twice and Myro stops picking that kind of work."
          : "Noted."}
      </span>
    )
  }

  return (
    <div className={rowClassName} aria-label="Why this job was not relevant">
      {PERSONAL_REASONS.map((item) => (
        <button
          key={item.code}
          type="button"
          className={chipClassName}
          onClick={() => {
            sendPersonalFeedback(token, jobId, item.code, surface)
            setPicked(item.code)
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
