"use client"

import { useCallback, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query"
import { jobs, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { shortHeatmapSkillLabel } from "@/lib/heatmap-labels"
import type { CareerBand, JobLocationFilters } from "@/lib/api"
import { HeatmapTab } from "@/components/market/heatmap-tab"
import { MarketJobsTab } from "@/components/market/jobs-tab"
import { MissionHeroRail } from "@/components/mission-control/mission-hero-rail"
import { MatchesRefreshBanner } from "@/components/jobs/matches-refresh-banner"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { useViewport } from "@/mobile"
import { JobsSurface } from "@/mobile/redesign/jobs-surface"
import { useAuth } from "@/lib/hooks/use-auth"
import { useFeedState } from "@/lib/hooks/use-feed-state"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { useIdleWave, useIntentWave } from "@/lib/hooks/use-load-waves"
import { parseLocationMode, pickDefaultSort, type FeedFilters } from "@/components/market/feed-types"

type BrowsePatch = {
  tab?: "jobs" | "heatmap"
  q?: string
  skill?: string | null
  filters?: FeedFilters
}

function IntelPageInner() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { mode } = useViewport()
  // Three-wave loading (#41 L3). Wave 1 = identity + score + feed. Wave 2 =
  // idle cascade; Wave 3 = on-intent,
  // armed only on the user's first interaction — this keeps the 22–25s
  // `/jobs/analytics` (movers rail + per-role chip counts) OFF the login path.
  // Do not call /home/bootstrap here. On mobile this route never renders the
  // Home rail, so that eight-read BFF call was pure duplicate demand. On
  // desktop MissionHeroRail owns its own one shared bootstrap query.
  const wave2 = useIdleWave(!!token)
  const intent = useIntentWave()
  // Publication polling is J1. The first feed already answers the user's
  // current decision; revalidation cannot compete until that answer settles.
  useFeedState(wave2)

  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedCluster = searchParams.get("cluster") || null
  // Intel/heatmap analytics stay on the FULL market (facets are unscoped); the
  // job feed is scoped server-side from the user's saved location prefs. The UI
  // no longer re-asks for geo, so these are fixed empty here.
  const locationCity = ""
  const locationCountry = ""
  const locationMode = ""
  const activeTab: "jobs" | "heatmap" = searchParams.get("tab") === "heatmap" ? "heatmap" : "jobs"
  const jobSkillFacet = searchParams.get("skill") || null

  // The intel heatmap moved to its own home at /intel (Signal Thread L2). Any
  // old ?tab=heatmap link redirects there, carrying a skill facet through.
  useEffect(() => {
    if (activeTab === "heatmap") {
      router.replace(jobSkillFacet ? `/intel?skill=${encodeURIComponent(jobSkillFacet)}` : "/intel")
    }
  }, [activeTab, jobSkillFacet, router])

  // Profile — needed for target_roles.
  // Uses the CANONICAL dataKeys.profile() key so this shares one cache entry
  // with the app shell and with the /home/bootstrap seed. It previously used a
  // bare ["profile"] key, which is a different entry: the bootstrap seed never
  // reached it and every login paid for a third redundant GET /users/me.
  const { data: profileData } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const targetRoles: string[] = useMemo(
    () => profileData?.target_roles ?? [],
    [profileData?.target_roles]
  )
  const cvReadiness = useMemo<"ready" | "missing" | "processing" | "failed">(() => {
    if (!token) return "ready"
    if (profileData?.has_cv) return "ready"
    return profileData?.cv_readiness ?? "missing"
  }, [token, profileData?.cv_readiness, profileData?.has_cv])
  const cvReadyForPersonalization = cvReadiness === "ready"
  const browseFilters = useMemo<FeedFilters>(() => {
    const rawMinimum = Number(searchParams.get("min_skills") || 0)
    return {
      sort: searchParams.get("sort") === "fresh" ? "fresh" : pickDefaultSort(!!profileData?.has_cv, targetRoles.length > 0),
      roleDomain: selectedCluster,
      minSkillMatches: Number.isFinite(rawMinimum) ? Math.min(20, Math.max(0, Math.floor(rawMinimum))) : 0,
      followingOnly: searchParams.get("following") === "1",
      includeStretch: searchParams.get("stretch") === "1",
      locationMode: parseLocationMode(searchParams.get("mode")),
      hideLowConfidence: searchParams.get("quality") === "1",
    }
  }, [searchParams, profileData?.has_cv, selectedCluster, targetRoles.length])
  const browseQuery = searchParams.get("q") || ""

  const updateBrowse = useCallback((patch: BrowsePatch) => {
    const next = new URLSearchParams(searchParams.toString())
    const set = (key: string, value: string | null | undefined) => {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (patch.tab !== undefined) set("tab", patch.tab === "jobs" ? null : patch.tab)
    if (patch.q !== undefined) set("q", patch.q.trim() || null)
    if (patch.skill !== undefined) set("skill", patch.skill?.trim() || null)
    if (patch.filters) {
      set("cluster", patch.filters.roleDomain)
      set("sort", patch.filters.sort === pickDefaultSort(!!profileData?.has_cv, targetRoles.length > 0) ? null : patch.filters.sort)
      set("min_skills", patch.filters.minSkillMatches > 0 ? String(patch.filters.minSkillMatches) : null)
      set("following", patch.filters.followingOnly ? "1" : null)
      set("stretch", patch.filters.includeStretch ? "1" : null)
      set("mode", patch.filters.locationMode)
      set("quality", patch.filters.hideLowConfidence ? "1" : null)
    }
    const query = next.toString()
    router.replace(`/market${query ? `?${query}` : ""}`, { scroll: false })
  }, [router, searchParams, profileData?.has_cv, targetRoles.length])

  const locFilters = useMemo(
    () => ({
      locationCity: locationCity || null,
      locationCountry: locationCountry || null,
      locationMode: (locationMode || null) as JobLocationFilters["locationMode"],
    }),
    [locationCity, locationCountry, locationMode]
  )

  // Per-chip counts - one lightweight call per target role
  const chipCountQueries = useQueries({
    queries: targetRoles.map(role => ({
      queryKey: ["intel-chip-count", token ?? "", role, locationCity, locationCountry, locationMode],
      queryFn: () => jobs.analyticsForMe(token!, role, locFilters),
      // Wave 3: `/jobs/analytics/me` is a per-role aggregate — never on login.
      enabled: !!token && targetRoles.length > 0 && intent,
      staleTime: 30 * 60 * 1000,
    })),
  })

  const chipCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    targetRoles.forEach((role, i) => {
      const q = chipCountQueries[i]
      if (q?.data?.total_jobs != null) map[role] = q.data.total_jobs
    })
    return map
  }, [targetRoles, chipCountQueries])

  // Optimistic follow/unfollow + IH2 gating, shared with Settings.
  // Wave 2: `/users/me/following/companies` is cheap + likely used, so it warms
  // on the idle cascade rather than competing during the login instant.
  const following = useFollowCompany(token, { enabled: wave2 })
  const followedCompanies = following.companies

  // Explored career bands persist on the profile — shared by both surfaces so
  // the filters sheet behaves identically wherever it is opened.
  const onExploredCareerBandsChange = useCallback((bands: CareerBand[]) => {
    if (!token) return
    void users.updateProfile(token, { explored_career_bands: bands }).then(() => {
      void queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
    })
  }, [token, queryClient])

  // Mobile IA swap (handoff): the whole Jobs tab is the new swipe-triage
  // surface. Gate on viewport `mode` (width ≤768) to match the mobile chrome's
  // CSS breakpoint exactly — `isDesktop` also requires pointer:fine, so a
  // touch-tablet would desync content from chrome. Desktop keeps the workspace.
  if (mode === "mobile") {
    return (
      <>
        <div style={{ padding: "10px 16px 0" }}>
          <CVRequiredNudge
            hasCv={profileData === undefined || !!profileData.has_cv}
            feature="best-fit ranking"
          />
        </div>
        <JobsSurface
          token={token ?? ""}
          targetLocations={profileData?.target_locations ?? []}
          filters={browseFilters}
          onFiltersChange={(filters) => updateBrowse({ filters })}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={!!profileData?.has_cv}
          primaryCareerBand={profileData?.target_career_band}
          exploredCareerBands={profileData?.explored_career_bands ?? []}
          onExploredCareerBandsChange={onExploredCareerBandsChange}
        />
      </>
    )
  }

  // Heatmap moved to /intel — render nothing while the effect above redirects,
  // so the retired HeatmapTab never mounts and fires its queries.
  if (activeTab === "heatmap") return null

  return (
    <>
      <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
       <div className="mc-workspace">
        <aside className="mc-ws-rail">
          {wave2 && intent ? <MissionHeroRail token={token ?? null} /> : null}
        </aside>
        <div className="mc-ws-main">
        {/* Match staleness + coin-charged recompute — relocated from the retired
            /home dashboard; Jobs is the browse surface, so discovery mechanics
            live here. Renders nothing while matches are fresh. */}
        {token && wave2 ? <MatchesRefreshBanner token={token} /> : null}
        {activeTab === "jobs" ? (
          <MarketJobsTab
            token={token ?? ""}
            hasCv={!!profileData?.has_cv}
            cvResolved={profileData !== undefined}
            onboardingComplete={!!profileData?.onboarding_complete}
            targetRoles={targetRoles}
            chipCountMap={chipCountMap}
            selectedCluster={selectedCluster}
            onSelectCluster={(roleDomain) => updateBrowse({ filters: { ...browseFilters, roleDomain } })}
            initialFilters={browseFilters}
            initialQuery={browseQuery}
            onFiltersChange={(filters) => updateBrowse({ filters })}
            onQueryChange={(q) => updateBrowse({ q })}
            initialSkillFacet={jobSkillFacet}
            onSkillFacetChange={(skill) => updateBrowse({ skill })}
            primaryCareerBand={profileData?.target_career_band}
            exploredCareerBands={profileData?.explored_career_bands ?? []}
            onExploredCareerBandsChange={onExploredCareerBandsChange}
            targetLocations={profileData?.target_locations ?? []}
            followCompany={following}
            analyticsEnabled={intent}
            demandEnabled={wave2}
          />
        ) : (
          <HeatmapTab
            token={token ?? null}
            cvReadyForPersonalization={cvReadyForPersonalization}
            cvReadiness={cvReadiness}
            cvUploadErrorCode={profileData?.cv_upload_error_code ?? null}
            followedCompanies={followedCompanies}
            followCompany={following}
            selectedCluster={selectedCluster}
            targetRoles={targetRoles}
            targetLocations={profileData?.target_locations ?? []}
            locFilters={locFilters}
            paramSkill={jobSkillFacet}
            onBackToJobs={() => updateBrowse({ tab: "jobs" })}
            onPersonalise={() => updateBrowse({ tab: "jobs" })}
            onViewSkillJobs={(skill) => {
              updateBrowse({ tab: "jobs", skill })
            }}
            formatSkillLabel={shortHeatmapSkillLabel}
          />
        )}
        </div>
       </div>
      </div>
    </>
  )
}

export default function IntelPage() {
  return (
    <Suspense>
      <IntelPageInner />
    </Suspense>
  )
}
