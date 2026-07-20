"use client"

import * as React from "react"
import { useJobLiveness } from "@/lib/hooks/use-job-liveness"
import { livenessNotice } from "@/lib/jobs/detail-model"
import { formatRelativeAge } from "@/lib/format"
import "./listing-liveness.css"

/**
 * Whether this listing still exists, said plainly at the top of the job detail.
 *
 * Both skins mount this from the same model fn, so desktop and mobile can never
 * tell a user different things about the same job. Renders nothing while the
 * check is in flight or if it fails — an unavailable check is not a warning.
 */
export function ListingLiveness({ jobId }: { jobId: string }) {
  const { liveness } = useJobLiveness(jobId)
  const stamp = liveness?.verified_live_at ?? liveness?.checked_at ?? null
  const age = React.useMemo(() => {
    if (!stamp) return null
    const ms = Date.parse(stamp)
    return Number.isNaN(ms) ? null : formatRelativeAge(ms)
  }, [stamp])

  const notice = livenessNotice(liveness?.state, { relativeAge: age })
  if (!notice) return null

  return (
    <p
      className={`jlive jlive--${notice.tone}`}
      role={notice.tone === "warn" ? "status" : undefined}
    >
      {notice.text}
    </p>
  )
}
