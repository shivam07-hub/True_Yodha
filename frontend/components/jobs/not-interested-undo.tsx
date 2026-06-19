"use client"

import { useState } from "react"
import type { FeedbackSurface, PersonalReasonCode } from "@/lib/api"
import { PERSONAL_REASONS, sendPersonalFeedback } from "@/lib/jobs/feedback"

interface Props {
  kind: "saved" | "skipped"
  jobId: string
  token: string
  onUndo: () => void
  surface?: FeedbackSurface
}

export function NotInterestedUndo({ kind, jobId, token, onUndo, surface = "market" }: Props) {
  const [reason, setReason] = useState<PersonalReasonCode | null>(null)
  return (
    <div className="tm-feed-toast" role="status" aria-live="polite">
      <div className="tm-feed-toast-head">
        <span>{kind === "saved" ? "Saved" : "Not interested"}</span>
        <button type="button" onClick={onUndo}>Undo</button>
      </div>
      {kind === "skipped" ? (
        reason ? <span className="tm-feed-toast-noted">Noted</span> : (
          <div className="tm-feed-toast-reasons" aria-label="Why this job was not relevant">
            {PERSONAL_REASONS.map((item) => (
              <button key={item.code} type="button" className="tm-reason-chip" onClick={() => { sendPersonalFeedback(token, jobId, item.code, surface); setReason(item.code) }}>
                {item.label}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
