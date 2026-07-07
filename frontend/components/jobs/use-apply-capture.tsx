"use client"

import * as React from "react"
import { jobs, type FeedbackSurface } from "@/lib/api"
import { resolveApplyTarget, type ApplyTarget } from "@/lib/jobs/apply-transport"

/**
 * Apply Transport (behaviour half) — the one seam every "leave to apply" flows
 * through. It resolves the destination, arms the click-verified liveness capture
 * in the same act (so no surface can transport a user without asking), and on a
 * "gone" answer fires the `apply_link_closed` quality signal that feeds Job
 * Intelligence → Listing Confidence → the crowd-sourced ghost count on the card.
 *
 * Headless by design: it emits `state` (`idle | asking | gone`) and handlers;
 * each design system renders its own band via a presentational adapter
 * (`ApplyCapturePrompt` web `--tm-*`, or the mobile `.mm-*` variant). This is
 * what lets the same capture run on web drawers AND the mobile Jobs sheet.
 *
 * Wire it in three shapes:
 *   - `<a href={t.href} onClick={t.onApply}>` — web anchors keep link semantics,
 *   - `t.open()` — imperative window.open for handler-only surfaces (mobile),
 *   - render the prompt adapter off `t.state` / `t.answer` / `t.findSimilar`.
 */
export type CaptureState = "idle" | "asking" | "gone"

export interface ApplyCapture {
  target: ApplyTarget
  /** Destination for an `<a href>` (null when no link — render a disabled state). */
  href: string | null
  /** Arm the capture — call from an anchor onClick, or before a manual window.open. */
  onApply: () => void
  /** Imperative transport: opens the target in a new tab AND arms the capture. */
  open: () => void
  state: CaptureState
  answer: (live: boolean) => void
  findSimilar: () => void
}

export function useApplyCapture({
  token,
  job,
  surface,
  onFindSimilar,
}: {
  token: string
  job: { job_id: string; source_url?: string | null; company?: string | null }
  surface: FeedbackSurface
  /** Recovery route after a "gone" answer — typically close back to the ranked feed. */
  onFindSimilar?: () => void
}): ApplyCapture {
  const target = resolveApplyTarget(job)
  const appliedAt = React.useRef<number | null>(null)
  const [state, setState] = React.useState<CaptureState>("idle")
  const answered = React.useRef(false)

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (appliedAt.current == null || answered.current) return
      if (Date.now() - appliedAt.current < 1200) return // ignore an instant bounce
      setState("asking")
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  const onApply = React.useCallback(() => {
    appliedAt.current = Date.now()
  }, [])

  const open = React.useCallback(() => {
    onApply()
    if (target.url && typeof window !== "undefined") {
      window.open(target.url, "_blank", "noopener,noreferrer")
    }
  }, [onApply, target.url])

  const answer = React.useCallback(
    (live: boolean) => {
      answered.current = true
      if (live) {
        setState("idle")
        return
      }
      setState("gone")
      void jobs
        .submitFeedback(token, {
          client_event_id: crypto.randomUUID(),
          job_id: job.job_id,
          feedback_kind: "quality",
          reason_code: "apply_link_closed",
          surface,
        })
        .catch(() => {
          /* best-effort — a failed signal never disturbs the apply flow */
        })
    },
    [token, job.job_id, surface],
  )

  const findSimilar = React.useCallback(() => {
    onFindSimilar?.()
  }, [onFindSimilar])

  return { target, href: target.url, onApply, open, state, answer, findSimilar }
}
