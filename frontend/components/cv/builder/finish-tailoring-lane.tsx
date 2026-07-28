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

import Link from "next/link"
import type { ApplicationResponse } from "@/lib/api"
import { buildContinueLane, collectionsTriageCtx } from "@/lib/collections/model"
import { displayJobTitle } from "@/lib/jobs/clean-title"

interface Props {
  applications: ApplicationResponse[]
  onOpenJob: (jobId: string) => void
}

// Vertical rail list — cap the visible cards so a long tail of started copies
// doesn't turn the rail into an endless scroll. The overflow is real work, so
// it's a link into Collections (their home) rather than a silent truncation.
const MAX_VISIBLE = 6

export function FinishTailoringLane({ applications, onOpenJob }: Props) {
  // No fit/followed/target signals needed here — the lane is "resume your
  // tailored copies", ranked by the model's own next-best order.
  const ctx = collectionsTriageCtx(applications, [], [])
  const items = buildContinueLane(applications, ctx, new Map())
  if (items.length === 0) return null

  const shown = items.slice(0, MAX_VISIBLE)
  const overflow = items.length - shown.length

  return (
    <section className="tm-lib-continue" aria-label="Finish tailoring">
      <div className="tm-lib-continue-head">
        <span className="tm-lib-continue-title">Finish tailoring</span>
        <span className="tm-lib-continue-sub">{items.length} started · one step from applying</span>
      </div>
      <div className="tm-lib-continue-row">
        {/* Only the FIRST card wears the accent. This lane is a best-next
            queue, so exactly one row is the recommendation; when all five wore
            an accent border + wash + accent company name + accent CTA, roughly
            twenty accent elements competed and none of them led. The rest are
            neutral rows the user can still reach. */}
        {shown.map((it, i) => (
          <button
            key={it.jobId}
            type="button"
            className={`tm-lib-continue-card tm-control-focus${i === 0 ? " tm-lib-continue-card--lead" : ""}`}
            onClick={() => onOpenJob(it.jobId)}
          >
            <span className="tm-lib-continue-co">{it.company ?? "Untitled company"}</span>
            <span className="tm-lib-continue-role">{displayJobTitle(it.role, it.company)}</span>
            <span className="tm-lib-continue-cta">Finish &amp; apply →</span>
          </button>
        ))}
      </div>
      {overflow > 0 && (
        <Link href="/collections" className="tm-lib-continue-more">
          +{overflow} more in Collections →
        </Link>
      )}
    </section>
  )
}
