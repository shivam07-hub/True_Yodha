"use client"

import "./mission-control.css"

import { useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { FirstRunHero } from "@/components/home/first-run-hero"
import { YourMoveCard } from "@/components/home/YourMoveCard"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import type { LoopStep } from "@/components/mission-control/loop-ring"
import { RouteLoading } from "@/components/loading/route-loading"
import { SectionGate } from "@/components/loading/section-gate"
import { TealField } from "@/components/loading/teal-field"
import { StaleBanner } from "@/components/errors/stale-banner"
import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"
import { openFeedbackHub } from "@/components/feedback"
import { useParticleMoment } from "@/components/particle"
import { cv, diary, jobs, scores, users } from "@/lib/api"
import type { ApplicationStatus, JobMatch, JobMatchesResponse, SkillGapItem } from "@/lib/api"
import { useApplicationStatus } from "@/lib/hooks/use-application-status"
import { useFeedState } from "@/lib/hooks/use-feed-state"
import { dataKeys } from "@/lib/domain-data"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useHomeBootstrap } from "@/lib/hooks/use-home-bootstrap"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCartStore } from "@/store/cartStore"
import { clearLocalCache, userCacheKey, withLocalCache } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS, LEGACY_JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import { credibleRecommendations } from "@/lib/jobs/credible-recommendation"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"
import { NextSteps } from "@/components/onboarding/next-steps"
import { PeekSurfaces } from "@/components/mission-control/peek-surfaces"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

function MissionControlInner() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { skills: cartSkills, addSkill, removeSkill } = useCartStore()

  const refreshVm = useJobRefresh(token, queryClient)

  // BFF: one /home/bootstrap call seeds every dashboard query below. The leaf
  // queries are gated on it settling, so a cold load paints from a single
  // round-trip. On bootstrap error, `settled` still flips and the leaves fall
  // back to fetching themselves (pre-BFF behaviour).
  const bootstrap = useHomeBootstrap(token)
  const bootstrapSettled = bootstrap.settled

  const { data: scoreData, isLoading: scoreLoading, error: scoreErr, refetch: refetchScore, dataUpdatedAt: scoreUpdatedAt } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token && bootstrapSettled,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile, isLoading: profileLoading, error: profileErr, refetch: refetchProfile, dataUpdatedAt: profileUpdatedAt } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token && bootstrapSettled,
    staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData, isLoading: jobsLoading, isError: jobsIsError, error: jobsErr, refetch: refetchJobs } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token && bootstrapSettled,
    staleTime: MATCHES_TTL,
  })
  const { data: applications } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token && bootstrapSettled,
    staleTime: 5 * 60 * 1000,
  })
  const historyQuery = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token!),
    enabled: !!token && bootstrapSettled,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token && bootstrapSettled,
    staleTime: 5 * 60 * 1000,
  })
  const allMatchedJobs: JobMatch[] = useMemo(() => jobsData?.jobs ?? [], [jobsData])
  const dismissedJobIds = useMemo(() => new Set(jobsData?.dismissed_job_ids ?? []), [jobsData])

  // Feed publication sensing — drives the market auto-refresh + tells the
  // dashboard whether new jobs have been published since these matches ran
  // (offer a refresh; never auto-charge).
  // Keeps the global feed-publication sensor live (it re-fetches the market free
  // feed on republish). The dashboard's "new jobs" banner no longer reads this —
  // it uses the genuine per-user new_jobs_count from /matches.
  useFeedState()
  const topJobs = useMemo(() => allMatchedJobs.slice(0, 5), [allMatchedJobs])
  const credibleJobs = useMemo(() => credibleRecommendations(allMatchedJobs), [allMatchedJobs])
  const apps = useMemo(() => applications ?? [], [applications])
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const score = Math.round(scoreData?.total_score ?? 0)
  const cartSkillNames = useMemo(() => new Set(cartSkills.map((c) => c.skill_name)), [cartSkills])

  const appsByJobId = useMemo(() => {
    const m: Record<string, ApplicationStatus> = {}
    for (const a of apps) m[a.job_id] = a.status
    return m
  }, [apps])
  const credibleJobId = credibleJobs[0]?.job_id ?? null
  const credibleJobSaved = credibleJobs.some((job) => apps.some((app) => app.job_id === job.job_id))

  // WOW moment #1 — the peak. The first time this user ever sees job matches
  // ("it sees me"), light up the whole dashboard with a big centre burst.
  // Once-ever per browser (localStorage), so it stays scarce and special.
  const fireMoment = useParticleMoment()
  useEffect(() => {
    if (jobsLoading || allMatchedJobs.length === 0) return
    try {
      if (localStorage.getItem("myro:firstMatchWow")) return
      localStorage.setItem("myro:firstMatchWow", "1")
    } catch { /* storage blocked — skip the guard, still fire once this mount */ }
    fireMoment({ intensity: 1.6, durationMs: 4200 })
  }, [jobsLoading, allMatchedJobs.length, fireMoment])

  // WOW moment #4 — every successful Refresh that lands new matches. Refresh is
  // a deliberate, token-charged action, so it earns a celebration EVERY time
  // (unlike the once-ever first match). Fires on the done-transition; gated on
  // matches actually written so a "0 new" finish doesn't fake a payoff.
  // refreshFiredRef guards the done edge so a re-render can't double-fire.
  const refreshFiredRef = useRef(false)
  const dismissRequestRef = useRef<{ jobId: string; operation: Promise<unknown> } | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingDismissal, setPendingDismissal] = useState<string | null>(null)
  useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!refreshFiredRef.current) {
        refreshFiredRef.current = true
        fireMoment({ intensity: 1.4 })
      }
    } else {
      refreshFiredRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, fireMoment])

  // ── Deep-link: ?jobId= opens that card in the Dashboard on first paint.
  const urlJobId = searchParams.get("jobId")

  // ── Mutations
  //
  // Application stage (Like = save / stage change) is the one optimistic
  // contract owned by useApplicationStatus — instant tap, rollback on failure,
  // shared with the tracker + pursuit-stage picker so no surface taps-then-waits
  // (design law: the UI state is the feedback). Skip (✕ / unlike) is a separate
  // act (dismiss the card) and stays here, also optimistic.
  const appStatus = useApplicationStatus(token)

  const removeCard = useMutation({
    mutationFn: (jobId: string) => jobs.dismissMatchCard(token!, jobId),
    onMutate: async (jobId: string) => {
      await queryClient.cancelQueries({ queryKey: dataKeys.jobs() })
      const prevJobs = queryClient.getQueryData<JobMatchesResponse>(dataKeys.jobs())
      queryClient.setQueryData<JobMatchesResponse | undefined>(dataKeys.jobs(), (old) => {
        if (!old) return old
        const hadJob = old.jobs.some((job) => job.job_id === jobId)
        return {
          ...old,
          jobs: old.jobs.filter((job) => job.job_id !== jobId),
          total: Math.max(0, old.total - (hadJob ? 1 : 0)),
          // Dismissing a liked self-added job (not in `jobs`) still hides it —
          // buildFeed filters both jobs AND apps by dismissed_job_ids.
          dismissed_job_ids: Array.from(new Set([...(old.dismissed_job_ids ?? []), jobId])),
        }
      })
      return { prevJobs }
    },
    onError: (_e, _jobId, ctx) => {
      if (ctx?.prevJobs) queryClient.setQueryData(dataKeys.jobs(), ctx.prevJobs)
    },
    onSuccess: () => {
      if (token) {
        clearLocalCache(userCacheKey(token, JOB_MATCHES_CACHE_PARTS))
        clearLocalCache(userCacheKey(token, LEGACY_JOB_MATCHES_CACHE_PARTS))
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
    },
  })

  function handleRemove(jobId: string) {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    const operation = removeCard.mutateAsync(jobId).catch(() => undefined)
    dismissRequestRef.current = { jobId, operation }
    setPendingDismissal(jobId)
    dismissTimerRef.current = setTimeout(() => setPendingDismissal(null), 6_000)
  }

  function undoRemove() {
    const pending = dismissRequestRef.current
    if (!pending || !token) return
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    setPendingDismissal(null)
    void pending.operation.catch(() => undefined).then(() => jobs.unskipJob(token, pending.jobId)).finally(() => {
      clearLocalCache(userCacheKey(token, JOB_MATCHES_CACHE_PARTS))
      clearLocalCache(userCacheKey(token, LEGACY_JOB_MATCHES_CACHE_PARTS))
      void queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
    })
  }

  useEffect(() => () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current) }, [])

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

  // ── Dashboard data (feed). The greeting hero relocated to /market.
  const firstName = profile?.full_name?.split(" ")[0] ?? "there"
  const loggedToday = entries.length > 0 && entries[0].log_date === new Date().toISOString().slice(0, 10)
  const hasApplied = apps.some((a) => a.status !== "saved")
  const hasForged = entries.length > 0

  // Post-apply Practice nudge (CV-playground grill, 2026-06-22): Practice only
  // earns the home "your move" slot once a pursuit is actively Applied or
  // Interviewing (closed outcomes don't count) AND there's a real gap to close.
  const hasActivePursuit = apps.some((a) => a.status === "applied" || a.status === "interviewing")
  const topGapSkill = useMemo(() => {
    const gaps = scoreData?.gap_skills ?? []
    if (gaps.length === 0) return null
    return [...gaps].sort(
      (a, b) => (b.gap_score - a.gap_score) || (b.job_count_30d - a.job_count_30d),
    )[0]?.skill ?? null
  }, [scoreData])

  // Daily loop — the five ritual steps. Still passed to the Dashboard feed
  // (the LoopRing itself moved to the /market hero). `href` = where
  // "close this step" routes; on-page steps (Log → diary panel below) omit it.
  // `reward` is the Myro Coins incentive chip shown on open missions. Set only on
  // steps that map to a real coin-rewarded action: Practice = "Clear a skill
  // level" (+20/30/50 first clear per level, mirrors XP_EARN_ACTIONS) and Log =
  // a diary entry (MYRO_COINS_POLICY.diaryEntry). Find/Level Up/Apply carry no
  // direct coin reward today, so they show as plain missions.
  const steps: LoopStep[] = [
    { label: "Find Job", done: topJobs.length > 0, icon: "target", href: "/market" },
    { label: "Practice", done: hasForged, icon: "forge", href: "/forge", reward: "+20–50" },
    { label: "Log", done: loggedToday, icon: "diary", reward: `+${MYRO_COINS_POLICY.diaryEntry}` },
    { label: "Level Up", done: (evidenceData?.score_delta ?? 0) > 0, icon: "star", href: "/skills" },
    { label: "Apply", done: hasApplied, icon: "arrowRight", href: "/market" },
  ]

  // Section-readiness model (dashboard-loading grill Q1): each region paints when
  // its own query resolves — no global gate blocking the whole page on the
  // slowest one. Hero needs score+profile; the jobs feed streams independently;
  // streak/delta degrade in from history/evidence (computeStreak([]) = 0 until
  // they arrive). The only thing that must resolve before we pick a LAYOUT is
  // cv.versions (first-run vs returning), handled by the nav.loading gate below.
  // Gated leaf queries report isLoading=false while disabled, so the bootstrap
  // in-flight window is the real "core loading" signal on a cold load.
  const coreLoading = !bootstrapSettled || scoreLoading || profileLoading
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
          <DashboardSkeleton />
        </TealField>
      </PageShell>
    )
  }

  // First-run (PROVEN) = promise not yet delivered. The first-run hero absorbs
  // the pre-upload invitation (no RequiresCV gate) and owns the whole upload →
  // score → tailor journey until the first tailored CV exists.
  if (nav.firstRun) {
    const best = credibleJobs[0]
    return (
      <PageShell>
        {/* First-run is one focused, centered column — hero + next-steps share the
            same 640 measure so the journey reads as a single aligned rail rather
            than a narrow hero floating above a full-width block. */}
        <div className="frh-firstrun-col">
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
          {token ? <NextSteps token={token} credibleJobId={credibleJobId} credibleJobSaved={credibleJobSaved} tailored={false} /> : null}
        </div>
      </PageShell>
    )
  }

  return (
    <>
      <RequiresCV>
        <PageShell>
          {staleRefreshFailed && (
            <StaleBanner lastViewAt={lastViewAt} onRefresh={refreshCore} />
          )}

          {/* The greeting hero (daily-loop ring + score/streak) relocated to
              /market. The dashboard keeps the match feed in the centre with the
              context surfaces (missions · skill map · followed · live intel) in a
              pinned LEFT rail — mirroring the /market workspace. Collapses to one
              column ≤980px. The job detail opens from the right (drawer) on click. */}
          <div className="mc-workspace">
            <aside className="mc-ws-rail mc-ws-rail--peek">
              {token ? (
                <div className="mc-rail">
                  <PeekSurfaces token={token} steps={steps} />
                </div>
              ) : null}
            </aside>
            <div className="mc-ws-main">
            <YourMoveCard hasApplied={hasActivePursuit} topGapSkill={topGapSkill} />
            {token ? <NextSteps token={token} credibleJobId={credibleJobId} credibleJobSaved={credibleJobSaved} tailored /> : null}
            <SectionGate
                // Hold the jobs skeleton until the hero has also resolved, so a
                // fast-but-empty jobs result never sits beside a still-loading
                // hero (the half-skeleton / half-"No matches" jolt). The above-
                // the-fold then fills as one coherent block, ADR-0011 intent
                // preserved (sections still stream; we only gate the *empty* race).
                loading={coreLoading || (!!token && jobsLoading)}
                error={token && jobsIsError ? jobsErr : null}
                onRetry={() => void refetchJobs()}
                errorLabel="job matches"
                fallback={
                  <TealField mode="masked" interactive={false}>
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
                    newJobsCount={jobsData?.new_jobs_count ?? 0}
                    initialJobId={urlJobId}
                    steps={steps}
                    onStatus={(jobId, status) => appStatus.setStatus(jobId, status)}
                    onRemove={handleRemove}
                    onSkillToggle={handleSkillToggle}
                    onManualAdded={() => queryClient.invalidateQueries({ queryKey: dataKeys.applications() })}
                  />
                ) : null}
            </SectionGate>
            </div>
          </div>
        </PageShell>
      </RequiresCV>

      {/* Consent + targeting gate for "Refresh matches" — opened via refreshGateStore. */}
      <MatchRefreshGate
        token={token}
        profile={profile}
        onRun={() => refreshVm.refresh()}
      />
      {pendingDismissal && token ? <NotInterestedUndo kind="skipped" jobId={pendingDismissal} token={token} surface="dashboard" onUndo={undoRemove} /> : null}
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
