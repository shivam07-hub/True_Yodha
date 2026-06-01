"use client"

import * as React from "react"
import { MobileJobCard } from "./job-card"
import type { OtherRole } from "./lens-company"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"

export interface MobileFeedProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  initialJobId?: string | null
  hasMore: boolean
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onSkillToggle: (s: SkillGapItem) => void
  onRefresh: () => void
}

function otherRolesFor(allItems: FeedItem[], it: FeedItem): OtherRole[] {
  if (!it.company) return []
  return allItems
    .filter((o) => o.jobId !== it.jobId && o.company === it.company)
    .map((o) => ({ jobId: o.jobId, role: o.role, fit: o.fit }))
}

/** Perplexity-style flowing card list. No scroll-snap, no horizontal swipe —
 *  cards flow in a normal scroll and expand in place. Accordion: one card open
 *  at a time (Q7), so at most one card's 10-XP analysis is ever live. */
export function MobileFeed(p: MobileFeedProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(p.initialJobId ?? null)

  const toggle = React.useCallback((jobId: string) => {
    setExpandedId((cur) => (cur === jobId ? null : jobId))
  }, [])

  // Deep-link: open the requested card once on mount (replaces the dropped
  // index sheet as the only "jump to a specific job" path).
  React.useEffect(() => {
    if (p.initialJobId) setExpandedId(p.initialJobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="db-feed">
      {p.items.map((it) => (
        <MobileJobCard
          key={it.jobId}
          job={it.job}
          status={p.appsByJobId[it.jobId] ?? "saved"}
          token={p.token}
          active={expandedId === it.jobId}
          expanded={expandedId === it.jobId}
          cartSkillNames={p.cartSkillNames}
          otherRoles={otherRolesFor(p.allItems, it)}
          onStatus={(s) => p.onStatus(it.jobId, s)}
          onSkillToggle={p.onSkillToggle}
          onJump={(jobId) => setExpandedId(jobId)}
          onToggle={() => toggle(it.jobId)}
        />
      ))}

      <div className="db-feed-end">
        <div className="db-end-inner">
          <div className="db-end-title">That&rsquo;s all {p.items.length}.</div>
          <p className="db-end-sub">Refresh after the next market batch for fresh matches.</p>
          <button type="button" className="db-act-btn accent" onClick={p.onRefresh}>
            Refresh matches →
          </button>
        </div>
      </div>
    </div>
  )
}
