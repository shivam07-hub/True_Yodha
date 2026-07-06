"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useViewport } from "@/mobile"
import type { JobFeedItem } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { IntentChat } from "@/components/jobs/intent-chat"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"
import { JobCard } from "./job-card"
import { JobDetailDrawer } from "./job-detail-drawer"
import { MobileFeed } from "./mobile-feed"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { FeedControls, FilterChips, FiltersSheet } from "./feed-filters"
import { EmptyHandoff, FeedSkeleton, LocationScopePill } from "./jobs-tab-helpers"
import { useJobFeed } from "./use-job-feed"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useMarketIntel } from "@/lib/hooks/use-market-intel"
import { MarketRail } from "./market-rail"
import { StoryCard, type FeedStory } from "./story-card"
import { interleaveStories } from "./feed-rows"
import { HiddenJobsDialog } from "./hidden-jobs-dialog"
import { DEFAULT_FILTERS, pickDefaultSort, type FeedFilters } from "./feed-types"
import { Search, X } from "lucide-react"
import "./market.css"
import "./market-intel.css"

export interface MarketJobsTabProps {
  token: string
  hasCv: boolean
  cvResolved?: boolean
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null         // shared with the page's analytics/heatmap
  onSelectCluster: (cluster: string | null) => void
  initialSkillFacet?: string | null
  targetLocations: string[]
  followedNames: string[]
  onToggleFollow: (name: string) => void
  canFollow: (name: string) => boolean
  disabledReason: (name: string) => string | undefined
}

export function MarketJobsTab(props: MarketJobsTabProps) {
  const {
    token, hasCv, cvResolved = false, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    targetLocations, followedNames, onToggleFollow, initialSkillFacet,
  } = props
  const router = useRouter()
  const { isDesktop } = useViewport()
  const hasTargetRoles = targetRoles.length > 0

  const [searchInput, setSearchInput] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState("")
  const [skillFacet, setSkillFacet] = useState<string | null>(initialSkillFacet ?? null)
  const [local, setLocal] = useState<Omit<FeedFilters, "roleDomain">>({
    sort: pickDefaultSort(hasCv, hasTargetRoles),
    minSkillMatches: 0,
    followingOnly: false,
  })
  const [openJob, setOpenJob] = useState<JobFeedItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQ(searchInput.trim()), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    if (initialSkillFacet) {
      setSkillFacet(initialSkillFacet)
      setSearchInput("")
      setQ("")
    }
  }, [initialSkillFacet])

  const filters: FeedFilters = useMemo(() => ({ ...local, roleDomain: selectedCluster }), [local, selectedCluster])

  const onChangeFilters = useCallback((f: FeedFilters) => {
    if (f.roleDomain !== selectedCluster) onSelectCluster(f.roleDomain)
    setLocal({
      sort: f.sort, minSkillMatches: f.minSkillMatches, followingOnly: f.followingOnly,
    })
  }, [selectedCluster, onSelectCluster])

  const { feed, allJobs, total, expansionDividers, triage, undo, pending, savedCount } =
    useJobFeed({ token, filters, q, skill: skillFacet, targetLocations })

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

  const intel = useMarketIntel(targetLocations)
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

  const rows = useMemo(() => interleaveStories(allJobs, stories, expansionDividers), [allJobs, stories, expansionDividers])

  const onSeeRoles = useCallback((query: string) => { setSkillFacet(null); setSearchInput(query); setQ(query) }, [])
  const onFilterSkill = useCallback((skill: string) => { setSearchInput(""); setQ(""); setSkillFacet(skill) }, [])
  const onStoryPrimary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") router.push(`/forge?skill=${encodeURIComponent(s.skill)}`)
    else onSeeRoles(s.company)
  }, [router, onSeeRoles])
  const onStorySecondary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") onFilterSkill(s.display)
    else if (s.company) onToggleFollow(s.company)
  }, [onFilterSkill, onToggleFollow])

  const showCvNudge = cvResolved && !hasCv

  const onSave = (j: JobFeedItem) => triage(j, "saved")
  const onSkip = (j: JobFeedItem) => triage(j, "skipped")

  const railProps = {
    token, targetLocations, total, feed: allJobs, pulses, cvReady: hasCv,
    onSeeRoles, onFilterSkill, onOpenJob: setOpenJob,
    loading: feed.isLoading,
  }

  return (
    <div className="tm-market-layout">
      <main className="tm-market-main">
        <div className="tm-feed-bar">
          {searchOpen ? (
            <>
              <input
                autoFocus
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search roles, companies, skills..."
                aria-label="Search jobs"
                className="tm-feed-search"
              />
              <button
                type="button"
                className="tm-feed-iconbtn"
                aria-label="Close search"
                onClick={() => { setSearchInput(""); setSearchOpen(false) }}
              >
                <X size={15} />
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
                <Search size={16} />
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
              <HiddenJobsDialog token={token} />
            </>
          )}
        </div>

        {showCvNudge ? (
          <div className="mi-nudge" style={{ marginTop: 14 }}>
            <span aria-hidden style={{ fontSize: 13, fontWeight: 800 }}>CV</span>
            <div className="mi-nudge-t">
              <b>Upload your CV to personalize</b>
              <span>See your fit, matched skills, and the roles that want you.</span>
            </div>
            <a href="/cv" className="mi-nudge-go">Upload CV</a>
          </div>
        ) : null}

        <div style={{ marginTop: 8 }}>
          {feed.isLoading ? (
            <FeedSkeleton summary />
          ) : allJobs.length === 0 ? (
            <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/home")} onClear={() => { setSkillFacet(null); setSearchInput(""); setQ(""); onChangeFilters({ ...DEFAULT_FILTERS }) }} onTellMyro={() => setIntentOpen(true)} />
          ) : (
            <>
              <div className="tm-feed-summary">
                <span className="tm-feed-summary-count">{formatCount(total)} role{total === 1 ? "" : "s"}</span>
                <LocationScopePill locations={targetLocations} onOpen={() => setFiltersOpen(true)} />
                {skillFacet ? (
                  <button
                    type="button"
                    className="tm-feed-activechip"
                    onClick={() => setSkillFacet(null)}
                    aria-label={`Remove skill: ${skillFacet}`}
                  >
                    <span className="tm-feed-chip-label" title={skillFacet}>{skillFacet}</span> <span aria-hidden>x</span>
                  </button>
                ) : null}
                {filters.roleDomain ? (
                  <button
                    type="button"
                    className="tm-feed-activechip"
                    onClick={() => onChangeFilters({ ...filters, roleDomain: null })}
                    aria-label={`Remove role: ${filters.roleDomain}`}
                  >
                    <span className="tm-feed-chip-label" title={filters.roleDomain}>{filters.roleDomain}</span> <span aria-hidden>x</span>
                  </button>
                ) : null}
                <FilterChips filters={filters} onChange={onChangeFilters} />
                {/* Persistent door — never a dead end (Delta-4). */}
                <button
                  type="button"
                  className="tm-feed-activechip"
                  onClick={() => setIntentOpen(true)}
                  style={{ marginLeft: "auto" }}
                >
                  Not it? Tell Myro →
                </button>
              </div>
              {/* Auto-nudge: catch the frustrated user when the feed runs thin. */}
              {total > 0 && total < 5 ? (
                <button
                  type="button"
                  onClick={() => setIntentOpen(true)}
                  style={{
                    width: "100%", marginBottom: 12, padding: "11px 14px", textAlign: "left",
                    borderRadius: 12, border: "1px solid var(--tm-int-border)", background: "var(--tm-int-bg-wash)",
                    color: "var(--tm-text)", fontSize: 13, cursor: "pointer",
                  }}
                >
                  Only a few matches here. <strong style={{ color: "var(--tm-interactive)" }}>Tell Myro what you actually want →</strong>
                </button>
              ) : null}
              {isDesktop ? (
                <VirtualFeed
                  items={rows}
                  getKey={row => (row.t === "job" ? row.job.job_id : row.id)}
                  estimateSize={180}
                  gap={14}
                  renderItem={row =>
                    row.t === "divider" ? (
                      <div className="tm-feed-expansion-divider">{row.label}</div>
                    ) : row.t === "story" ? (
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
              {!feed.hasNextPage ? <div style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--tm-text-faint)" }}>End of feed</div> : null}
            </>
          )}
        </div>
      </main>

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
          targetLocations={targetLocations}
          onEditLocations={() => document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))}
        />
      ) : null}

      {pending ? <NotInterestedUndo kind={pending.kind} jobId={pending.jobId} token={token} onUndo={undo} /> : null}

      <IntentChat open={intentOpen} onClose={() => setIntentOpen(false)} />
    </div>
  )
}
