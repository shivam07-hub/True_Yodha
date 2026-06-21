"use client"

// Self-contained "Good morning" hero block — greeting + daily-loop ring +
// score/streak/sessions. Owns ALL its own data so any page can drop it in
// without coupling to dashboard internals (it relocated off /home onto /market,
// where Live is now the primary daily surface). React Query dedups the shared
// keys (scores/jobs/applications/…) so mounting it beside another consumer
// costs nothing.

import "@/app/(authed)/home/mission-control.css"

import { useMemo } from "react"
import { formatDate } from "@/lib/format"
import { useQuery } from "@tanstack/react-query"
import { Hero } from "@/components/mission-control/hero"
import type { LoopStep } from "@/components/mission-control/loop-ring"
import { HeroLoading } from "@/components/mission-control/hero-loading"
import { MobileBanner } from "@/components/home/mobile-banner"
import { MobileBannerLoading } from "@/components/home/mobile-banner-loading"
import { SectionGate } from "@/components/loading/section-gate"
import { TealField } from "@/components/loading/teal-field"
import { cv, diary, jobs, scores, upskilling, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreakFromDates } from "@/lib/forge-helpers"
import { useHomeBootstrap } from "@/lib/hooks/use-home-bootstrap"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import { useViewport } from "@/mobile"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

/** The greeting hero — desktop = pinned rail, mobile = thin banner. */
export function MissionHeroRail({ token }: { token: string | null }) {
  const { isDesktop } = useViewport()

  // One BFF round-trip seeds the leaves; each leaf falls back to its own fetch
  // on bootstrap error (same contract as /home).
  const bootstrap = useHomeBootstrap(token)
  const settled = bootstrap.settled

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token && settled,
    staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token && settled,
    staleTime: MATCHES_TTL,
  })
  const { data: applications } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
  })
  const historyQuery = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token!),
    enabled: !!token && settled,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
  })
  const practiceActivityQuery = useQuery({
    queryKey: ["practice-activity-dates", token],
    queryFn: () => upskilling.activityDates(token!),
    enabled: !!token && settled,
    staleTime: 5 * 60 * 1000,
  })

  // ── Derivations (faithful to the former /home hero)
  const apps = useMemo(() => applications ?? [], [applications])
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const topJobs = useMemo(() => (jobsData?.jobs ?? []).slice(0, 5), [jobsData])

  const firstName = profile?.full_name?.split(" ")[0] ?? "there"
  const dayStr = useMemo(
    () => formatDate(new Date(), "weekday"),
    [],
  )
  const dateLine = [dayStr, profile?.target_location].filter(Boolean).join(" · ")
  const activeTargets = apps.filter((a) =>
    ["saved", "applied", "screening", "interviewing", "final_round"].includes(a.status),
  ).length
  const loggedToday = entries.length > 0 && entries[0].log_date === new Date().toISOString().slice(0, 10)
  const hasApplied = apps.some((a) => a.status !== "saved")
  const hasForged = entries.length > 0
  const score = Math.round(scoreData?.total_score ?? 0)
  const streak = computeStreakFromDates(practiceActivityQuery.data?.dates ?? [])
  const scoreDelta = evidenceData?.score_delta ?? 0

  const steps: LoopStep[] = [
    { label: "Find Job", done: topJobs.length > 0, icon: "target", href: "/market" },
    { label: "Practice", done: hasForged, icon: "forge", href: "/forge" },
    { label: "Log", done: loggedToday, icon: "diary" },
    { label: "Level Up", done: scoreDelta > 0, icon: "star", href: "/skills" },
    { label: "Apply", done: hasApplied, icon: "arrowRight", href: "/market" },
  ]

  const coreLoading = !settled || scoreLoading || profileLoading

  return (
    <SectionGate
      loading={coreLoading}
      fallback={
        <TealField mode="masked" interactive={false}>
          {isDesktop ? <HeroLoading /> : <MobileBannerLoading />}
        </TealField>
      }
      slowText="Still loading your dashboard…"
    >
      {isDesktop ? (
        <Hero
          variant="rail"
          name={firstName}
          dateLine={dateLine}
          activeTargets={activeTargets}
          steps={steps}
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
          sessions={entries.length}
        />
      )}
    </SectionGate>
  )
}
