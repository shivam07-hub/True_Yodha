"use client"

import type { CSSProperties } from "react"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import type { ApplyIntentSurface, FeedbackSurface } from "@/lib/api"
import { applyLinkAttrs } from "@/lib/jobs/apply-transport"

/** The one Apply control: the click, the link, and "Did you submit?". */
export function ApplyAction({
  token,
  job,
  surface,
  intentSurface,
  className,
  style,
  hidden = false,
}: {
  token: string
  job: {
    job_id: string
    source_url?: string | null
    company?: string | null
    listing_venue?: "career_page" | "myro" | null
    listing_confidence?: "active" | "uncertain" | "closed" | null
  }
  surface: FeedbackSurface
  intentSurface: ApplyIntentSurface
  className?: string
  style?: CSSProperties
  hidden?: boolean
}) {
  const capture = useApplyCapture({ token, job, surface, intentSurface })
  if (hidden || !capture.target.url || !capture.target.actionLabel) return null
  return (
    <>
      <a
        className={className}
        style={style}
        {...applyLinkAttrs(capture.target)}
        onClick={capture.onApply}
        title={capture.target.actionLabel}
      >
        {capture.target.actionLabel}
      </a>
      <ApplyCapturePrompt capture={capture} />
    </>
  )
}
