/**
 * Which CV is on the page. Main CV is the first row on the desktop entry.
 * Under that, tailored-but-not-applied jobs, best-next first.
 *
 * The open document is the current row. The first card is not a recommendation
 * wearing the accent — that used to light Microsoft while a PwC CV was open.
 */
"use client"

import Link from "next/link"
import { useCollection } from "@/lib/collections/use-collection"
import { orderEntries } from "@/lib/collections/model"
import { duplicateTitleKeys, titleKey } from "@/lib/cv/cv-list"
import { displayCompany } from "./keyword-utils"
import { displayJobTitle } from "@/lib/jobs/clean-title"
import type { JobMatch } from "@/lib/api"

interface Props {
  token: string
  /** The job whose CV is open. Null means the Main CV. */
  activeJobId?: string | null
  /** Desktop entry: Main CV is row one. The phone hub leaves this off. */
  includeMain?: boolean
  onOpenMain?: () => void
  onOpenJob: (jobId: string) => void
}

const MAX_VISIBLE = 6

function placeLabel(job: JobMatch): string {
  return job.location_city?.trim()
    || job.location?.trim()
    || job.locations?.find((item) => item.trim())?.trim()
    || ""
}

export function FinishTailoringLane({
  token, activeJobId = null, includeMain = false, onOpenMain, onOpenJob,
}: Props) {
  const collection = useCollection(token)
  const items = orderEntries(collection.byStage("tailored"), "fit")
  if (!includeMain && items.length === 0) return null

  const shown = items.slice(0, MAX_VISIBLE)
  const overflow = items.length - shown.length
  const rows = shown.map((it) => ({
    company: displayCompany(it.job.company),
    title: displayJobTitle(it.job.title, it.job.company),
  }))
  const duplicates = duplicateTitleKeys(rows)

  return (
    <section className="tm-lib-continue" aria-label="Your CVs">
      <div className="tm-lib-continue-head">
        <span className="tm-lib-continue-title">{includeMain ? "Your CVs" : "Finish tailoring"}</span>
      </div>
      <div className="tm-lib-continue-row">
        {includeMain && onOpenMain && (
          <button
            type="button"
            className={`tm-lib-continue-card tm-control-focus${activeJobId == null ? " is-current" : ""}`}
            aria-current={activeJobId == null ? "true" : undefined}
            onClick={onOpenMain}
          >
            <span className="tm-lib-continue-role">Main CV</span>
          </button>
        )}
        {shown.map((it) => {
          const co = displayCompany(it.job.company)
          const title = displayJobTitle(it.job.title, it.job.company)
          const current = activeJobId === it.job_id
          const location = duplicates.has(titleKey(co, title)) ? placeLabel(it.job) : ""
          return (
            <button
              key={it.job_id}
              type="button"
              className={`tm-lib-continue-card tm-control-focus${current ? " is-current" : ""}`}
              aria-current={current ? "true" : undefined}
              onClick={() => onOpenJob(it.job_id)}
            >
              {co ? <span className="tm-lib-continue-co">{co}</span> : null}
              <span className="tm-lib-continue-role">{title}</span>
              {location ? <span className="tm-lib-continue-place">{location}</span> : null}
            </button>
          )
        })}
      </div>
      {overflow > 0 && (
        <Link href="/collections" className="tm-lib-continue-more">
          {overflow} more in Collections
        </Link>
      )}
    </section>
  )
}
