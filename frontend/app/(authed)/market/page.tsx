"use client"

import { useState, useMemo, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueries } from "@tanstack/react-query"
import { jobs, users, xp } from "@/lib/api"
import type { JobLocationFilters } from "@/lib/api"
import { HeatmapTab } from "@/components/market/heatmap-tab"
import { MarketJobsTab } from "@/components/market/jobs-tab"
import { MissionHeroRail } from "@/components/mission-control/mission-hero-rail"
import { SkillMapCard } from "@/components/mission-control/peek-surfaces"
import { useViewport } from "@/mobile"
import { useAuth } from "@/lib/hooks/use-auth"
import { useFeedState } from "@/lib/hooks/use-feed-state"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { useXPStore } from "@/store/xpStore"

function IntelPageInner() {
  const { token } = useAuth()
  const { isDesktop } = useViewport()
  // Feed publication sensing - auto-invalidates the free market feed when a new
  // batch publishes (handoff client-refresh contract).
  useFeedState()
  const { balance: xpBalance, setBalance: setXPBalance } = useXPStore()
  const searchParams = useSearchParams()
  const paramSkill = searchParams.get("skill")

  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  // Intel/heatmap analytics stay on the FULL market (facets are unscoped); the
  // job feed is scoped server-side from the user's saved location prefs. The UI
  // no longer re-asks for geo, so these are fixed empty here.
  const locationCity = ""
  const locationCountry = ""
  const locationMode = ""
  const [activeTab, setActiveTab] = useState<"jobs" | "heatmap">(
    searchParams.get("tab") === "heatmap" ? "heatmap" : "jobs",
  )
  const [jobSkillFacet, setJobSkillFacet] = useState<string | null>(paramSkill)

  // Sync tokens balance if not yet set from another page visit
  useQuery({
    queryKey: ["xpBalance", token],
    queryFn: async () => {
      const r = await xp.balance(token!)
      setXPBalance(r.balance)
      return r
    },
    enabled: !!token && xpBalance === 0,
    staleTime: 60 * 1000,
  })

  // Profile - needed for target_roles
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
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
      enabled: !!token && targetRoles.length > 0,
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
  const following = useFollowCompany(token)
  const followedCompanies = following.companies
  const followedNames = following.followedNames

  useEffect(() => {
    if (paramSkill && activeTab === "jobs") setJobSkillFacet(paramSkill)
  }, [paramSkill, activeTab])

  return (
    <>
      <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
       <div className="mc-workspace">
        <aside className="mc-ws-rail">
          <MissionHeroRail token={token ?? null} />
          {isDesktop && token ? (
            <div className="mc-rail" style={{ marginTop: 16 }}>
              <SkillMapCard token={token} />
            </div>
          ) : null}
        </aside>
        <div className="mc-ws-main">
        {activeTab === "jobs" ? (
          <MarketJobsTab
            token={token ?? ""}
            hasCv={!!profileData?.has_cv}
            cvResolved={profileData !== undefined}
            targetRoles={targetRoles}
            targetRole={profileData?.target_role_title}
            chipCountMap={chipCountMap}
            selectedCluster={selectedCluster}
            onSelectCluster={setSelectedCluster}
            initialSkillFacet={jobSkillFacet}
            targetLocations={profileData?.target_locations ?? []}
            followedNames={followedNames}
            onToggleFollow={following.toggle}
            canFollow={following.canFollow}
            disabledReason={following.disabledReason}
          />
        ) : (
          <HeatmapTab
            token={token ?? null}
            cvReadyForPersonalization={cvReadyForPersonalization}
            cvReadiness={cvReadiness}
            cvUploadErrorCode={profileData?.cv_upload_error_code ?? null}
            followedCompanies={followedCompanies}
            selectedCluster={selectedCluster}
            targetRoles={targetRoles}
            targetLocations={profileData?.target_locations ?? []}
            locFilters={locFilters}
            paramSkill={paramSkill}
            onBackToJobs={() => setActiveTab("jobs")}
            onPersonalise={() => setActiveTab("jobs")}
            onViewSkillJobs={(skill) => {
              setJobSkillFacet(skill)
              setActiveTab("jobs")
            }}
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
