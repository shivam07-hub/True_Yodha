"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
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
  triageFeed,
  type Segment,
  type SortKey,
  type TriageContext,
} from "@/lib/dashboard/feed-model"
import { users as usersApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
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
  { key: "all", label: "All" },
  { key: "myro", label: "Myro found" },
  { key: "liked", label: "Saved" },
]

export function Dashboard(props: DashboardProps) {
  const { isDesktop } = useViewport()
  // Default to "All" so a job the user added themselves (extension/manual) is
  // never hidden behind the "Myro found" matches-only tab (journey Entry 6a).
  const [segment, setSegment] = React.useState<Segment>("all")
  const [sort, setSort] = React.useState<SortKey>("prize")
  const [openId, setOpenId] = React.useState<string | null>(props.initialJobId ?? null)
  const addJob = useManualAdd({
    token: props.token,
    onSaved: () => {
      props.onManualAdded?.()
      // Surface the just-added job — self-sourced jobs land in the Saved segment.
      setSegment("liked")
    },
  })

  const { items } = React.useMemo(
    () => buildFeed(props.jobs, props.apps, props.dismissedJobIds),
    [props.jobs, props.apps, props.dismissedJobIds],
  )

  // Prize signals — all cache hits (the rail + home already fetched these), no
  // extra network. Followed companies + target roles define "prize"; the apps
  // list tells us what's tailored (cv_badge) vs committed (applied+).
  const { data: followed } = useQuery({
    queryKey: ["followedCompanies", props.token],
    queryFn: () => usersApi.followedCompanies(props.token),
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => usersApi.me(props.token),
    staleTime: 10 * 60 * 1000,
  })

  const triageCtx = React.useMemo<TriageContext>(() => {
    const tailoredJobIds = new Set<string>()
    const committedJobIds = new Set<string>()
    for (const a of props.apps) {
      if (a.cv_badge) tailoredJobIds.add(a.job_id)
      if (a.status && a.status !== "saved") committedJobIds.add(a.job_id)  // applied+ = pipeline
    }
    return {
      followedCompanies: new Set((followed?.companies ?? []).map((c) => c.company_name.toLowerCase().trim())),
      targetRoles: profile?.target_roles ?? [],
      tailoredJobIds,
      committedJobIds,
    }
  }, [props.apps, followed, profile])

  // The worklist: "Finish these" (tailored, unfinished) pinned; applied dropped;
  // the rest ranked by prize × winnability (journey: "which CV do I tailor next").
  const triage = React.useMemo(() => triageFeed(items, triageCtx), [items, triageCtx])
  const queue = triage.queueItems
  const counts = React.useMemo(() => segmentCounts(queue), [queue])
  const visible = React.useMemo(
    () => sortItems(filterSegment(queue, segment), sort),
    [queue, segment, sort],
  )

  // Openable = the queue plus the pinned Continue row (both render clickable cards).
  const openable = React.useMemo(
    () => [...triage.continueItems, ...visible],
    [triage.continueItems, visible],
  )
  // Close the open card if it left the openable set (segment change / skip).
  React.useEffect(() => {
    if (openId && !openable.some((it) => it.jobId === openId)) setOpenId(null)
  }, [openable, openId])
  const openItem = openable.find((it) => it.jobId === openId) ?? null

  // Empty copy is scoped to *why* the view is empty, never a blanket
  // "No matches yet" when the feed actually holds jobs the user just isn't
  // currently filtered to (e.g. All=23 while the Myro tab is empty).
  const emptyMessage =
    items.length === 0
      ? "No matches yet — refresh after the next market batch."
      // Queue cleared but there's momentum to point at, not a dead end.
      : queue.length === 0 && triage.continueItems.length > 0
        ? "Nothing new to tailor — finish the ones you started above."
        : queue.length === 0 && triage.appliedCount > 0
          ? "You've triaged every match — refresh for new roles, or track your applications on CV & Applications."
          : segment === "myro"
            ? "No Myro picks here — switch to All to browse every match, or refresh after the next batch."
            : segment === "liked"
              ? "You haven't saved any jobs yet — tap the heart on a card, or add one from the extension."
              : "Nothing in this view."

  const isRefreshing = props.refresh.state === "charging" || props.refresh.state === "computing"
  // Genuine new-job count from /matches (jobs.first_seen newer than this user's
  // last compute). >0 is the ONLY honest "feed is stale" signal — the old
  // publication-clock / last_seen checks fired on re-crawls that added nothing.
  const newJobsCount = props.newJobsCount
  const isFeedStale = !!props.total && newJobsCount > 0

  const continueItems = triage.continueItems

  return (
    <div className="db" id="browse">
      {continueItems.length > 0 ? (
        <section className="db-continue" aria-label="Finish tailoring">
          <div className="db-continue-head">
            <span className="db-continue-title">Finish tailoring</span>
            <span className="db-continue-sub">{continueItems.length} started · one step from applying</span>
          </div>
          <div className="db-continue-row">
            {continueItems.map((it) => (
              <button
                key={it.jobId}
                type="button"
                className="db-continue-card tm-control-focus"
                onClick={() => setOpenId(it.jobId)}
              >
                <span className="db-continue-co">{it.company ?? "Untitled company"}</span>
                <span className="db-continue-role">{it.role}</span>
                <span className="db-continue-cta">Finish &amp; apply →</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
          {triage.appliedCount > 0 ? (
            <span className="db-applied-count" title="Jobs you've applied to — tracked on CV & Applications">
              {triage.appliedCount} applied
            </span>
          ) : null}
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
