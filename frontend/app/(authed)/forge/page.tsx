"use client"

import "./practice.css"

import { Suspense, useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQueries, useQuery } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { ForgeSkeleton } from "@/components/loading/page-skeletons"
import { ViewTriadToggle } from "@/components/ui/view-triad-toggle"
import type { TriadView } from "@/lib/views/triad"
import { SkillIntelHeader } from "@/components/skills/skill-intel-header"
import { SkillAuditView } from "@/components/skills/skill-audit-view"
import { UpskillingView } from "@/components/skills/upskilling/upskilling-view"
import { jobs, scores, users } from "@/lib/api"
import type { SkillGapResponse, UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { buildPracticeSkills } from "@/lib/practice-skills"
import { buildDomainEntries, skillIntelStats } from "@/lib/skill-domains"
import { useAuth } from "@/lib/hooks/use-auth"
import { credibleRecommendations } from "@/lib/jobs/credible-recommendation"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

function ForgePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const skillParam = searchParams.get("skill")
  const viewParam = searchParams.get("view")
  const gapParam = searchParams.get("gap")

  // Intel (the Upskilling ladder) leads — the page's primary job. URL is the
  // source of truth: ?view / ?skill / ?gap override. No localStorage sticky.
  // The Map (domain radar) moved to the home rail — only Skills + Audit remain.
  const view: TriadView =
    skillParam || gapParam ? "intel"
      : viewParam === "audit" ? "audit"
        : "intel"

  const setView = useCallback((next: TriadView) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "intel") params.delete("view")
    else params.set("view", next)
    params.delete("domain")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])

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
  const topJobs = useMemo(() => credibleRecommendations(jobsData?.jobs ?? []).slice(0, 5), [jobsData])
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

  const gapJob = topJobs.length > 0
    ? { jobId: topJobs[0].job_id, title: topJobs[0].title, company: topJobs[0].company }
    : null

  const skills = userSkills ?? EMPTY_SKILLS
  const domainEntries = useMemo(() => buildDomainEntries(skills), [skills])
  const stats = useMemo(
    () => (scoreData ? skillIntelStats(skills, domainEntries) : null),
    [scoreData, skills, domainEntries],
  )
  const allSkills = useMemo(() => Object.values(skills.by_domain).flat(), [skills])
  const totalScore = scoreData ? Math.round(scoreData.total_score) : null

  if (!ready || scoreLoading) return <ForgeSkeleton />

  return (
    <>
      {/* Practice absorbed Skills (Audit tab; the Map radar lives in the home rail) — gate with the skills
          surface so no-CV users get the domain teaser, not the generic invite. */}
      <RequiresCV surface="skills">
        <div className="tm-page-enter tm-pr-page">
          <SkillIntelHeader
            totalScore={totalScore}
            ninjaName={profile?.ninja_name}
            stats={stats}
            targetRole={profile?.target_role_title}
            domainScores={scoreData?.domain_scores}
            gapSkills={scoreData?.gap_skills}
          />

          <ViewTriadToggle
            page="skills"
            value={view}
            onChange={setView}
            views={["intel", "audit"]}
            ariaLabel="Skill view"
          />

          {view === "intel" && token && (
            <UpskillingView
              token={token}
              practiceSkills={practiceSkills}
              gapJob={gapJob}
              gapJobId={gapParam}
              onClearGap={clearGap}
            />
          )}

          {view === "audit" && (
            <section className="tm-pr-skills">
              <h2 className="tm-pr-skills-title" style={{ marginBottom: 14 }}>Evidence audit</h2>
              <SkillAuditView allSkills={allSkills} />
            </section>
          )}
        </div>
      </RequiresCV>
    </>
  )
}

export default function ForgePage() {
  return (
    <Suspense fallback={<ForgeSkeleton />}>
      <ForgePageInner />
    </Suspense>
  )
}
