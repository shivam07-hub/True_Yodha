"use client"

import * as React from "react"
import { jobs, type FeedbackSurface } from "@/lib/api"

/**
 * Shared dead-link capture (Job-Intelligence slice 5) — the highest-value trust
 * signal. When the user clicks through to apply and returns, ask once "was this
 * still live?". A "No" is click-verified evidence the listing is gone — the ghost
 * job we most want to catch — and it opens a recovery path to similar roles so a
 * dead end becomes the next application.
 *
 * Reused by both job-detail surfaces. Wire it in three places:
 *   - call `markApplied()` from every apply affordance (external link AND the
 *     careers-search fallback — no-URL listings are the likeliest ghosts),
 *   - render `{prompt}` near the footer,
 *   - pass `onFindSimilar` so the "gone" answer can route back to the feed.
 */
export function useDeadLinkPrompt({
  token,
  jobId,
  surface,
  onFindSimilar,
  onMarkedGone,
}: {
  token: string
  jobId: string
  surface: FeedbackSurface
  /** Recovery route after a "gone" answer — typically close back to the ranked feed. */
  onFindSimilar?: () => void
  /** Fired once when the user confirms the listing is gone (e.g. dismiss the card). */
  onMarkedGone?: () => void
}): { markApplied: () => void; prompt: React.ReactNode } {
  const appliedAt = React.useRef<number | null>(null)
  const [askLive, setAskLive] = React.useState(false)
  const [answered, setAnswered] = React.useState(false)
  const [gone, setGone] = React.useState(false)

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
      setGone(true)
      onMarkedGone?.()
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

  const prompt = gone ? (
    <GoneRecovery onFindSimilar={onFindSimilar} />
  ) : askLive ? (
    <ApplyReturnPrompt onAnswer={answer} />
  ) : null

  return {
    markApplied: () => {
      appliedAt.current = Date.now()
    },
    prompt,
  }
}

/** The "was this still live?" prompt shown after a click-through to apply. */
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

/**
 * Post-"gone" recovery — confirms the ghost was flagged and turns the dead end
 * into the next move. The feed is already fit-ranked, so "find similar roles"
 * simply routes the user back to it (minus this listing on the dashboard).
 */
function GoneRecovery({ onFindSimilar }: { onFindSimilar?: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "10px 24px", borderTop: "1px solid var(--tm-border-soft)",
        background: "var(--tm-int-bg-wash)", fontSize: 12.5, flexWrap: "wrap",
      }}
    >
      <span style={{ color: "var(--tm-text-muted)" }}>Flagged as a ghost job — thanks.</span>
      {onFindSimilar ? (
        <button
          type="button"
          onClick={onFindSimilar}
          style={{ background: "none", border: "none", padding: 0, color: "var(--tm-interactive)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Find similar roles →
        </button>
      ) : null}
    </div>
  )
}
