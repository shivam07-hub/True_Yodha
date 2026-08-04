"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { shortHeatmapSkillLabel } from "@/lib/heatmap-labels"
import { HeatmapTab } from "@/components/market/heatmap-tab"
import { GapAlertStrip } from "@/components/market/gap-alert-strip"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { useGapAlert, type GapSkill } from "@/lib/hooks/use-gap-alert"
import { MAX_LEVEL } from "@/lib/level-thresholds"

function IntelWorkspaceLoading() {
  return (
    <section className="si-workspace-loading" aria-label="Loading your Intel workspace" aria-busy="true">
      <div className="si-workspace-loading-card">
        <Skeleton style={{ width: 96, height: 12, borderRadius: 4 }} />
        <Skeleton style={{ width: "min(440px, 82%)", height: 32, borderRadius: 6, marginTop: 16 }} />
        <Skeleton style={{ width: "min(320px, 64%)", height: 14, borderRadius: 4, marginTop: 10 }} />
      </div>
      <div className="si-workspace-loading-card si-workspace-loading-board">
        <Skeleton style={{ width: 132, height: 12, borderRadius: 4 }} />
        <div className="si-workspace-loading-rows" aria-hidden="true">
          {[88, 72, 80].map((width) => <Skeleton key={width} style={{ width: `${width}%`, height: 48, borderRadius: 6 }} />)}
        </div>
      </div>
    </section>
  )
}

/**
 * The authed /intel surface (Signal Thread 1a). Owns the data HeatmapTab needs —
 * profile (target roles/locations, CV readiness) + the followed company set —
 * and mounts the heatmap board + compare strip + focus panel. This is where the
 * "intel heatmap" now lives for logged-in users; /market?tab=heatmap redirects
 * here. The heatmap's own cockpit is the surface header.
 *
 * Actions route out to the right home: personalise → /companies (the manage
 * surface), view-jobs → the /market feed.
 */
export function IntelWorkspace({ token }: { token: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramSkill = searchParams.get("skill") || null

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => users.me(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const follow = useFollowCompany(token)

  // Gap alert: the user's Gap/Building skills (below Strong) crossed with new
  // roles their followed companies posted this week. Shares the heatmap's
  // user-skills query key so it dedupes rather than double-fetching.
  const { data: userSkills } = useQuery({
    queryKey: ["heatmap-user-skills", token],
    queryFn: () => users.mySkills(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const gapSkills = useMemo<GapSkill[]>(() => {
    const flat = Object.values(userSkills?.by_domain ?? {}).flat()
    return flat
      .filter((s) => s.level < MAX_LEVEL)
      .map((s) => ({ name: s.display_name, level: s.level, forgeSessions: s.forge_sessions_count }))
  }, [userSkills])
  const followedNames = useMemo(() => follow.companies.map((c) => c.company_name), [follow.companies])
  const { alert } = useGapAlert(followedNames, gapSkills)

  const targetRoles = useMemo(() => profile?.target_roles ?? [], [profile?.target_roles])
  const cvReadiness = useMemo<"ready" | "missing" | "processing" | "failed">(() => {
    if (profile?.has_cv) return "ready"
    return profile?.cv_readiness ?? "missing"
  }, [profile?.cv_readiness, profile?.has_cv])

  if (profileLoading || follow.isLoading) return <IntelWorkspaceLoading />

  return (
    <div className="intel-workspace">
      <GapAlertStrip alert={alert} />
      <HeatmapTab
        token={token}
        cvReadyForPersonalization={cvReadiness === "ready"}
        cvReadiness={cvReadiness}
        cvUploadErrorCode={profile?.cv_upload_error_code ?? null}
        followedCompanies={follow.companies}
        selectedCluster={null}
        targetRoles={targetRoles}
        targetLocations={profile?.target_locations ?? []}
        locFilters={{}}
        paramSkill={paramSkill}
        formatSkillLabel={shortHeatmapSkillLabel}
        onPersonalise={() => router.push("/companies")}
        onViewSkillJobs={(skill) => router.push(`/market?skill=${encodeURIComponent(skill)}`)}
      />
    </div>
  )
}
