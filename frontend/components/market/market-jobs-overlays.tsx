"use client"

import type { CareerBand, JobFeedItem, JobPulse } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import type { FeedFilters } from "./feed-types"
import type { PendingUndo } from "./use-job-feed"
import { JobDetailDrawer } from "./job-detail-drawer"
import { FiltersSheet } from "./feed-filters"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"

export function MarketJobsOverlays({
  openJob,
  pulses,
  token,
  onCloseJob,
  onSaveOpenJob,
  filtersOpen,
  filters,
  onChangeFilters,
  onCloseFilters,
  targetRoles,
  chipCountMap,
  hasCv,
  scope,
  exploredCareerBands,
  onExploredCareerBandsChange,
  pending,
  undo,
  savedCount,
}: {
  openJob: JobFeedItem | null
  pulses: Map<string, JobPulse>
  token: string
  onCloseJob: () => void
  onSaveOpenJob: () => void
  filtersOpen: boolean
  filters: FeedFilters
  onChangeFilters: (f: FeedFilters) => void
  onCloseFilters: () => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
  scope: FeedScope
  exploredCareerBands?: CareerBand[]
  onExploredCareerBandsChange?: (bands: CareerBand[]) => void
  pending: PendingUndo | null
  undo: () => void
  savedCount: number
}) {
  return (
    <>
      {openJob ? (
        <JobDetailDrawer
          job={openJob}
          pulse={pulses.get(openJob.job_id)}
          token={token}
          onClose={onCloseJob}
          onSave={onSaveOpenJob}
        />
      ) : null}

      {filtersOpen ? (
        <FiltersSheet
          filters={filters}
          onChange={onChangeFilters}
          onClose={onCloseFilters}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={hasCv}
          scope={scope}
          onEditLocations={() => document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))}
          exploredCareerBands={exploredCareerBands}
          onExploredCareerBandsChange={onExploredCareerBandsChange}
        />
      ) : null}

      {pending ? (
        <NotInterestedUndo
          kind={pending.kind}
          jobId={pending.jobId}
          token={token}
          onUndo={undo}
          queuePosition={pending.kind === "saved" ? savedCount : undefined}
        />
      ) : null}
    </>
  )
}
