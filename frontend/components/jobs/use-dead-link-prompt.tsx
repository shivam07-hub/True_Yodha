"use client"

import * as React from "react"
import { jobs, type FeedbackSurface } from "@/lib/api"

/**
 * Shared dead-link capture (Job-Intelligence slice 5) — the highest-value trust
 * signal. When the user clicks through to a company portal and returns, ask once
 * "was this still live?". A "No" is click-verified evidence the listing is gone.
 *
 * Reused by both job-detail surfaces: call `markApplied()` from the external
 * Apply link's onClick, render `{prompt}` near the footer.
 */
export function useDeadLinkPrompt({
  token,
  jobId,
  surface,
}: {
  token: string
  jobId: string
  surface: FeedbackSurface
}): { markApplied: () => void; prompt: React.ReactNode } {
  const appliedAt = React.useRef<number | null>(null)
  const [askLive, setAskLive] = React.useState(false)
  const [answered, setAnswered] = React.useState(false)

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (appliedAt.current == null || answered) return
      if (Date.now() - appliedAt.current < 1200) return // ignore an instant bounce
      setAskLive(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [answered])

  const answer = (live: boolean) => {
    setAnswered(true)
    setAskLive(false)
    if (!live) {
      void jobs
        .submitFeedback(token, {
          client_event_id: crypto.randomUUID(),
          job_id: jobId,
          feedback_kind: "quality",
          reason_code: "apply_link_closed",
          surface,
        })
        .catch(() => {
          /* best-effort */
        })
    }
  }

  return {
    markApplied: () => {
      appliedAt.current = Date.now()
    },
    prompt: askLive ? <ApplyReturnPrompt onAnswer={answer} /> : null,
  }
}

/** The "was this still live?" prompt shown after a click-through to the portal. */
function ApplyReturnPrompt({ onAnswer }: { onAnswer: (live: boolean) => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 24px",
        borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-int-bg-wash)",
        fontSize: 12.5, flexWrap: "wrap",
      }}
    >
      <span style={{ color: "var(--tm-text)", fontWeight: 600 }}>Was this still live?</span>
      <button type="button" onClick={() => onAnswer(true)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontSize: 12, cursor: "pointer" }}>
        Yes
      </button>
      <button type="button" onClick={() => onAnswer(false)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-danger)", background: "transparent", color: "var(--tm-danger)", fontSize: 12, cursor: "pointer" }}>
        No, it&rsquo;s gone
      </button>
    </div>
  )
}
