"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useViewport } from "@/mobile"
import type { JobFeedItem, PersonalReasonCode } from "@/lib/api"
import { PERSONAL_REASONS, sendPersonalFeedback } from "@/lib/jobs/feedback"
import { JobCard } from "./job-card"
import { JobDetailDrawer } from "./job-detail-drawer"
import { MobileFeed } from "./mobile-feed"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { FeedControls, FilterChips, FiltersSheet } from "./feed-filters"
import { useJobFeed } from "./use-job-feed"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useMarketIntel } from "@/lib/hooks/use-market-intel"
import { MarketRail } from "./market-rail"
import { StoryCard, type FeedStory } from "./story-card"
import { interleaveStories } from "./feed-rows"
import { DEFAULT_FILTERS, pickDefaultSort, type FeedFilters } from "./feed-types"
import "./market.css"
import "./market-intel.css"

export interface MarketJobsTabProps {
  token: string
  hasCv: boolean
  /** True once the profile query has resolved — gates the cold-start nudge so
   *  it never flashes while CV state is still `undefined` (the #18 bug-class). */
  cvResolved?: boolean
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
    token, hasCv, cvResolved = false, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    targetLocations, followedNames, onToggleFollow,
  } = props
  const router = useRouter()
  const { isDesktop } = useViewport()
  const hasTargetRoles = targetRoles.length > 0

  const [searchInput, setSearchInput] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
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

  // Market-intel signals → the rail + the two interleaved story cards.
  const intel = useMarketIntel(token, targetLocations)
  const stories = useMemo<FeedStory[]>(() => {
    const out: FeedStory[] = []
    const topSkill = intel.movers.find(m => m.needsUpgrade) ?? intel.movers[0]
    if (hasCv && topSkill) {
      out.push({ kind: "skill", skill: topSkill.skill, display: topSkill.display, jobCount: topSkill.jobCount, level: topSkill.level, needsUpgrade: topSkill.needsUpgrade })
    }
    const topCo = intel.trending[0]
    if (topCo) {
      out.push({ kind: "company", company: topCo.name, openCount: topCo.openCount, location: targetLocations.find(l => l && l.trim())?.trim() ?? null, followed: followedNames.includes(topCo.name) })
    }
    return out
  }, [intel.movers, intel.trending, hasCv, followedNames, targetLocations])

  const rows = useMemo(() => interleaveStories(allJobs, stories), [allJobs, stories])

  const onSeeRoles = useCallback((query: string) => { setSearchInput(query); setQ(query) }, [])
  const onStoryPrimary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") router.push(`/forge?skill=${encodeURIComponent(s.skill)}`)
    else onSeeRoles(s.company)
  }, [router, onSeeRoles])
  const onStorySecondary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") onSeeRoles(s.display)
    else if (s.company) onToggleFollow(s.company)
  }, [onSeeRoles, onToggleFollow])

  const showCvNudge = cvResolved && !hasCv

  const onSave = (j: JobFeedItem) => triage(j, "saved")
  const onSkip = (j: JobFeedItem) => triage(j, "skipped")

  const railProps = {
    token, targetLocations, total, feed: allJobs, pulses,
    onSeeRoles, onOpenJob: setOpenJob,
  }

  return (
    <div className="tm-market-layout">
      <main className="tm-market-main">
        {/* One compact control bar (market-feed redesign 2026-06-18): search is
            an ICON that expands on tap (triage is browse-first, not query-first),
            then the rank toggle + Filters door. The old full-width search input,
            the demand-movers chip strip, and the separate filter row collapsed
            into this — the demand movers now interleave as StoryCards in the
            scroll, not a band the user scrolls past. */}
        <div className="tm-feed-bar">
          {searchOpen ? (
            <>
              <input
                autoFocus
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search roles, companies, skills…"
                aria-label="Search jobs"
                className="tm-feed-search"
              />
              <button
                type="button"
                className="tm-feed-iconbtn"
                aria-label="Close search"
                onClick={() => { setSearchInput(""); setSearchOpen(false) }}
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="tm-feed-iconbtn"
                aria-label="Search jobs"
                onClick={() => setSearchOpen(true)}
              >
                <span aria-hidden>🔍</span>
              </button>
              <FeedControls
                filters={filters}
                onChange={onChangeFilters}
                hasCv={hasCv}
                hasTargetRoles={hasTargetRoles}
                savedCount={savedCount}
                onOpenSaved={() => router.push("/home")}
                onOpenFilters={() => setFiltersOpen(true)}
              />
            </>
          )}
        </div>

        {/* cold-start: only once CV state is RESOLVED absent — never on load */}
        {showCvNudge ? (
          <div className="mi-nudge" style={{ marginTop: 14 }}>
            <span aria-hidden style={{ fontSize: 20 }}>↑</span>
            <div className="mi-nudge-t">
              <b>Upload your CV to personalize</b>
              <span>See your fit, matched skills, and the roles that want you.</span>
            </div>
            <a href="/cv" className="mi-nudge-go">Upload CV →</a>
          </div>
        ) : null}

        <div style={{ marginTop: 8 }}>
          {feed.isLoading ? (
            <FeedSkeleton />
          ) : allJobs.length === 0 ? (
            <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/home")} onClear={() => onChangeFilters({ ...DEFAULT_FILTERS })} />
          ) : (
            <>
              {/* One merged chip row (market-feed redesign 2026-06-18): count +
                  location scope, then the ACTIVE role-cluster and any active hard
                  filters as removable chips. Raw counts dropped; the standalone
                  "adjust" link is gone — the Filters door above is the only door,
                  and switching to a *different* cluster happens inside it. */}
              <div className="tm-feed-summary">
                <span className="tm-feed-summary-count">{total.toLocaleString()} role{total === 1 ? "" : "s"}</span>
                <LocationScopePill locations={targetLocations} />
                {filters.roleDomain ? (
                  <button
                    type="button"
                    className="tm-feed-activechip"
                    onClick={() => onChangeFilters({ ...filters, roleDomain: null })}
                    aria-label={`Remove role: ${filters.roleDomain}`}
                  >
                    {filters.roleDomain} <span aria-hidden>✕</span>
                  </button>
                ) : null}
                <FilterChips filters={filters} onChange={onChangeFilters} />
              </div>
              {isDesktop ? (
                <VirtualFeed
                  items={rows}
                  getKey={row => (row.t === "job" ? row.job.job_id : row.id)}
                  estimateSize={180}
                  gap={14}
                  renderItem={row =>
                    row.t === "story" ? (
                      <StoryCard story={row.story} onPrimary={() => onStoryPrimary(row.story)} onSecondary={() => onStorySecondary(row.story)} />
                    ) : (
                      <JobCard job={row.job} pulse={pulses.get(row.job.job_id)} hasCv={hasCv} onOpen={() => setOpenJob(row.job)} onSave={() => onSave(row.job)} onSkip={() => onSkip(row.job)} />
                    )
                  }
                />
              ) : (
                <MobileFeed rows={rows} pulses={pulses} hasCv={hasCv} onOpen={setOpenJob} onSave={onSave} onSkip={onSkip} onStoryPrimary={onStoryPrimary} onStorySecondary={onStorySecondary} />
              )}
              <div ref={sentinelRef} style={{ height: 1 }} />
              {feed.isFetchingNextPage ? <FeedSkeleton rows={2} /> : null}
              {!feed.hasNextPage ? <div style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--tm-text-faint)" }}>— end of feed —</div> : null}
            </>
          )}
        </div>
      </main>

      {/* desktop-only: the market intel rail */}
      <MarketRail {...railProps} />

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
