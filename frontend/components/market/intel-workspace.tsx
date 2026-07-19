"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { HeatmapTab } from "@/components/market/heatmap-tab"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"

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

  const targetRoles = useMemo(() => profile?.target_roles ?? [], [profile?.target_roles])
  const cvReadiness = useMemo<"ready" | "missing" | "processing" | "failed">(() => {
    if (profile?.has_cv) return "ready"
    return profile?.cv_readiness ?? "missing"
  }, [profile?.cv_readiness, profile?.has_cv])

  return (
    <div className="intel-workspace">
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
