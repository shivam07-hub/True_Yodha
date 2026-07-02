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
import { NextBestSteps } from "@/components/home/next-best-steps"
import { deriveNextBestSteps } from "@/lib/onboarding/next-best-steps"
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

  // Command Center (#146 · 2026-07-02) — the score screen must END in an action.
  // The "Your next 3 steps" triad (1 skill · 1 job · 1 CV) derived from this
  // user's own breakdown now lives HERE, directly under the score, instead of
  // only on the /home feed — closing the ~18-vote "I got my score and didn't
  // know what to do next" dead-end. bestJob = strongest credible match.
  const nextBestSteps = useMemo(() => {
    if (!scoreData) return []
    const best = topJobs[0] ?? null
    return deriveNextBestSteps({
      score: totalScore ?? 0,
      gapSkills: scoreData.gap_skills ?? [],
      domainScores: scoreData.domain_scores ?? {},
      bestJob: best
        ? { jobId: best.job_id, title: best.title, company: best.company, fit: Math.round(best.overlap_score) }
        : null,
      tailorJobId: topJobs[0]?.job_id ?? null,
    })
  }, [scoreData, topJobs, totalScore])

  if (!ready || scoreLoading) return <ForgeSkeleton />

  return (
    <>
      {/* Practice absorbed Skills (Audit tab; the Map radar lives in the home rail) — gate with the skills
          surface so no-CV users get the domain teaser, not the generic invite. */}
      <RequiresCV surface="skills">
        <div className="tm-page-enter tm-pr-page">
          <button
            type="button"
            onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/market") }}
            className="tm-control-focus"
            aria-label="Go back"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tm-text-muted)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 16, font: "inherit" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <SkillIntelHeader
            totalScore={totalScore}
            ninjaName={profile?.ninja_name}
            stats={stats}
            targetRole={profile?.target_role_title}
            domainScores={scoreData?.domain_scores}
            gapSkills={scoreData?.gap_skills}
          />

          <NextBestSteps score={totalScore ?? 0} steps={nextBestSteps} />

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
