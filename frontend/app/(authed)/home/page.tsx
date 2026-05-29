"use client"

import "./mission-control.css"

import { useEffect, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { FirstRunHero } from "@/components/home/first-run-hero"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { Hero } from "@/components/mission-control/hero"
import { HomeSkeleton } from "@/components/mission-control/hero-skeleton"
import { JobIndex } from "@/components/mission-control/job-index"
import { buildNextMoves } from "@/lib/mission-control/next-moves"
import { openFeedbackHub } from "@/components/feedback"
import { cv, diary, jobs, scores, users } from "@/lib/api"
import type { ApplicationStatus, JobMatch, SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreak } from "@/lib/forge-helpers"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCartStore } from "@/store/cartStore"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

function MissionControlInner() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { skills: cartSkills, addSkill, removeSkill } = useCartStore()

  const refreshVm = useJobRefresh(token, queryClient)

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(userCacheKey(token!, ["matches"]), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token,
    staleTime: MATCHES_TTL,
  })
  const { data: applications } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const historyQuery = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token!),
    enabled: !!token,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const allMatchedJobs: JobMatch[] = useMemo(() => jobsData?.jobs ?? [], [jobsData])
  const topJobs = useMemo(() => allMatchedJobs.slice(0, 5), [allMatchedJobs])
  const apps = useMemo(() => applications ?? [], [applications])
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const score = Math.round(scoreData?.total_score ?? 0)
  const cartSkillNames = useMemo(() => new Set(cartSkills.map((c) => c.skill_name)), [cartSkills])

  const appsByJobId = useMemo(() => {
    const m: Record<string, ApplicationStatus> = {}
    for (const a of apps) m[a.job_id] = a.status
    return m
  }, [apps])

  // ── Deep-link: ?jobId= opens that card in the JobIndex on first paint.
  const urlJobId = searchParams.get("jobId")

  // ── Mutations
  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  function handleSkillToggle(skill: SkillGapItem) {
    if (cartSkills.find((c) => c.skill_name === skill.skill)) {
      removeSkill(skill.skill)
    } else {
      addSkill({
        skill_name: skill.skill,
        level_from: skill.user_level ?? 0,
        level_to: skill.required_level ?? 1,
      })
    }
  }

  // ── Feedback shortcut (⌘/)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        openFeedbackHub({})
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // ── First-run vs returning (progressive-nav grill Q3)
  const nav = useNavUnlocks()

  // ── Hero data
  const firstName = profile?.full_name?.split(" ")[0] ?? "there"
  const dayStr = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    [],
  )
  const activeTargets = apps.filter((a) => ["saved", "applied", "screening", "interviewing", "final_round"].includes(a.status)).length
  const loggedToday = entries.length > 0 && entries[0].log_date === new Date().toISOString().slice(0, 10)
  const hasApplied = apps.some((a) => a.status !== "saved")
  const hasForged = entries.length > 0
  const primaryJob = (urlJobId ? allMatchedJobs.find((j) => j.job_id === urlJobId) : null) ?? topJobs[0]
  const firstMissing = primaryJob?.matched_skills?.length ? null : "Product Family Engineering"

  const checkpoints = [
    { label: "Find Job", done: topJobs.length > 0 },
    { label: "Practice", done: hasForged },
    { label: "Log", done: loggedToday },
    { label: "Level Up", done: (evidenceData?.score_delta ?? 0) > 0 },
    { label: "Apply", done: hasApplied },
  ]

  const cartSkillList = useMemo(() => cartSkills.map((c) => c.skill_name), [cartSkills])
  const nextMoves = useMemo(
    () =>
      buildNextMoves({
        primaryJob,
        hasForged,
        cartSkillNames: cartSkillList,
        firstMissing,
        loggedToday,
        streak,
        activeTargets,
      }),
    [primaryJob, hasForged, cartSkillList, firstMissing, loggedToday, streak, activeTargets],
  )

  // Hold the layout-matched skeleton until auth, nav unlocks, and the core
  // dashboard queries have all settled — then swap to real content in one
  // paint. `isLoading` flips false on error too, so a failing query can never
  // wedge the skeleton on forever. No blank body, no popping-in.
  const coreLoading = scoreLoading || profileLoading || jobsLoading || historyQuery.isLoading
  if (!ready || nav.loading || coreLoading) return <HomeSkeleton />

  // First-run = promise not yet delivered. The first-run hero absorbs the
  // pre-upload invitation (no RequiresCV gate) and owns the whole upload →
  // score → tailor journey until the first tailored CV exists.
  if (!nav.loading && nav.firstRun) {
    const best = topJobs[0]
    return (
      <>
        <div className="mc-scope" style={{ overflowY: "auto", height: "100%" }}>
          <div className="mc-page">
            <div className="mc-inner">
              <FirstRunHero
                firstName={firstName}
                hasCv={profile?.has_cv ?? false}
                cvReadiness={profile?.cv_readiness ?? "missing"}
                score={score}
                domainsCount={Object.keys(scoreData?.domain_scores ?? {}).length}
                bestMatch={
                  best
                    ? {
                        jobId: best.job_id,
                        title: best.title,
                        company: best.company,
                        location: best.location,
                        fit: Math.round(best.overlap_score),
                      }
                    : null
                }
              />
            </div>
          </div>
        </div>
      </>
    )
  }

  const dateLine = [dayStr, profile?.target_location].filter(Boolean).join(" · ")

  return (
    <>
      <RequiresCV>
      <div className="mc-scope" style={{ overflowY: "auto", height: "100%" }}>
        <div className="mc-page">
          <div className="mc-inner">
            <Hero
              name={firstName}
              dateLine={dateLine}
              activeTargets={activeTargets}
              checkpoints={checkpoints}
              nextMoves={nextMoves}
              score={score}
              streak={streak}
              sessions={entries.length}
              diaryEntries={evidenceData?.diary_entries_count ?? entries.length}
            />

            {token ? (
              <JobIndex
                jobs={allMatchedJobs}
                apps={apps}
                appsByJobId={appsByJobId}
                token={token}
                cartSkillNames={cartSkillNames}
                refresh={refreshVm}
                total={jobsData?.total ?? allMatchedJobs.length}
                feedUpdatedAt={jobsData?.feed_updated_at ?? null}
                matchesComputedAt={jobsData?.matches_computed_at ?? null}
                initialJobId={urlJobId}
                onStatus={(jobId, status) => updateStatus.mutate({ jobId, status })}
                onSkillToggle={handleSkillToggle}
              />
            ) : null}
          </div>
        </div>
      </div>
      </RequiresCV>
    </>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <MissionControlInner />
    </Suspense>
  )
}
