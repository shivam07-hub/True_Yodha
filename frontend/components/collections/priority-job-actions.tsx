"use client"

import { Heart, X } from "lucide-react"
import type { JobMatch } from "@/lib/api"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"

interface PriorityJobActionsProps {
  token: string
  jobId: string
  job: JobMatch
  prioritized: boolean
  canDismiss?: boolean
  onPriorityToggle: (prioritized: boolean) => void
  onSkip: () => void
  onFindSimilar?: () => void
  tailorHref: string
}

/**
 * The one action row for a collected job, on both the card and its drawer.
 * A heart is explicit priority intent; X is the separate removal decision.
 */
export function PriorityJobActions({
  token,
  jobId,
  job,
  prioritized,
  canDismiss = true,
  onPriorityToggle,
  onSkip,
  onFindSimilar,
  tailorHref,
}: PriorityJobActionsProps) {
  const capture = useApplyCapture({
    token,
    job: {
      job_id: jobId,
      source_url: job.source_url,
      company: job.company,
      listing_confidence: job.is_stale || job.is_active === false ? "uncertain" : undefined,
    },
    surface: "dashboard",
    intentSurface: "collections",
    onFindSimilar,
  })

  return (
    <div className="db-job-intent-group">
      <div className="db-job-intent-actions" onClick={(event) => event.stopPropagation()}>
        {canDismiss ? (
          <>
            <button
              type="button"
              className={`db-icon-btn${prioritized ? " liked" : ""}`}
              aria-label={prioritized ? "Remove job priority" : "Prioritize this job"}
              aria-pressed={prioritized}
              title={prioritized ? "Priority to apply" : "Prioritize to apply"}
              onClick={() => onPriorityToggle(!prioritized)}
            >
              <Heart size={17} fill={prioritized ? "currentColor" : "none"} aria-hidden />
            </button>
            <button
              type="button"
              className="db-icon-btn"
              aria-label="Remove from Collections"
              title="Remove from Collections"
              onClick={onSkip}
            >
              <X size={17} aria-hidden />
            </button>
          </>
        ) : null}
        <a className="db-btn db-btn-primary tm-control-focus" href={tailorHref}>Tailor CV</a>
        {capture.target.url && capture.target.actionLabel ? (
          <a
            className="db-btn db-btn-secondary tm-control-focus"
            href={capture.href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={capture.onApply}
            title={capture.target.actionLabel}
          >
            {capture.target.actionLabel}
          </a>
        ) : null}
      </div>
      <ApplyCapturePrompt capture={capture} />
    </div>
  )
}
