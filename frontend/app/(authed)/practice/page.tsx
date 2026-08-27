"use client"

import { Suspense, useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { RequiresCareerTarget } from "@/components/career-path/requires-career-target"
import { SkillPathMaps } from "@/components/career-path/skill-path-maps"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { PracticeSkeleton } from "@/components/loading/page-skeletons"
import { UpskillingView } from "@/components/skills/upskilling/upskilling-view"
import { scores, users, type UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useCareerSkillPath } from "@/lib/hooks/use-career-skill-path"
import { useAuth } from "@/lib/hooks/use-auth"
import { buildDomainEntries, skillIntelStats } from "@/lib/skill-domains"

import "./practice.css"
import "./practice-bar.css"
import "./practice-hero.css"
import "./practice-climb.css"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

function PracticePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const path = useCareerSkillPath()

  const gapParam = searchParams.get("gap")
  const skillParam = searchParams.get("skill")
  const practiceJobId = searchParams.get("jobId")

  const clearGap = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("gap")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])

  const { data: userSkills } = useQuery({
    queryKey: dataKeys.userSkills(), queryFn: () => users.mySkills(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(), queryFn: () => scores.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000, retry: false,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(), queryFn: () => users.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })

  const skills = userSkills ?? EMPTY_SKILLS
  const domainEntries = useMemo(() => buildDomainEntries(skills), [skills])
  const stats = useMemo(
    () => (scoreData ? skillIntelStats(skills, domainEntries) : null),
    [scoreData, skills, domainEntries],
  )
  const totalScore = scoreData ? Math.round(scoreData.total_score) : null

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/market")
  }, [router])

  const roleTitles = useMemo(() => {
    if (path.data?.snapshot?.role_title) return [path.data.snapshot.role_title]
    if (profile?.target_role_titles?.length) return profile.target_role_titles
    if (profile?.target_role_title) return [profile.target_role_title]
    return []
  }, [path.data, profile])

  if (!ready || scoreLoading) return <PracticeSkeleton />

  return (
    <RequiresCV surface="skills">
      <RequiresCareerTarget>
        <div className="tm-page-enter">
          {path.data && !path.data.needs_target ? <SkillPathMaps path={path.data} /> : null}
          {token && (
            <UpskillingView
              token={token}
              gapJobId={gapParam}
              focusSkill={skillParam}
              originJobId={practiceJobId}
              onClearGap={clearGap}
              onNavigate={href => router.push(href)}
              onBack={goBack}
              totalScore={totalScore}
              band={scoreData?.band}
              topPercent={scoreData?.top_percent}
              stats={stats}
              ninjaName={profile?.ninja_name}
              roleTitles={roleTitles}
            />
          )}
        </div>
      </RequiresCareerTarget>
    </RequiresCV>
  )
}

export default function PracticePage() {
  return (
    <Suspense fallback={<PracticeSkeleton />}>
      <PracticePageInner />
    </Suspense>
  )
}
