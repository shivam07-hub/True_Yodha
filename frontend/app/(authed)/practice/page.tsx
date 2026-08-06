"use client"

import "./practice.css"
import "./practice-bar.css"
import "./practice-hero.css"
import "./practice-climb.css"

import { Suspense, useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQueries, useQuery } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { PracticeSkeleton } from "@/components/loading/page-skeletons"
import { UpskillingView } from "@/components/skills/upskilling/upskilling-view"
import { jobs, scores, users } from "@/lib/api"
import type { SkillGapResponse, UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { buildPracticeSkills } from "@/lib/practice-skills"
import { buildDomainEntries, skillIntelStats } from "@/lib/skill-domains"
import { useAuth } from "@/lib/hooks/use-auth"
import { strongMatches } from "@/lib/jobs/match-verdict"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

function PracticePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const gapParam = searchParams.get("gap")
  const skillParam = searchParams.get("skill")
  const practiceJobId = searchParams.get("jobId")

  // /practice is the Upskilling ladder only. The evidence audit moved to the CV
  // Skills rail (its per-CV-point home); the Map radar lives in the home rail.
  const clearGap = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("gap")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])

  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(), queryFn: () => jobs.matches(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  // Strong matches first; when the user has none, the closest by Match score —
  // never an empty gap surface (the honest Stretch answer). Same Match Verdict
  // the rest of the app reads.
  const topJobs = useMemo(() => {
    const all = jobsData?.jobs ?? []
    const strong = strongMatches(all)
    const pool = strong.length > 0 ? strong : [...all].sort((a, b) => b.match_score - a.match_score)
    return pool.slice(0, 5)
  }, [jobsData])
  const jobGapQueries = useQueries({
    queries: topJobs.map((job) => ({
      queryKey: dataKeys.skillGap(job.job_id),
      queryFn: () => jobs.skillGap(token!, job.job_id),
      enabled: !!token && !!job.job_id, staleTime: 10 * 60 * 1000,
    })),
  })
  const { data: skillDemand } = useQuery({
    queryKey: dataKeys.userSkillDemand(), queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token, staleTime: 10 * 60 * 1000,
  })
  const { data: userSkills } = useQuery({
    queryKey: dataKeys.userSkills(), queryFn: () => users.mySkills(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const { data: savedSkills } = useQuery({
    queryKey: dataKeys.practiceSaves(), queryFn: () => users.practiceSaves(token!),
    enabled: !!token, staleTime: 60 * 1000,
  })
  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(), queryFn: () => scores.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000, retry: false,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(), queryFn: () => users.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })

  const jobGaps = jobGapQueries
    .map((query) => query.data)
    .filter((gap): gap is SkillGapResponse => !!gap)
  const practiceSkills = useMemo(
    () => buildPracticeSkills(userSkills, jobGaps, skillDemand, savedSkills?.skills ?? []),
    [userSkills, jobGaps, skillDemand, savedSkills],
  )

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
    if (profile?.target_role_titles?.length) return profile.target_role_titles
    if (profile?.target_role_title) return [profile.target_role_title]
    return []
  }, [profile])

  if (!ready || scoreLoading) return <PracticeSkeleton />

  return (
    <>
      {/* Practice absorbed Skills (Audit tab; the Map radar lives in the home rail) — gate with the skills
          surface so no-CV users get the domain teaser, not the generic invite. */}
      <RequiresCV surface="skills">
        <div className="tm-page-enter">
          {token && (
            <UpskillingView
              token={token}
              practiceSkills={practiceSkills}
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
      </RequiresCV>
    </>
  )
}

export default function PracticePage() {
  return (
    <Suspense fallback={<PracticeSkeleton />}>
      <PracticePageInner />
    </Suspense>
  )
}
