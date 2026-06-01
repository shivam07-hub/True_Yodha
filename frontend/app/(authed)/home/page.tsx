"use client"

import "./mission-control.css"

import { useEffect, useMemo, Suspense, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { FirstRunHero } from "@/components/home/first-run-hero"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { Hero } from "@/components/mission-control/hero"
import { HeroLoading } from "@/components/mission-control/hero-loading"
import { MobileBanner } from "@/components/home/mobile-banner"
import { MobileBannerLoading } from "@/components/home/mobile-banner-loading"
import { RouteLoading } from "@/components/loading/route-loading"
import { SectionGate } from "@/components/loading/section-gate"
import { TealField } from "@/components/loading/teal-field"
import { StaleBanner } from "@/components/errors/stale-banner"
import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"
import { openFeedbackHub } from "@/components/feedback"
import { cv, diary, jobs, scores, users, xp } from "@/lib/api"
import type { ApplicationStatus, JobMatch, JobMatchesResponse, SkillGapItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreakFromDates } from "@/lib/forge-helpers"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useViewport } from "@/mobile"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCartStore } from "@/store/cartStore"
import { clearLocalCache, userCacheKey, withLocalCache } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS, LEGACY_JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"

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
    queryFn: () => withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
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
  // Practice streak — reads real forge sessions (diary streak retired with the rail).
  const forgeSessionsQuery = useQuery({
    queryKey: ["forge-session-dates", token],
    queryFn: () => xp.forgeSessionDates(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const allMatchedJobs: JobMatch[] = useMemo(() => jobsData?.jobs ?? [], [jobsData])
  const dismissedJobIds = useMemo(() => new Set(jobsData?.dismissed_job_ids ?? []), [jobsData])
  const topJobs = useMemo(() => allMatchedJobs.slice(0, 5), [allMatchedJobs])
  const apps = useMemo(() => applications ?? [], [applications])
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreakFromDates(forgeSessionsQuery.data?.dates ?? [])
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

  const removeCard = useMutation({
    mutationFn: (jobId: string) => jobs.dismissMatchCard(token!, jobId),
    onSuccess: (_data, jobId) => {
      if (token) {
        clearLocalCache(userCacheKey(token, JOB_MATCHES_CACHE_PARTS))
        clearLocalCache(userCacheKey(token, LEGACY_JOB_MATCHES_CACHE_PARTS))
      }
      queryClient.setQueryData<JobMatchesResponse | undefined>(dataKeys.jobs(), (old) => {
        if (!old) return old
        const hadJob = old.jobs.some((job) => job.job_id === jobId)
        return {
          ...old,
          jobs: old.jobs.filter((job) => job.job_id !== jobId),
          total: Math.max(0, old.total - (hadJob ? 1 : 0)),
          dismissed_job_ids: Array.from(new Set([...(old.dismissed_job_ids ?? []), jobId])),
        }
      })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
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

  const checkpoints = [
    { label: "Find Job", done: topJobs.length > 0 },
    { label: "Practice", done: hasForged },
    { label: "Log", done: loggedToday },
    { label: "Level Up", done: (evidenceData?.score_delta ?? 0) > 0 },
    { label: "Apply", done: hasApplied },
  ]

  const scoreDelta = evidenceData?.score_delta ?? 0

  // Section-readiness model (dashboard-loading grill Q1): each region paints when
  // its own query resolves — no global gate blocking the whole page on the
  // slowest one. Hero needs score+profile; the jobs feed streams independently;
  // streak/delta degrade in from history/evidence (computeStreak([]) = 0 until
  // they arrive). The only thing that must resolve before we pick a LAYOUT is
  // cv.versions (first-run vs returning), handled by the nav.loading gate below.
  const coreLoading = scoreLoading || profileLoading
  const coreError = scoreErr ?? profileErr ?? null

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

  // Auth not settled — the app shell already shows the full-bleed loader; render
  // nothing rather than a token-less flash.
  if (!ready) return null

  // Cold error: no cache to fall back on. A settled error would otherwise paint
  // a fake-empty dashboard (isLoading flips false on error). Name it instead.
  if (coreError && !haveCoreData) {
    return <RouteLoading kind="app-data" route="app-shell" queryError={coreError} onRetry={refreshCore} />
  }

  // Selector-unknown window: until cv.versions resolves we can't tell first-run
  // from returning, so we don't commit a layout. Default to the returning SHAPE
  // (the common case, grill Q3) — real-shape skeletons, no first-run promise —
  // then branch once nav resolves.
  if (nav.loading) {
    return (
      <PageShell>
        <TealField mode="masked">
          {isDesktop ? <HeroLoading /> : <MobileBannerLoading />}
        </TealField>
        <div style={{ marginTop: isDesktop ? 36 : 16 }}>
          <TealField mode="masked">
            <DashboardSkeleton />
          </TealField>
        </div>
      </PageShell>
    )
  }

  // First-run (PROVEN) = promise not yet delivered. The first-run hero absorbs
  // the pre-upload invitation (no RequiresCV gate) and owns the whole upload →
  // score → tailor journey until the first tailored CV exists.
  if (nav.firstRun) {
    const best = topJobs[0]
    return (
      <PageShell>
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
      </PageShell>
    )
  }

  const dateLine = [dayStr, profile?.target_location].filter(Boolean).join(" · ")

  return (
    <>
      <RequiresCV>
        <PageShell>
          {staleRefreshFailed && (
            <StaleBanner lastViewAt={lastViewAt} onRefresh={refreshCore} />
          )}

          {/* Hero section — paints on score+profile; Q6: mobile collapses to a
              thin banner so the card feed owns the viewport. */}
          <SectionGate
            loading={coreLoading}
            fallback={
              <TealField mode="masked">
                {isDesktop ? <HeroLoading /> : <MobileBannerLoading />}
              </TealField>
            }
            slowText="Still loading your dashboard…"
          >
            {isDesktop ? (
              <Hero
                name={firstName}
                dateLine={dateLine}
                activeTargets={activeTargets}
                checkpoints={checkpoints}
                score={score}
                streak={streak}
                scoreDelta={scoreDelta}
                loggedToday={loggedToday}
                sessions={entries.length}
                diaryEntries={evidenceData?.diary_entries_count ?? entries.length}
              />
            ) : (
              <MobileBanner
                name={firstName}
                score={score}
                streak={streak}
                scoreDelta={scoreDelta}
                loggedToday={loggedToday}
              />
            )}
          </SectionGate>

          {/* Jobs feed — streams independently of the hero. */}
          <div style={{ marginTop: isDesktop ? 36 : 16 }}>
            <SectionGate
              loading={!!token && jobsLoading}
              error={token && jobsIsError ? jobsErr : null}
              onRetry={() => void refetchJobs()}
              errorLabel="job matches"
              fallback={
                <TealField mode="masked">
                  <DashboardSkeleton />
                </TealField>
              }
              slowText="Still loading your matches…"
            >
              {token ? (
                <Dashboard
                  jobs={allMatchedJobs}
                  apps={apps}
                  appsByJobId={appsByJobId}
                  token={token}
                  cartSkillNames={cartSkillNames}
                  refresh={refreshVm}
                  dismissedJobIds={dismissedJobIds}
                  total={jobsData?.total ?? allMatchedJobs.length}
                  feedUpdatedAt={jobsData?.feed_updated_at ?? null}
                  matchesComputedAt={jobsData?.matches_computed_at ?? null}
                  initialJobId={urlJobId}
                  onStatus={(jobId, status) => updateStatus.mutate({ jobId, status })}
                  onRemove={(jobId) => removeCard.mutate(jobId)}
                  onSkillToggle={handleSkillToggle}
                />
              ) : null}
            </SectionGate>
          </div>
        </PageShell>
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

/** mc-scope → mc-page → mc-inner wrapper shared by every /home layout branch. */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mc-scope" style={{ overflowY: "auto", height: "100%" }}>
      <div className="mc-page">
        <div className="mc-inner">{children}</div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <MissionControlInner />
    </Suspense>
  )
}
