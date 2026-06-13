"use client"

import * as React from "react"
import "./dashboard.css"
import { useViewport } from "@/mobile"
import { RefreshMatchesButton } from "@/components/jobs/RefreshMatchesButton"
import { openRefreshGate } from "@/store/refreshGateStore"
import { Button } from "@/components/ui/button"
import { MobileFeed } from "./mobile-feed"
import { DesktopGrid } from "./desktop-grid"
import { ManualAddModal } from "@/components/cv/pipeline/ManualAddModal"
import {
  buildFeed,
  filterSegment,
  segmentCounts,
  type Segment,
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
  feedUpdatedAt: string | null
  matchesComputedAt: string | null
  /** True when the Feed State publication clock is ahead of these matches. */
  feedAhead?: boolean
  initialJobId?: string | null
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
  const [manualOpen, setManualOpen] = React.useState(false)

  const { items } = React.useMemo(
    () => buildFeed(props.jobs, props.apps, props.dismissedJobIds),
    [props.jobs, props.apps, props.dismissedJobIds],
  )
  const counts = React.useMemo(() => segmentCounts(items), [items])
  const visible = React.useMemo(() => filterSegment(items, segment), [items, segment])

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
  // The Feed State publication clock (props.feedAhead) is the canonical signal;
  // feed_updated_at is the legacy fallback for when feed-state hasn't hydrated.
  const isFeedStale =
    !!props.total &&
    (
      !!props.feedAhead ||
      (
        !!props.feedUpdatedAt &&
        !!props.matchesComputedAt &&
        new Date(props.feedUpdatedAt) > new Date(props.matchesComputedAt)
      )
    )

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
          <button
            type="button"
            className="db-btn db-btn-secondary tm-control-focus"
            onClick={() => setManualOpen(true)}
          >
            + Add a job
          </button>
          <RefreshMatchesButton vm={props.refresh} disabled={!props.token} />
        </div>
      </div>

      {isFeedStale && !isRefreshing ? (
        <div className="db-stale">
          <span>New jobs added since your last match — results may be outdated.</span>
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
        <DesktopGrid
          items={visible}
          allItems={items}
          appsByJobId={props.appsByJobId}
          token={props.token}
          cartSkillNames={props.cartSkillNames}
          initialJobId={props.initialJobId}
          onStatus={props.onStatus}
          onRemove={props.onRemove}
          onSkillToggle={props.onSkillToggle}
        />
      ) : (
        <MobileFeed
          items={visible}
          allItems={items}
          appsByJobId={props.appsByJobId}
          token={props.token}
          cartSkillNames={props.cartSkillNames}
          initialJobId={props.initialJobId}
          hasMore={visible.some((r) => r.isMatch)}
          onStatus={props.onStatus}
          onRemove={props.onRemove}
          onSkillToggle={props.onSkillToggle}
          onRefresh={openRefreshGate}
        />
      )}

      {manualOpen && (
        <ManualAddModal
          token={props.token}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            setManualOpen(false)
            props.onManualAdded?.()
            // Surface the just-added job — self-sourced jobs land in Liked.
            setSegment("liked")
          }}
        />
      )}
    </div>
  )
}
