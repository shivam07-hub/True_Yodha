"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useViewport } from "@/mobile"
import type { JobFeedItem } from "@/lib/api"
import { useJobFeed } from "./use-job-feed"
import { useFeedWarm } from "./use-feed-warm"
import { usePulses } from "@/lib/hooks/use-pulses"
import { useMarketIntel } from "@/lib/hooks/use-market-intel"
import { useSkillDemand } from "@/lib/hooks/use-skill-demand"
import { useFeedScope } from "@/lib/hooks/use-feed-scope"
import { useTracks } from "@/lib/hooks/use-tracks"
import { trackDividers } from "@/lib/jobs/track-sections"
import { MarketRail } from "./market-rail"
import { MarketFeedFrame } from "./market-feed-frame"
import { MarketJobsColumn } from "./market-jobs-column"
import { MarketJobsOverlays } from "./market-jobs-overlays"
import { type FeedStory } from "./story-card"
import { interleaveStories } from "./feed-rows"
import { DEFAULT_FILTERS, applyViewFilters, localFilters, pickDefaultSort, type FeedFilters } from "./feed-types"
import { type MarketJobsTabProps } from "./market-jobs-tab-props"
import "./market.css"
import "./market-intel.css"

export type { MarketJobsTabProps } from "./market-jobs-tab-props"

export function MarketJobsTab(props: MarketJobsTabProps) {
  const {
    token, hasCv, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    initialFilters, initialQuery = "", onFiltersChange, onQueryChange,
    targetLocations, followCompany, initialSkillFacet, onSkillFacetChange,
    exploredCareerBands, onExploredCareerBandsChange,
    analyticsEnabled = true, demandEnabled = true,
    onFeedSettled, onDemandSettled, onAnalyticsSettled,
    header, railHead,
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
  // The WORDS for each search, and the gate on opening another. Not a J0 read:
  // the feed already carries `track_id`, and a single-track user renders
  // identically whether this has landed or not.
  const { tracks } = useTracks(token)

  const visibleRanked = useMemo(
    () => (rankedCount > 0 ? applyViewFilters(allJobs.slice(0, rankedCount), filters).length : 0),
    [rankedCount, allJobs, filters],
  )
  const picksDivider = useMemo(() => {
    if (visibleRanked <= 0) return []
    if (visibleJobs.length <= visibleRanked) return []
    return [{
      beforeJobId: visibleJobs[visibleRanked].job_id,
      label: scope.city ? `More roles in ${scope.city}` : "More roles",
      kind: "scope" as const,
    }]
  }, [visibleRanked, visibleJobs, scope])

  /**
   * Where each of the user's searches begins, and where the brain stopped
   * reading inside it. Empty for the 83% with one search — their screen is the
   * one it was before tracks existed.
   *
   * Over the VISIBLE ranked head, like the picks divider above it: a view
   * filter that hides three cards must move the boundaries with them, not point
   * at whatever now sits at that index.
   */
  const searchDividers = useMemo(
    () => trackDividers(visibleJobs.slice(0, visibleRanked), tracks),
    [visibleJobs, visibleRanked, tracks],
  )

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
    () => interleaveStories(visibleJobs, stories, [...searchDividers, ...picksDivider, ...expansionDividers]),
    [visibleJobs, stories, searchDividers, picksDivider, expansionDividers],
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

  const onSave = (j: JobFeedItem) => triage(j, "saved")
  const onSkip = (j: JobFeedItem) => triage(j, "skipped")

  const railProps = {
    token, scope, feed: allJobs, pulses, cvReady: hasCv,
    onSeeRoles, onFilterSkill, onOpenJob: setOpenJob, analyticsEnabled, demandEnabled, followCompany,
    onDemandSettled, onAnalyticsSettled,
  }

  return (
    <MarketFeedFrame
      header={header}
      railHead={railHead}
      rail={<MarketRail {...railProps} />}
      extras={
        <MarketJobsOverlays
          openJob={openJob}
          pulses={pulses}
          token={token}
          onCloseJob={() => setOpenJob(null)}
          onSaveOpenJob={() => { if (openJob) { onSave(openJob); setOpenJob(null) } }}
          filtersOpen={filtersOpen}
          filters={filters}
          onChangeFilters={onChangeFilters}
          onCloseFilters={() => setFiltersOpen(false)}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={hasCv}
          scope={scope}
          exploredCareerBands={exploredCareerBands}
          onExploredCareerBandsChange={onExploredCareerBandsChange}
          pending={pending}
          undo={undo}
          savedCount={savedCount}
        />
      }
    >
      <MarketJobsColumn
        token={token}
        hasCv={hasCv}
        hasTargetRoles={hasTargetRoles}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        setQ={setQ}
        onQueryChange={onQueryChange}
        filters={filters}
        onChangeFilters={onChangeFilters}
        savedCount={savedCount}
        onOpenFilters={() => setFiltersOpen(true)}
        q={q}
        skillFacet={skillFacet}
        setSkillFacet={setSkillFacet}
        onSkillFacetChange={onSkillFacetChange}
        onSave={onSave}
        onSkip={onSkip}
        loading={loading}
        visibleJobs={visibleJobs}
        clearBrowse={clearBrowse}
        total={total}
        scope={scope}
        weakShortlist={weakShortlist}
        isDesktop={isDesktop}
        rows={rows}
        pulses={pulses}
        followCompany={followCompany}
        onOpenJob={setOpenJob}
        onStoryPrimary={onStoryPrimary}
        onStorySecondary={onStorySecondary}
        sentinelRef={sentinelRef}
        fetchingMore={feed.isFetchingNextPage}
        hasNextPage={!!feed.hasNextPage}
      />
    </MarketFeedFrame>
  )
}
