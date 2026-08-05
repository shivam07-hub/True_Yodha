"use client"

import { ExternalLink } from "lucide-react"
import { CvAnalysisStage } from "@/components/cv/analysis-stage"
import type { CVUploadPhase } from "@/lib/cv-upload-state"

/**
 * The CV-analysis wait during onboarding — the longest one in the product
 * (prod: p50 48s, p90 109s) and the one sitting on the leakiest step of the
 * funnel.
 *
 * It used to be a centred spinner with a phase label, while the logged-out
 * preview of the same work got a full branded console. The design budget was
 * spent on the short wait; the two-minute wait got the spinner. Both now render
 * the same `CvAnalysisStage`, and the stall clock, the copy and the thresholds
 * all come from the shared model rather than being re-derived here.
 *
 * What stays local is what is genuinely local: the escape hatch. Onboarding is
 * where "go and do something else, this keeps running" is the right answer, and
 * that link needs `rel="opener"` to carry the session into the new tab.
 */

interface Props {
  phase: string
  /** Re-poll now. Absent when the caller has nothing to retry. The stage shows
   *  it only once the wait has genuinely stalled. */
  onRetry?: () => void
}

export function AnalysisProgress({ phase, onRetry }: Props) {
  return (
    <div className="w-full max-w-lg">
      <CvAnalysisStage
        as="h1"
        kind="job"
        phase={phase as CVUploadPhase}
        onRetry={onRetry}
        actions={
          <a
            href="/market"
            target="_blank"
            // The destination is this same Myro origin. `opener` deliberately keeps
            // the browser's initial sessionStorage clone, so an in-progress CV
            // upload can be browsed in a new tab without making the user sign in
            // again. Do not use this relationship for an external link.
            rel="opener"
            className="tm-control-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] px-5 text-sm font-semibold text-[var(--tm-interactive-rest)] transition-colors hover:bg-[var(--tm-surface-hover)]"
          >
            Browse jobs while Myro works
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        }
      />
    </div>
  )
}
