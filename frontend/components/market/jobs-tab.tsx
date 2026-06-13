"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useViewport } from "@/mobile"
import type { JobFeedItem, PersonalReasonCode } from "@/lib/api"
import { PERSONAL_REASONS, sendPersonalFeedback } from "@/lib/jobs/feedback"
import { JobCard } from "./job-card"
import { JobDetailDrawer } from "./job-detail-drawer"
import { MobileFeed } from "./mobile-feed"
import { FeedControls, FilterChips, FiltersSheet } from "./feed-filters"
import { useJobFeed } from "./use-job-feed"
import { usePulses } from "@/lib/hooks/use-pulses"
import { DEFAULT_FILTERS, pickDefaultSort, type FeedFilters } from "./feed-types"
import "./market.css"

export interface MarketJobsTabProps {
  token: string
  hasCv: boolean
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null         // shared with the page's analytics/heatmap
  onSelectCluster: (cluster: string | null) => void
  targetLocations: string[]
  followedNames: string[]
  onToggleFollow: (name: string) => void
  canFollow: (name: string) => boolean
  disabledReason: (name: string) => string | undefined
}

export function MarketJobsTab(props: MarketJobsTabProps) {
  const {
    token, hasCv, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    targetLocations, followedNames, onToggleFollow,
  } = props
  const router = useRouter()
  const { isDesktop } = useViewport()
  const hasTargetRoles = targetRoles.length > 0

  const [searchInput, setSearchInput] = useState("")
  const [q, setQ] = useState("")
  // roleDomain is sourced from the page's selectedCluster; the rest is local.
  // Rank defaults to "Best fit" when the user has signal (CV or roles), else
  // "Newest" — set once on mount so the initial deck lands honestly ranked.
  const [local, setLocal] = useState<Omit<FeedFilters, "roleDomain">>({
    sort: pickDefaultSort(hasCv, hasTargetRoles),
    minSkillMatches: 0,
    targetRoleOnly: false,
    freshnessDays: 0,
    followingOnly: false,
  })
  const [openJob, setOpenJob] = useState<JobFeedItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQ(searchInput.trim()), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const filters: FeedFilters = useMemo(() => ({ ...local, roleDomain: selectedCluster }), [local, selectedCluster])

  const onChangeFilters = useCallback((f: FeedFilters) => {
    if (f.roleDomain !== selectedCluster) onSelectCluster(f.roleDomain)
    setLocal({
      sort: f.sort, minSkillMatches: f.minSkillMatches, targetRoleOnly: f.targetRoleOnly,
      freshnessDays: f.freshnessDays, followingOnly: f.followingOnly,
    })
  }, [selectedCluster, onSelectCluster])

  const { feed, allJobs, total, triage, undo, pending, savedCount } =
    useJobFeed({ token, filters, q })

  // One batched pulse request for the visible feed (not one-per-card).
  const pulses = usePulses(token, allJobs.map(j => j.job_id))

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage()
    }, { rootMargin: "600px" })
    obs.observe(el)
    return () => obs.disconnect()
  }, [feed])

  const onSave = (j: JobFeedItem) => triage(j, "saved")
  const onSkip = (j: JobFeedItem) => triage(j, "skipped")

  return (
    <div>
      {/* Search leads; everything else is one control row. */}
      <div className="tm-feed-searchrow" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search roles, companies, skills…"
          aria-label="Search jobs"
          style={{ flex: "1 1 260px", minWidth: 0, minHeight: 44, padding: "0 16px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "var(--tm-surface)", color: "var(--tm-text)", fontSize: 16, outline: "none" }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <FeedControls
          filters={filters}
          onChange={onChangeFilters}
          hasCv={hasCv}
          hasTargetRoles={hasTargetRoles}
          savedCount={savedCount}
          onOpenSaved={() => router.push("/home")}
          onOpenFilters={() => setFiltersOpen(true)}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        {feed.isLoading ? (
          <FeedSkeleton />
        ) : allJobs.length === 0 ? (
          <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/home")} onClear={() => onChangeFilters({ ...DEFAULT_FILTERS })} />
        ) : (
          <>
            <div className="tm-feed-summary">
              <span className="tm-feed-summary-count">{total.toLocaleString()} role{total === 1 ? "" : "s"}</span>
              <LocationScopePill locations={targetLocations} />
              <FilterChips filters={filters} onChange={onChangeFilters} />
              <button type="button" onClick={() => setFiltersOpen(true)} className="tm-feed-summary-adjust">adjust</button>
            </div>
            {isDesktop ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {allJobs.map(job => (
                  <JobCard key={job.job_id} job={job} pulse={pulses.get(job.job_id)} hasCv={hasCv} onOpen={() => setOpenJob(job)} onSave={() => onSave(job)} onSkip={() => onSkip(job)} />
                ))}
              </div>
            ) : (
              <MobileFeed jobs={allJobs} pulses={pulses} hasCv={hasCv} onOpen={setOpenJob} onSave={onSave} onSkip={onSkip} />
            )}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {feed.isFetchingNextPage ? <FeedSkeleton rows={2} /> : null}
            {!feed.hasNextPage ? <div style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--tm-text-faint)" }}>— end of feed —</div> : null}
          </>
        )}
      </div>

      {openJob ? (
        <JobDetailDrawer
          job={openJob}
          pulse={pulses.get(openJob.job_id)}
          token={token}
          onClose={() => setOpenJob(null)}
          followed={openJob.company_name ? followedNames.includes(openJob.company_name) : false}
          onToggleFollow={() => openJob.company_name && onToggleFollow(openJob.company_name)}
          onSave={() => { onSave(openJob); setOpenJob(null) }}
        />
      ) : null}

      {filtersOpen ? (
        <FiltersSheet
          filters={filters}
          onChange={onChangeFilters}
          onClose={() => setFiltersOpen(false)}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={hasCv}
        />
      ) : null}

      {pending ? <UndoToast kind={pending.kind} jobId={pending.jobId} token={token} onUndo={undo} /> : null}
    </div>
  )
}

// Read-only geo scope — fixed from settings, tap opens Settings → Following.
function LocationScopePill({ locations }: { locations: string[] }) {
  const clean = locations.filter(l => l && l.trim())
  const label = clean.length === 0 ? "All locations" : clean.length === 1 ? clean[0] : `${clean[0]} +${clean.length - 1}`
  return (
    <button
      type="button"
      onClick={() => document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))}
      aria-label={clean.length === 0 ? "Set your target locations in settings" : `Target locations: ${clean.join(", ")}. Change in settings`}
      title={clean.length > 1 ? clean.join(", ") : undefined}
      className="tm-feed-summary-loc"
    >
      <span aria-hidden>📍</span> {label}
    </button>
  )
}

function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 132, borderRadius: "var(--tm-radius-lg)", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  )
}

/** Loop-closing empty state: route the user's saved roles into Dashboard. */
function EmptyHandoff({ savedCount, onBuild, onClear }: { savedCount: number; onBuild: () => void; onClear: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ fontSize: 15, color: "var(--tm-text)", fontWeight: 600 }}>You&rsquo;ve triaged everything here</div>
      {savedCount > 0 ? (
        <>
          <div style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>You saved {savedCount} role{savedCount === 1 ? "" : "s"}. Build a CV for each next.</div>
          <button type="button" onClick={onBuild} className="tm-filters-apply">Build CVs →</button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>Fresh roles land daily — check back, or loosen your filters.</div>
      )}
      <button type="button" onClick={onClear} style={{ background: "none", border: "none", color: "var(--tm-interactive)", cursor: "pointer", fontSize: 13 }}>Clear filters</button>
    </div>
  )
}

function UndoToast({
  kind, jobId, token, onUndo,
}: {
  kind: "saved" | "skipped"
  jobId: string
  token: string
  onUndo: () => void
}) {
  const [reason, setReason] = useState<PersonalReasonCode | null>(null)
  return (
    <div className="tm-feed-toast" role="status">
      <div className="tm-feed-toast-head">
        <span>{kind === "saved" ? "★ Saved" : "Skipped"}</span>
        <button type="button" onClick={onUndo}>Undo</button>
      </div>
      {/* Optional personal "why" — trains only this user's ranking, never the
          global listing trust. Skipping it keeps the loop fast. */}
      {kind === "skipped" ? (
        reason ? (
          <span className="tm-feed-toast-noted">Noted ✓</span>
        ) : (
          <div className="tm-feed-toast-reasons">
            {PERSONAL_REASONS.map(r => (
              <button
                key={r.code}
                type="button"
                className="tm-reason-chip"
                onClick={() => { sendPersonalFeedback(token, jobId, r.code, "market"); setReason(r.code) }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
