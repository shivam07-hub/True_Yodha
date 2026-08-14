"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useViewport } from "@/mobile"
import type { CareerBand, JobFeedItem } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { IntentChat } from "@/components/jobs/intent-chat"
import { AgentPicksBand } from "@/components/jobs/agent-picks-band"
import { openRefreshGate } from "@/store/refreshGateStore"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"
import { JobCard } from "./job-card"
import { JobDetailDrawer } from "./job-detail-drawer"
import { MobileFeed } from "./mobile-feed"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { FeedControls, FilterChips, FiltersSheet } from "./feed-filters"
import { EmptyHandoff, FeedSkeleton, LocationScopePill } from "./jobs-tab-helpers"
import { useJobFeed } from "./use-job-feed"
import { useFeedWarm } from "./use-feed-warm"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useMarketIntel } from "@/lib/hooks/use-market-intel"
import { useSkillDemand } from "@/lib/hooks/use-skill-demand"
import { useFeedScope } from "@/lib/hooks/use-feed-scope"
import { MarketRail } from "./market-rail"
import { StoryCard, type FeedStory } from "./story-card"
import { interleaveStories } from "./feed-rows"
import { HiddenJobsDialog } from "./hidden-jobs-dialog"
import { DEFAULT_FILTERS, applyViewFilters, localFilters, pickDefaultSort, type FeedFilters } from "./feed-types"
import { Search, X } from "lucide-react"
import type { UseFollowCompany } from "@/lib/hooks/use-follow-company"
import "./market.css"
import "./market-intel.css"

export interface MarketJobsTabProps {
  token: string
  hasCv: boolean
  cvResolved?: boolean
  /** Onboarding finishes past CV upload — target role picked, first shortlist
   *  saved. A user can have a CV and still not be onboardingComplete; the
   *  browse nudge below is driven by this, not by hasCv alone, so a user who
   *  uploaded a CV outside the onboarding flow still gets steered to finish. */
  onboardingComplete?: boolean
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null         // shared with the page's analytics/heatmap
  onSelectCluster: (cluster: string | null) => void
  initialFilters?: FeedFilters
  initialQuery?: string
  onFiltersChange?: (filters: FeedFilters) => void
  onQueryChange?: (query: string) => void
  initialSkillFacet?: string | null
  onSkillFacetChange?: (skill: string | null) => void
  primaryCareerBand?: CareerBand | null
  exploredCareerBands?: CareerBand[]
  onExploredCareerBandsChange?: (bands: CareerBand[]) => void
  targetLocations: string[]
  followCompany: Pick<UseFollowCompany, "followedNames" | "action">
  /** Opens company signals after the preceding rail item settles. */
  analyticsEnabled?: boolean
  /** Opens skill demand after the preceding rail item settles. */
  demandEnabled?: boolean
  onFeedSettled?: () => void
  onDemandSettled?: () => void
  onAnalyticsSettled?: () => void
}

export function MarketJobsTab(props: MarketJobsTabProps) {
  const {
    token, hasCv, cvResolved = false, onboardingComplete = false, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    initialFilters, initialQuery = "", onFiltersChange, onQueryChange,
    targetLocations, followCompany, initialSkillFacet, onSkillFacetChange,
    primaryCareerBand, exploredCareerBands, onExploredCareerBandsChange,
    analyticsEnabled = true, demandEnabled = true,
    onFeedSettled, onDemandSettled, onAnalyticsSettled,
  } = props
  const router = useRouter()
  const { isDesktop } = useViewport()
  const hasTargetRoles = targetRoles.length > 0
  // Where this feed is looking. Every place-naming surface below reads it —
  // the pill, the divider, the rail, the story card, the filters sheet.
  const scope = useFeedScope(targetLocations)

  const [searchInput, setSearchInput] = useState(initialQuery)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState(initialQuery)
  const [skillFacet, setSkillFacet] = useState<string | null>(initialSkillFacet ?? null)
  const [local, setLocal] = useState<Omit<FeedFilters, "roleDomain">>(
    () => localFilters(initialFilters, pickDefaultSort(hasCv, hasTargetRoles)),
  )
  const [openJob, setOpenJob] = useState<JobFeedItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      const next = searchInput.trim()
      if (next !== q) {
        setQ(next)
        onQueryChange?.(next)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [searchInput, q, onQueryChange])

  useEffect(() => {
    const next = initialQuery.trim()
    setSearchInput(next)
    setQ(next)
  }, [initialQuery])

  useEffect(() => {
    if (initialSkillFacet) {
      setSkillFacet(initialSkillFacet)
      setSearchInput("")
      setQ("")
    }
  }, [initialSkillFacet])

  useEffect(() => {
    setLocal(localFilters(initialFilters, pickDefaultSort(hasCv, hasTargetRoles)))
  }, [initialFilters, hasCv, hasTargetRoles])

  const filters: FeedFilters = useMemo(() => ({ ...local, roleDomain: selectedCluster }), [local, selectedCluster])

  const onChangeFilters = useCallback((f: FeedFilters) => {
    if (f.roleDomain !== selectedCluster && !onFiltersChange) onSelectCluster(f.roleDomain)
    setLocal(localFilters(f, f.sort))
    onFiltersChange?.(f)
  }, [selectedCluster, onSelectCluster, onFiltersChange])

  const { feed, allJobs, visibleJobs, total, rankedCount, loading, settled, expansionDividers, triage, undo, pending, savedCount } =
    useJobFeed({ token, filters, q, skill: skillFacet, scope })
  useEffect(() => {
    if (settled) onFeedSettled?.()
  }, [settled, onFeedSettled])
  // J1: the brain warms the fit-top shortlist AFTER J0 has painted, then the feed
  // re-reads and the leading cards arrive ranked. Never on the arrival path — see
  // the "Jobs paints its J0 feed before secondary compute" contract test.
  useFeedWarm({ token, filters, q, skill: skillFacet, scope, settled })

  // The brain's picks sit at the top; a quiet divider marks where the ranked
  // shortlist ends and the deterministic browse feed begins (so the verdicts
  // stopping reads as intentional, not a glitch). Counted over the SURVIVING
  // shortlist — a view filter that hides two picks must move the divider up two,
  // not point at whatever now sits at that index.
  const picksDivider = useMemo(() => {
    if (rankedCount <= 0) return []
    const visibleRanked = applyViewFilters(allJobs.slice(0, rankedCount), filters).length
    if (visibleJobs.length <= visibleRanked) return []
    return [{
      beforeJobId: visibleJobs[visibleRanked].job_id,
      label: scope.city ? `More roles in ${scope.city}` : "More roles",
    }]
  }, [rankedCount, allJobs, visibleJobs, filters, scope])

  // Honest weak-shortlist header (Q7): when the engineer's picks are all stretches,
  // say so and point at the path — never fake a strong.
  const weakShortlist = useMemo(
    () => rankedCount > 0 && !allJobs.slice(0, rankedCount).some(j => j.verdict === "strong" || j.verdict === "worth_it"),
    [rankedCount, allJobs],
  )

  // One batched pulse request for the visible feed (not one-per-card).
  const pulses = usePulses(token, visibleJobs.map(j => j.job_id))

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

  const intel = useMarketIntel(scope.city, "roles", analyticsEnabled)
  const { skills: demandSkills } = useSkillDemand(scope.city, "30d", demandEnabled, 1)
  const stories = useMemo<FeedStory[]>(() => {
    const out: FeedStory[] = []
    const topSkill = demandSkills[0]
    if (hasCv && topSkill) {
      out.push({
        kind: "skill",
        skill: topSkill.skill,
        roles: topSkill.roles,
        companies: topSkill.companies,
        city: scope.city,
      })
    }
    const topCo = intel.trending[0]
    if (topCo) {
      out.push({ kind: "company", company: topCo.name, openCount: topCo.openCount, location: scope.city, followed: followCompany.followedNames.includes(topCo.name) })
    }
    return out
  }, [demandSkills, intel.trending, hasCv, followCompany.followedNames, scope])

  const rows = useMemo(
    () => interleaveStories(visibleJobs, stories, [...picksDivider, ...expansionDividers]),
    [visibleJobs, stories, picksDivider, expansionDividers],
  )

  const onSeeRoles = useCallback((query: string) => {
    setSkillFacet(null)
    onSkillFacetChange?.(null)
    setSearchInput(query)
    setQ(query)
    onQueryChange?.(query)
  }, [onSkillFacetChange, onQueryChange])
  const onFilterSkill = useCallback((skill: string) => {
    setSearchInput("")
    setQ("")
    onQueryChange?.("")
    setSkillFacet(skill)
    onSkillFacetChange?.(skill)
  }, [onQueryChange, onSkillFacetChange])
  const clearBrowse = useCallback(() => {
    setSkillFacet(null)
    onSkillFacetChange?.(null)
    setSearchInput("")
    setQ("")
    onQueryChange?.("")
    onChangeFilters({ ...DEFAULT_FILTERS })
  }, [onSkillFacetChange, onQueryChange, onChangeFilters])
  const onStoryPrimary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") router.push(`/practice?skill=${encodeURIComponent(s.skill)}`)
    else onSeeRoles(s.company)
  }, [router, onSeeRoles])
  const onStorySecondary = useCallback((s: FeedStory) => {
    if (s.kind === "skill") onFilterSkill(s.skill)
    else if (s.company) followCompany.action(s.company).toggle()
  }, [followCompany, onFilterSkill])

  // One nudge, one destination (/onboarding — resumes wherever the user left
  // off), regardless of which step they're stuck on. Gated on onboardingComplete
  // rather than hasCv alone: a user can have a CV and still not have picked a
  // target role or saved a first shortlist, and hasCv-only gating hid the nudge
  // for that cohort entirely.
  const showOnboardingNudge = cvResolved && !onboardingComplete

  const onSave = (j: JobFeedItem) => triage(j, "saved")
  const onSkip = (j: JobFeedItem) => triage(j, "skipped")

  const railProps = {
    token, scope, feed: allJobs, pulses, cvReady: hasCv,
    onSeeRoles, onFilterSkill, onOpenJob: setOpenJob, analyticsEnabled, demandEnabled, followCompany,
    onDemandSettled, onAnalyticsSettled,
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
                onClick={() => { setSearchInput(""); setQ(""); onQueryChange?.(""); setSearchOpen(false) }}
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
                onOpenSaved={() => router.push("/collections")}
                onOpenFilters={() => setFiltersOpen(true)}
              />
              <HiddenJobsDialog token={token} />
            </>
          )}
        </div>

        {showOnboardingNudge ? (
          <div className="mi-nudge" style={{ marginTop: 14 }}>
            <span aria-hidden style={{ fontSize: 13, fontWeight: 800 }}>CV</span>
            {hasCv ? (
              <div className="mi-nudge-t">
                <b>Finish setting up your profile</b>
                <span>Pick a target role and Myro shows your best-fit jobs first.</span>
              </div>
            ) : (
              <div className="mi-nudge-t">
                <b>Upload your CV to personalize</b>
                <span>See your fit, matched skills, and the roles that want you.</span>
              </div>
            )}
            <a href="/onboarding" className="mi-nudge-go">{hasCv ? "Continue setup" : "Upload CV"}</a>
          </div>
        ) : null}

        {/* Curated Agent Picks band — only on the default feed view (hidden while
            the user is actively searching or filtering, where fixed picks would be
            out of context). Renders nothing when the user has no picks. */}
        {!q && !skillFacet && !filters.roleDomain ? (
          <AgentPicksBand token={token} hasCv={hasCv} context="feed" />
        ) : null}

        <div style={{ marginTop: 8 }}>
          {loading ? (
            <FeedSkeleton summary />
          ) : visibleJobs.length === 0 ? (
            <EmptyHandoff savedCount={savedCount} onBuild={() => router.push("/collections")} onClear={clearBrowse} onTellMyro={() => setIntentOpen(true)} />
          ) : (
            <>
              <div className="tm-feed-summary">
                <span className="tm-feed-summary-count">{formatCount(total)} role{total === 1 ? "" : "s"}</span>
                <LocationScopePill scope={scope} onOpen={() => setFiltersOpen(true)} />
                {skillFacet ? (
                  <button
                    type="button"
                    className="tm-feed-activechip"
                    onClick={() => { setSkillFacet(null); onSkillFacetChange?.(null) }}
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
                {/* Myro Search = the paid re-vet run. Lives here — the discovery
                    surface — beside the intent door (moved off Collections). */}
                <button
                  type="button"
                  className="tm-feed-searchchip"
                  onClick={() => openRefreshGate()}
                  title="Run Myro Search"
                >
                  <Search size={13} aria-hidden />
                  Myro Search
                </button>
              </div>
              {/* Honest weak-shortlist header (Q7): the engineer found no strong
                  matches — say so and point forward, never fake a Strong. */}
              {weakShortlist ? (
                <div className="tm-feed-weak-note">
                  <strong>No strong matches yet.</strong> Here are the closest — each card shows what would move it.
                </div>
              ) : null}
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
                      <StoryCard
                        story={row.story}
                        onPrimary={() => onStoryPrimary(row.story)}
                        onSecondary={() => onStorySecondary(row.story)}
                        companyAction={row.story.kind === "company" ? followCompany.action(row.story.company) : undefined}
                      />
                    ) : (
                      <JobCard job={row.job} pulse={pulses.get(row.job.job_id)} hasCv={hasCv} onOpen={() => setOpenJob(row.job)} onSave={() => onSave(row.job)} onSkip={() => onSkip(row.job)} />
                    )
                  }
                />
              ) : (
                <MobileFeed
                  rows={rows}
                  pulses={pulses}
                  hasCv={hasCv}
                  onOpen={setOpenJob}
                  onSave={onSave}
                  onSkip={onSkip}
                  onStoryPrimary={onStoryPrimary}
                  onStorySecondary={onStorySecondary}
                  companyAction={followCompany.action}
                />
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
          scope={scope}
          onEditLocations={() => document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))}
          primaryCareerBand={primaryCareerBand}
          exploredCareerBands={exploredCareerBands}
          onExploredCareerBandsChange={onExploredCareerBandsChange}
        />
      ) : null}

      {pending ? <NotInterestedUndo kind={pending.kind} jobId={pending.jobId} token={token} onUndo={undo} queuePosition={pending.kind === "saved" ? savedCount : undefined} /> : null}

      {/* Backlog #36 N3: a widening intent-diff hands off to the coin-charged
          expansion recompute — the gate lives in <MatchesRefreshBanner> on the
          /market page (this component's parent), so openRefreshGate reaches it. */}
      <IntentChat
        open={intentOpen}
        onClose={() => setIntentOpen(false)}
        onExpand={() => openRefreshGate()}
      />
    </div>
  )
}
