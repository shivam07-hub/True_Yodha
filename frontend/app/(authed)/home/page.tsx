"use client"

import "./mission-control.css"

import { useEffect, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { FirstRunHero } from "@/components/home/first-run-hero"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { Hero } from "@/components/mission-control/hero"
import { MobileBanner } from "@/components/home/mobile-banner"
import { HomeSkeleton } from "@/components/mission-control/hero-skeleton"
import { useLoadingPhase } from "@/components/loading/use-loading-phase"
import { RouteLoading } from "@/components/loading/route-loading"
import { SectionError } from "@/components/errors/section-error"
import { StaleBanner } from "@/components/errors/stale-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Dashboard } from "@/components/dashboard/dashboard"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"
import { buildNextMoves } from "@/lib/mission-control/next-moves"
import { openFeedbackHub } from "@/components/feedback"
import { cv, diary, jobs, scores, users } from "@/lib/api"
import type { ApplicationStatus, JobMatch, SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreak } from "@/lib/forge-helpers"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useViewport } from "@/mobile"
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

  const { data: scoreData, isLoading: scoreLoading, error: scoreErr, refetch: refetchScore, dataUpdatedAt: scoreUpdatedAt } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile, isLoading: profileLoading, error: profileErr, refetch: refetchProfile, dataUpdatedAt: profileUpdatedAt } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData, isLoading: jobsLoading, isError: jobsIsError, error: jobsErr, refetch: refetchJobs } = useQuery({
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

  // ── Deep-link: ?jobId= opens that card in the Dashboard on first paint.
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
  const { isDesktop } = useViewport()

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
  // Hero blocks only on the two queries it can't render without — score and
  // profile. Jobs and history both degrade instead of wedging the hero: jobs to
  // a section tile, history (streak/sessions) to computeStreak([]) = 0 that
  // fills in when it arrives. This is the per-section streaming split.
  const coreLoading = scoreLoading || profileLoading
  const coreError = scoreErr ?? profileErr ?? null
  const blocking = !ready || nav.loading || coreLoading
  const loadingPhase = useLoadingPhase(blocking)

  // Stale-while-error: if a refresh failed but persisted cache already gave us
  // the hero's data, show that data with a calm banner instead of a hard
  // failure. Only a cold error (no cached data) gets the full failure surface.
  const haveCoreData = !!scoreData && !!profile
  const refreshCore = () => {
    void refetchScore()
    void refetchProfile()
    void historyQuery.refetch()
  }
  const staleRefreshFailed = !!coreError && haveCoreData
  const lastViewAt = Math.min(scoreUpdatedAt || Date.now(), profileUpdatedAt || Date.now())

  if (blocking) return <HomeSkeleton phase={loadingPhase} />
  // Cold error: no cache to fall back on. A settled error would otherwise paint
  // a fake-empty dashboard (isLoading flips false on error). Name it instead.
  if (coreError && !haveCoreData) {
    return <RouteLoading kind="app-data" route="app-shell" queryError={coreError} onRetry={refreshCore} />
  }

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
            {staleRefreshFailed && (
              <StaleBanner lastViewAt={lastViewAt} onRefresh={refreshCore} />
            )}
            {/* Q6: mobile collapses the full Hero into a thin sticky banner so
                the card feed owns the viewport. Desktop keeps the full Hero. */}
            {isDesktop ? (
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
            ) : (
              <MobileBanner
                name={firstName}
                score={score}
                streak={streak}
                topMove={nextMoves[0] ?? null}
              />
            )}

            {token && jobsIsError ? (
              <div style={{ marginTop: 24 }}>
                <SectionError error={jobsErr} label="job matches" onRetry={() => void refetchJobs()} />
              </div>
            ) : token && jobsLoading ? (
              <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 12 }} aria-hidden="true">
                <Skeleton style={{ width: 120, height: 12, borderRadius: 4 }} />
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} style={{ width: 220, height: 76, borderRadius: 12 }} />
                  ))}
                </div>
              </div>
            ) : token ? (
              <Dashboard
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

      {/* Consent + targeting gate for "Refresh matches" — opened via refreshGateStore. */}
      <MatchRefreshGate
        token={token}
        profile={profile}
        onRun={() => refreshVm.refresh()}
      />
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
