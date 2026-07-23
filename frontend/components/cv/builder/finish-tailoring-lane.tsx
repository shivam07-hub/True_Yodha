/**
 * "Finish tailoring" lane — tailored-but-not-applied saved jobs, best-next
 * first. Relocated from Collections to the CV workspace (2026-07-23): a
 * half-finished tailored CV is a CV artifact, so /cv is its natural home.
 *
 * Reuses the canonical lane definition (`buildContinueLane`) so "what counts as
 * finish-tailoring" has ONE source and can't drift between surfaces. Styled in
 * the page-scoped .tm-lib-* system, not the collections --db-* tokens.
 */
"use client"

import type { ApplicationResponse } from "@/lib/api"
import { buildContinueLane, collectionsTriageCtx } from "@/lib/collections/model"

interface Props {
  applications: ApplicationResponse[]
  onOpenJob: (jobId: string) => void
}

export function FinishTailoringLane({ applications, onOpenJob }: Props) {
  // No fit/followed/target signals needed here — the lane is "resume your
  // tailored copies", ranked by the model's own next-best order.
  const ctx = collectionsTriageCtx(applications, [], [])
  const items = buildContinueLane(applications, ctx, new Map())
  if (items.length === 0) return null

  return (
    <section className="tm-lib-continue" aria-label="Finish tailoring">
      <div className="tm-lib-continue-head">
        <span className="tm-lib-continue-title">Finish tailoring</span>
        <span className="tm-lib-continue-sub">{items.length} started · one step from applying</span>
      </div>
      <div className="tm-lib-continue-row">
        {items.map((it) => (
          <button
            key={it.jobId}
            type="button"
            className="tm-lib-continue-card tm-control-focus"
            onClick={() => onOpenJob(it.jobId)}
          >
            <span className="tm-lib-continue-co">{it.company ?? "Untitled company"}</span>
            <span className="tm-lib-continue-role">{it.role}</span>
            <span className="tm-lib-continue-cta">Finish &amp; apply →</span>
          </button>
        ))}
      </div>
    </section>
  )
}
