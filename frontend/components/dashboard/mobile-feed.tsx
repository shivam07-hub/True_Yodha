"use client"

import * as React from "react"
import { Monogram, ChipRow, CardActions, cardChips, PulseRow, cardConfidenceClass } from "./card-atoms"
import { LocationLine, JobMetaChips, cardSummary } from "./lenses"
import { usePulses } from "@/lib/hooks/use-pulses"
import { fitTier, type FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, JobPulse } from "@/lib/api"

export interface MobileFeedProps {
  items: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  hasMore: boolean
  /** The open job is lifted to Dashboard so narrow-desktop + mobile share one
   *  drawer (the card list never owns the detail). */
  onOpenJob: (jobId: string) => void
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onRefresh: () => void
}

const APPLIED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "applied",
  "screening",
  "interviewing",
  "final_round",
])

/* ── Edge-to-edge feed card ─────────────────────────────────────── */
function MobileCard({
  it,
  liked,
  applied,
  pulse,
  onOpen,
  onLike,
  onSkip,
}: {
  it: FeedItem
  liked: boolean
  applied: boolean
  pulse?: JobPulse
  onOpen: () => void
  onLike: () => void
  onSkip: () => void
}) {
  const snippet = cardSummary(it.job)
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return (
    <div
      className={`db-mcard${leaving ? " is-leaving" : ""}${cardConfidenceClass(pulse)}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <Monogram company={it.company} size={40} />
      <div className="db-mcard-body">
        <div className="db-mcard-top">
          <span className="co">{it.company ?? "—"}</span>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {it.fit != null ? <span className={`mfit fit-${fitTier(it.fit)}`}>{it.fit}% fit</span> : null}
        </div>
        <h3 className="db-mrole">{it.role}</h3>
        <LocationLine job={it.job} />
        <JobMetaChips job={it.job} />
        {snippet ? <p className="db-msnip">{snippet}</p> : null}
        <ChipRow chips={cardChips(it.job)} className="db-mchips" />
        <PulseRow pulse={pulse} mobile />
        <CardActions
          jobId={it.jobId}
          company={it.company}
          liked={liked}
          onLike={liked ? () => leaveThen(onLike) : onLike}
          onSkip={() => leaveThen(onSkip)}
          mobile
        />
      </div>
    </div>
  )
}

export function MobileFeed(p: MobileFeedProps) {
  // One batched pulse request for the whole visible set (not one-per-card).
  const pulses = usePulses(p.token, p.items.map((it) => it.jobId))

  const onLike = (it: FeedItem) => (it.isLiked ? p.onRemove(it.jobId) : p.onStatus(it.jobId, "saved"))

  return (
    <div className="db-mfeed">
      <div className="db-mpull">
        <span className="db-label">↓ pull to refresh · next batch tonight</span>
      </div>

      {p.items.map((it) => (
        <MobileCard
          key={it.jobId}
          it={it}
          liked={it.isLiked}
          applied={APPLIED_STATUSES.has(p.appsByJobId[it.jobId] ?? "saved")}
          pulse={pulses.get(it.jobId)}
          onOpen={() => p.onOpenJob(it.jobId)}
          onLike={() => onLike(it)}
          onSkip={() => p.onRemove(it.jobId)}
        />
      ))}

      <div className="db-mfeed-end">
        That&rsquo;s all {p.items.length} ·{" "}
        <button
          type="button"
          onClick={p.onRefresh}
          style={{ background: "none", border: "none", color: "var(--db-accent-text)", cursor: "pointer", font: "inherit" }}
        >
          refresh after the next batch
        </button>
      </div>
    </div>
  )
}
