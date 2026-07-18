"use client"

import * as React from "react"
import { Heart, X } from "lucide-react"
import { DetailDrawer } from "@/components/jobs/detail-drawer"
import { DetailHeader } from "@/components/jobs/detail-header"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { ApplyRow } from "@/components/jobs/apply-row"
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
  liked,
  canDismiss = true,
  applyIntentSurface = "dashboard",
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
  canDismiss?: boolean
  applyIntentSurface?: "dashboard" | "collections"
  onClose: () => void
  onLike: () => void
  onSkip: () => void
  onSkillToggle: (s: SkillGapItem) => void
  onJump: (jobId: string) => void
}) {
  const job = item.job
  const capture = useApplyCapture({
    token,
    job: {
      job_id: item.jobId,
      source_url: job.source_url,
      company: job.company,
      listing_confidence: job.is_stale || job.is_active === false ? "uncertain" : undefined,
    },
    surface: "dashboard",
    intentSurface: applyIntentSurface,
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
          <ApplyCapturePrompt capture={capture} />
          <div className="db-drawer-foot-row">
            {canDismiss ? (
              <>
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
              </>
            ) : null}
            <a className="db-btn db-btn-primary" href={`/cv?jobId=${item.jobId}`}>
              Tailor CV
            </a>
          </div>
          {capture.target.kind === "direct" ? (
            <a
              className="db-drawer-apply"
              href={capture.href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={capture.onApply}
            >
              {capture.target.actionLabel} ↗
            </a>
          ) : (
            <ApplyRow company={job.company} title={job.title} jobId={item.jobId} variant="compact" onApply={capture.onApply} />
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
