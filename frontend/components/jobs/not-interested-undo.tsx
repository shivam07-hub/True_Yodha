"use client"

import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import type { FeedbackSurface } from "@/lib/api"
import { SkipReasonChips } from "@/components/jobs/skip-reasons"

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
 * in-card <CaptureConfirm> written for surfaces where the card persists —
 * which is NOT WIRED: that component is rendered by nothing, so this band is
 * the only capture confirmation users see. A SKIP keeps its reason-chip flow.
 */
export function NotInterestedUndo({ kind, jobId, token, onUndo, queuePosition, surface = "market" }: Props) {
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
          <SkipReasonChips
            token={token}
            jobId={jobId}
            surface={surface}
            rowClassName="tm-feed-toast-reasons"
            chipClassName="tm-reason-chip"
            notedClassName="tm-feed-toast-noted"
          />
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
