"use client"

import * as React from "react"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { PriorityJobActions } from "@/components/collections/priority-job-actions"
import { DetailBody } from "./detail-body"
import { LocationLine } from "./lenses"
import { otherRolesFor } from "./lens-company"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { SkillGapItem } from "@/lib/api"

/**
 * Dashboard job detail (build stage). Same drawer shell + header as live, a
 * build-focused body (DetailBody: why-you-fit, skills-to-build, JD, notes), and
 * a footer whose primary is Tailor CV. The apply action crosses back out to
 * the portal — and it carries the shared dead-link capture, same as live.
 *
 * `scopeClassName="db"` re-introduces the dashboard CSS scope through the body
 * portal so DetailBody's `--db-*` tokens (and the footer's .db-* classes)
 * resolve — without it the panel paints transparent over the feed.
 */
export function DashboardJobDrawer({
  item,
  allItems,
  token,
  cartSkillNames,
  prioritized,
  canDismiss = true,
  onClose,
  onPriorityToggle,
  onSkip,
  onSkillToggle,
  onJump,
}: {
  item: FeedItem
  allItems: FeedItem[]
  token: string
  cartSkillNames: Set<string>
  prioritized: boolean
  canDismiss?: boolean
  onClose: () => void
  onPriorityToggle: (prioritized: boolean) => void
  onSkip: () => void
  onSkillToggle: (s: SkillGapItem) => void
  onJump: (jobId: string) => void
}) {
  const job = item.job
  return (
    <DetailDrawer
      open
      onClose={onClose}
      scopeClassName="db"
      ariaLabel={`${item.role} details`}
      header={
        <DetailHeader
          title={job.title}
          company={job.company}
          location={<LocationLine job={job} />}
          onClose={onClose}
        />
      }
      footer={
        <div className="db-drawer-foot">
          <PriorityJobActions
            token={token}
            jobId={item.jobId}
            job={job}
            prioritized={prioritized}
            canDismiss={canDismiss}
            onPriorityToggle={onPriorityToggle}
            onSkip={() => {
              onSkip()
              onClose()
            }}
            onFindSimilar={() => {
              onSkip()
              onClose()
            }}
            tailorHref={`/cv?jobId=${encodeURIComponent(item.jobId)}`}
          />
        </div>
      }
    >
      <DetailBody
        job={job}
        token={token}
        active
        cartSkillNames={cartSkillNames}
        otherRoles={otherRolesFor(allItems, item)}
        onSkillToggle={onSkillToggle}
        onJump={onJump}
      />
    </DetailDrawer>
  )
}
