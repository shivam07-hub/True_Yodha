"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { HeatmapTab } from "@/components/market/heatmap-tab"
import { GapAlertStrip } from "@/components/market/gap-alert-strip"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { useGapAlert, type GapSkill } from "@/lib/hooks/use-gap-alert"
import { MAX_LEVEL } from "@/lib/level-thresholds"

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

  const { data: profile } = useQuery({
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
        onBackToJobs={() => router.push("/market")}
        onPersonalise={() => router.push("/companies")}
        onViewSkillJobs={(skill) => router.push(`/market?skill=${encodeURIComponent(skill)}`)}
      />
    </div>
  )
}
