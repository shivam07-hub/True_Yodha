"use client"

import * as React from "react"
import { JobCardTabs } from "./job-card"
import type { OtherRole } from "./lens-company"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"

export interface DesktopGridProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  initialJobId?: string | null
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onSkillToggle: (s: SkillGapItem) => void
}

function otherRolesFor(allItems: FeedItem[], it: FeedItem): OtherRole[] {
  if (!it.company) return []
  return allItems
    .filter((o) => o.jobId !== it.jobId && o.company === it.company)
    .map((o) => ({ jobId: o.jobId, role: o.role, fit: o.fit }))
}

export function DesktopGrid(p: DesktopGridProps) {
  const [expanded, setExpanded] = React.useState<string | null>(p.initialJobId ?? null)

  return (
    <div className="db-grid">
      {p.items.map((it) => {
        if (expanded === it.jobId) {
          return (
            <div className="db-grid-expanded" key={it.jobId}>
              <button type="button" className="db-grid-collapse" onClick={() => setExpanded(null)}>
                ← Close
              </button>
              <JobCardTabs
                job={it.job}
                status={p.appsByJobId[it.jobId] ?? "saved"}
                token={p.token}
                active
                cartSkillNames={p.cartSkillNames}
                otherRoles={otherRolesFor(p.allItems, it)}
                onStatus={(s) => p.onStatus(it.jobId, s)}
                onRemove={() => p.onRemove(it.jobId)}
                onSkillToggle={p.onSkillToggle}
                onJump={(jobId) => setExpanded(jobId)}
              />
            </div>
          )
        }
        return (
          <button
            key={it.jobId}
            type="button"
            className="db-tile tm-control-focus"
            onClick={() => setExpanded(it.jobId)}
          >
            <span className="db-tile-co">{it.company ?? "—"}</span>
            <span className="db-tile-role">{it.role}</span>
            <span className="db-tile-fit">
              {it.fit != null ? `${it.fit}%` : "★"}
            </span>
          </button>
        )
      })}
    </div>
  )
}
