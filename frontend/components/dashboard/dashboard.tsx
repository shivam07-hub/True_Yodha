"use client"

import * as React from "react"
import "./dashboard.css"
import { useViewport } from "@/mobile"
import { openRefreshGate } from "@/store/refreshGateStore"
import { Button } from "@/components/ui/button"
import { MobileFeed } from "./mobile-feed"
import { DesktopGrid } from "./desktop-grid"
import { DashboardJobDrawer } from "./job-drawer"
import { SortMenu } from "./sort-menu"
import type { LoopStep } from "@/components/mission-control/loop-ring"
import { useManualAdd, ADD_JOB_LABEL } from "@/components/cv/pipeline/useManualAdd"
import {
  buildFeed,
  filterSegment,
  segmentCounts,
  sortItems,
  type Segment,
  type SortKey,
} from "@/lib/dashboard/feed-model"
import type {
  ApplicationResponse,
  ApplicationStatus,
  JobMatch,
  SkillGapItem,
} from "@/lib/api"
import type { UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

export interface DashboardProps {
  jobs: JobMatch[]
  apps: ApplicationResponse[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  refresh: UseJobRefreshResult
  dismissedJobIds: Set<string>
  total: number
  /** Genuinely-new live jobs inserted (first_seen) since this user last matched.
   *  The only honest staleness signal — see /jobs/matches. >0 ⇒ offer a refresh. */
  newJobsCount: number
  initialJobId?: string | null
  /** Daily-loop steps — feed the peek panel's "Today's missions" surface. */
  steps?: LoopStep[]
  onStatus: (jobId: string, status: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onSkillToggle: (skill: SkillGapItem) => void
  /** Refetch applications after a self-sourced job is added so it joins the feed. */
  onManualAdded?: () => void
}

const SEGMENTS: ReadonlyArray<{ key: Segment; label: string }> = [
  { key: "myro", label: "Myro found" },
  { key: "liked", label: "Liked" },
  { key: "all", label: "All" },
]

export function Dashboard(props: DashboardProps) {
  const { isDesktop } = useViewport()
  const [segment, setSegment] = React.useState<Segment>("myro")
  const [sort, setSort] = React.useState<SortKey>("fit")
  const [openId, setOpenId] = React.useState<string | null>(props.initialJobId ?? null)
  const addJob = useManualAdd({
    token: props.token,
    onSaved: () => {
      props.onManualAdded?.()
      // Surface the just-added job — self-sourced jobs land in Liked.
      setSegment("liked")
    },
  })

  const { items } = React.useMemo(
    () => buildFeed(props.jobs, props.apps, props.dismissedJobIds),
    [props.jobs, props.apps, props.dismissedJobIds],
  )
  const counts = React.useMemo(() => segmentCounts(items), [items])
  const visible = React.useMemo(
    () => sortItems(filterSegment(items, segment), sort),
    [items, segment, sort],
  )

  // Close the open card if it left the visible set (segment change / skip).
  React.useEffect(() => {
    if (openId && !visible.some((it) => it.jobId === openId)) setOpenId(null)
  }, [visible, openId])
  const openItem = visible.find((it) => it.jobId === openId) ?? null

  // Empty copy is scoped to *why* the view is empty, never a blanket
  // "No matches yet" when the feed actually holds jobs the user just isn't
  // currently filtered to (e.g. All=23 while the Myro tab is empty).
  const emptyMessage =
    items.length === 0
      ? "No matches yet — refresh after the next market batch."
      : segment === "myro"
        ? "No Myro picks in this batch yet — switch to All to browse every match, or refresh after the next batch."
        : segment === "liked"
          ? "You haven't liked any matches yet — tap the heart on a card to save it here."
          : "Nothing in this view."

  const isRefreshing = props.refresh.state === "charging" || props.refresh.state === "computing"
  // Genuine new-job count from /matches (jobs.first_seen newer than this user's
  // last compute). >0 is the ONLY honest "feed is stale" signal — the old
  // publication-clock / last_seen checks fired on re-crawls that added nothing.
  const newJobsCount = props.newJobsCount
  const isFeedStale = !!props.total && newJobsCount > 0

  return (
    <div className="db" id="browse">
      <div className="db-head">
        <div className="db-segments" role="tablist" aria-label="Filter matches">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={segment === s.key}
              disabled={counts[s.key] === 0 && s.key !== "myro"}
              className={`db-seg tm-control-focus${segment === s.key ? " active" : ""}`}
              onClick={() => setSegment(s.key)}
            >
              {s.label}
              <span className="db-seg-count">{counts[s.key]}</span>
            </button>
          ))}
        </div>
        <div className="db-head-actions">
          <SortMenu sort={sort} onChange={setSort} mobile={!isDesktop} />
          <button
            type="button"
            className="db-btn db-btn-secondary tm-control-focus"
            onClick={addJob.open}
          >
            + {ADD_JOB_LABEL}
          </button>
        </div>
      </div>

      {isFeedStale && !isRefreshing ? (
        <div className="db-stale">
          <span>
            {newJobsCount} new {newJobsCount === 1 ? "job" : "jobs"} since your last match — results may be outdated.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={openRefreshGate}
            className="shrink-0 !text-[var(--tm-warning)] !border-[var(--tm-warning)] hover:!bg-[var(--tm-warning-wash)]"
          >
            Refresh now
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="db-empty">{emptyMessage}</div>
      ) : isDesktop ? (
        // Dashboard is the match feed, full width. The job detail opens from the
        // right in the shared drawer on click (rendered below) — same direction
        // as the /market page. No persistent context column (the greeting hero +
        // surfaces relocated to /market; see home/page.tsx).
        <DesktopGrid
          items={visible}
          allItems={items}
          appsByJobId={props.appsByJobId}
          token={props.token}
          cartSkillNames={props.cartSkillNames}
          openId={openId}
          onOpenJob={setOpenId}
          onStatus={props.onStatus}
          onRemove={props.onRemove}
          onSkillToggle={props.onSkillToggle}
        />
      ) : (
        <MobileFeed
          items={visible}
          appsByJobId={props.appsByJobId}
          token={props.token}
          hasMore={visible.some((r) => r.isMatch)}
          onOpenJob={setOpenId}
          onStatus={props.onStatus}
          onRemove={props.onRemove}
          onRefresh={openRefreshGate}
        />
      )}

      {/* Shared job-detail drawer — slides in from the right on every width
          (desktop + mobile), matching the /market page interaction. */}
      {openItem ? (
        <DashboardJobDrawer
          item={openItem}
          allItems={items}
          token={props.token}
          cartSkillNames={props.cartSkillNames}
          liked={openItem.isLiked}
          onClose={() => setOpenId(null)}
          onLike={() => (openItem.isLiked ? props.onRemove(openItem.jobId) : props.onStatus(openItem.jobId, "saved"))}
          onSkip={() => props.onRemove(openItem.jobId)}
          onSkillToggle={props.onSkillToggle}
          onJump={(jobId) => setOpenId(jobId)}
        />
      ) : null}

      {addJob.modal}
    </div>
  )
}
