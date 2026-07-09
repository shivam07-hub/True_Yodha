"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import type { FeedbackSurface, PersonalReasonCode } from "@/lib/api"
import { PERSONAL_REASONS, sendPersonalFeedback } from "@/lib/jobs/feedback"

interface Props {
  kind: "saved" | "skipped"
  jobId: string
  token: string
  onUndo: () => void
  /** Position in the tailor queue (savedCount) — rendered as "#3 in queue". */
  queuePosition?: number
  surface?: FeedbackSurface
}

/**
 * The market triage confirmation. Because the triage feed drains the card on
 * action (locked model), the confirmation rides as a portaled band — but it
 * speaks the ONE unified capture language: a SAVE answers "where it went" (✓ In
 * Collections · #N in queue) AND "what's next" (Tailor now →), matching the
 * in-card <CaptureConfirm> shown on surfaces where the card persists. A SKIP
 * keeps its reason-chip flow.
 */
export function NotInterestedUndo({ kind, jobId, token, onUndo, queuePosition, surface = "market" }: Props) {
  const [reason, setReason] = useState<PersonalReasonCode | null>(null)
  const router = useRouter()
  if (typeof document === "undefined") return null
  // Portaled to <body> to escape the transformed .tm-page-enter / .tm-shell-enter
  // containing block, so position:fixed is viewport-anchored — not stuck mid-feed
  // beside the card. Same pattern as the job-detail drawer and filters sheet.
  return createPortal(
    <div className={`tm-feed-toast${kind === "saved" ? " tm-feed-toast-saved" : ""}`} role="status" aria-live="polite">
      {kind === "saved" ? (
        <>
          <div className="tm-feed-toast-head">
            <span className="tm-feed-toast-saved-lead">
              <Check /> In Collections
              {queuePosition ? <span className="tm-feed-toast-pos">· #{queuePosition} in queue</span> : null}
            </span>
            <button type="button" onClick={onUndo}>Undo</button>
          </div>
          <button
            type="button"
            className="tm-feed-toast-tailor"
            onClick={() => router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)}
          >
            Tailor now <span aria-hidden>→</span>
          </button>
        </>
      ) : (
        <>
          <div className="tm-feed-toast-head">
            <span>Not interested</span>
            <button type="button" onClick={onUndo}>Undo</button>
          </div>
          {reason ? <span className="tm-feed-toast-noted">Noted</span> : (
            <div className="tm-feed-toast-reasons" aria-label="Why this job was not relevant">
              {PERSONAL_REASONS.map((item) => (
                <button key={item.code} type="button" className="tm-reason-chip" onClick={() => { sendPersonalFeedback(token, jobId, item.code, surface); setReason(item.code) }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  )
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}
