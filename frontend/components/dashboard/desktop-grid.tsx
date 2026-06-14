"use client"

import * as React from "react"
import { CardActions, PulseRow } from "./card-atoms"
import { FeedCard, FeedFitRing, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import type { OtherRole } from "./lens-company"
import { usePulses } from "@/lib/hooks/use-pulses"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, JobPulse, SkillGapItem } from "@/lib/api"

export interface DesktopGridProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  /** Controlled open card (lifted to Dashboard). The detail renders in the peek
   *  panel (wide) or the shared drawer (narrow) — the card never expands inline.
   *  null = none open. */
  openId: string | null
  onOpenJob: (jobId: string | null) => void
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onSkillToggle: (s: SkillGapItem) => void
}

const APPLIED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "applied",
  "screening",
  "interviewing",
  "final_round",
])

export function otherRolesFor(allItems: FeedItem[], it: FeedItem): OtherRole[] {
  if (!it.company) return []
  return allItems
    .filter((o) => o.jobId !== it.jobId && o.company === it.company)
    .map((o) => ({ jobId: o.jobId, role: o.role, fit: o.fit }))
}

/** One collapsed card. Detail opens in the peek panel / drawer, not inline. */
function JobCard({
  it,
  open,
  liked,
  applied,
  pulse,
  onOpen,
  onLike,
  onSkip,
}: {
  it: FeedItem
  open: boolean
  liked: boolean
  applied: boolean
  pulse?: JobPulse
  onOpen: () => void
  onLike: () => void
  onSkip: () => void
}) {
  // Skip / unlike animate the card out, THEN remove it — so the feed doesn't
  // jump (the removal is optimistic + instant, so we delay it one beat).
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return (
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job: it.job })}
      variant="row"
      open={open}
      leaving={leaving}
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      badges={
        <>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {!it.isMatch ? <span className="db-sourcechip">You added</span> : null}
        </>
      }
      fit={it.fit != null ? <FeedFitRing fit={it.fit} /> : undefined}
      pulse={<PulseRow pulse={pulse} />}
      actions={
        <CardActions
          jobId={it.jobId}
          liked={liked}
          onLike={liked ? () => leaveThen(onLike) : onLike}
          onSkip={() => leaveThen(onSkip)}
        />
      }
    />
  )
}

export function DesktopGrid(p: DesktopGridProps) {
  // One batched pulse request for the whole visible set (not one-per-card).
  const pulses = usePulses(p.token, p.items.map((it) => it.jobId))

  return (
    <VirtualFeed
      items={p.items}
      getKey={(it) => it.jobId}
      estimateSize={190}
      gap={14}
      className="db-feed"
      renderItem={(it) => {
        const open = p.openId === it.jobId
        const applied = APPLIED_STATUSES.has(p.appsByJobId[it.jobId] ?? "saved")
        return (
          <JobCard
            it={it}
            open={open}
            liked={it.isLiked}
            applied={applied}
            pulse={pulses.get(it.jobId)}
            onOpen={() => p.onOpenJob(open ? null : it.jobId)}
            onLike={() => (it.isLiked ? p.onRemove(it.jobId) : p.onStatus(it.jobId, "saved"))}
            onSkip={() => p.onRemove(it.jobId)}
          />
        )
      }}
    />
  )
}
