/**
 * "Finish tailoring" lane — tailored-but-not-applied jobs, best-next first.
 * Relocated from Collections to the CV workspace (2026-07-23): a half-finished
 * tailored CV is a CV artifact, so /cv is its natural home.
 *
 * Reads the Collection Record's `tailored` stage, so "what counts as
 * finish-tailoring" has ONE source (CONTEXT.md → Collection Record) and the
 * lane and the Collections chip can never disagree. It used to derive the lane
 * from `application.cv_badge`, which is the COMPANY thread head, not this job's
 * CV — so tailoring one role at Acme pulled every other Acme save into the lane.
 * Styled in the page-scoped .tm-lib-* system, not the collections --db-* tokens.
 */
"use client"

import Link from "next/link"
import { useCollection } from "@/lib/collections/use-collection"
import { orderEntries } from "@/lib/collections/model"
import { displayCompany } from "./keyword-utils"
import { displayJobTitle } from "@/lib/jobs/clean-title"

interface Props {
  token: string
  onOpenJob: (jobId: string) => void
}

// Vertical rail list — cap the visible cards so a long tail of started copies
// doesn't turn the rail into an endless scroll. The overflow is real work, so
// it's a link into Collections (their home) rather than a silent truncation.
const MAX_VISIBLE = 6

export function FinishTailoringLane({ token, onOpenJob }: Props) {
  // "Resume your tailored copies", best fit first — the same Match Verdict order
  // every other surface uses. No local ranking here and none needed. The
  // collection is one shared 60s-cached key, so reading it here costs nothing
  // that /collections has not already paid.
  const collection = useCollection(token)
  const items = orderEntries(collection.byStage("tailored"), "fit")
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
        {shown.map((it, i) => {
          const co = displayCompany(it.job.company)
          return (
          <button
            key={it.job_id}
            type="button"
            className={`tm-lib-continue-card tm-control-focus${i === 0 ? " tm-lib-continue-card--lead" : ""}`}
            onClick={() => onOpenJob(it.job_id)}
          >
            {co ? <span className="tm-lib-continue-co">{co}</span> : null}
            <span className="tm-lib-continue-role">{displayJobTitle(it.job.title, it.job.company)}</span>
            <span className="tm-lib-continue-cta">Finish &amp; apply →</span>
          </button>
          )
        })}
      </div>
      {overflow > 0 && (
        <Link href="/collections" className="tm-lib-continue-more">
          +{overflow} more in Collections →
        </Link>
      )}
    </section>
  )
}
