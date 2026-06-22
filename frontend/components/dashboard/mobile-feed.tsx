"use client"

import * as React from "react"
import { CardActions, PulseRow } from "./card-atoms"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { usePulses } from "@/lib/hooks/use-pulses"
import { type FeedItem } from "@/lib/dashboard/feed-model"
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
  "interviewing",
])

/* ── Row card (shared <FeedCard>) ───────────────────────────────── */
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
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return (
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job: it.job, fit: it.fit })}
      variant="row"
      leaving={leaving}
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      badges={
        <>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {!it.isMatch ? <span className="db-sourcechip">You added</span> : null}
        </>
      }
      fitSize={44}
      pulse={<PulseRow pulse={pulse} mobile />}
      actions={
        <CardActions
          jobId={it.jobId}
          company={it.company}
          liked={liked}
          onLike={liked ? () => leaveThen(onLike) : onLike}
          onSkip={() => leaveThen(onSkip)}
          mobile
        />
      }
    />
  )
}

export function MobileFeed(p: MobileFeedProps) {
  // One batched pulse request for the whole visible set (not one-per-card).
  const pulses = usePulses(p.token, p.items.map((it) => it.jobId))

  const onLike = (it: FeedItem) => (it.isLiked ? p.onRemove(it.jobId) : p.onStatus(it.jobId, "saved"))

  return (
    <div className="db-mfeed">
      <VirtualFeed
        items={p.items}
        getKey={(it) => it.jobId}
        estimateSize={190}
        gap={14}
        renderItem={(it) => (
          <MobileCard
            it={it}
            liked={it.isLiked}
            applied={APPLIED_STATUSES.has(p.appsByJobId[it.jobId] ?? "saved")}
            pulse={pulses.get(it.jobId)}
            onOpen={() => p.onOpenJob(it.jobId)}
            onLike={() => onLike(it)}
            onSkip={() => p.onRemove(it.jobId)}
          />
        )}
      />

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
