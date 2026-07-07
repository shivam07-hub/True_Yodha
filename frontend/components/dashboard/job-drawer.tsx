"use client"

import * as React from "react"
import { Heart, X } from "lucide-react"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useDeadLinkPrompt } from "@/components/jobs/use-dead-link-prompt"
import { ApplyRow } from "@/components/jobs/apply-row"
import { DetailBody } from "./detail-body"
import { LocationLine } from "./lenses"
import { otherRolesFor } from "./desktop-grid"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { SkillGapItem } from "@/lib/api"

/**
 * Dashboard job detail (build stage). Same drawer shell + header as live, a
 * build-focused body (DetailBody: why-you-fit, skills-to-build, JD, notes), and
 * a footer whose primary is Tailor CV. "Apply ↗" is the cross-link back out to
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
  liked,
  onClose,
  onLike,
  onSkip,
  onSkillToggle,
  onJump,
}: {
  item: FeedItem
  allItems: FeedItem[]
  token: string
  cartSkillNames: Set<string>
  liked: boolean
  onClose: () => void
  onLike: () => void
  onSkip: () => void
  onSkillToggle: (s: SkillGapItem) => void
  onJump: (jobId: string) => void
}) {
  const job = item.job
  const dead = useDeadLinkPrompt({
    token,
    jobId: item.jobId,
    surface: "dashboard",
    // "Find similar" dismisses the confirmed ghost and returns to the fit-ranked
    // feed — the dead listing gone, the next-best roles in view. (Dismiss can't
    // fire on the answer itself: it unmounts the drawer before recovery shows.)
    onFindSimilar: () => {
      onSkip()
      onClose()
    },
  })

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
          {dead.prompt}
          <div className="db-drawer-foot-row">
            <button
              type="button"
              className={`db-icon-btn${liked ? " liked" : ""}`}
              aria-label={liked ? "Unlike" : "Like"}
              onClick={onLike}
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} aria-hidden />
            </button>
            <button
              type="button"
              className="db-icon-btn"
              aria-label="Not interested"
              onClick={() => {
                onSkip()
                onClose()
              }}
            >
              <X size={18} aria-hidden />
            </button>
            <a className="db-btn db-btn-primary" href={`/cv?jobId=${item.jobId}`}>
              Tailor CV
            </a>
          </div>
          {job.source_url ? (
            <a
              className="db-drawer-apply"
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dead.markApplied}
            >
              Apply ↗
            </a>
          ) : (
            <ApplyRow company={job.company} title={job.title} jobId={item.jobId} variant="compact" onApply={dead.markApplied} />
          )}
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
