"use client"

import "./mission-control.css"

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { FirstRunHero } from "@/components/home/first-run-hero"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { Hero } from "@/components/mission-control/hero"
import { HomeSkeleton } from "@/components/mission-control/hero-skeleton"
import { Topbar } from "@/components/mission-control/topbar"
import { MatchesRows, type ChipJob, type SelfChip } from "@/components/mission-control/matches-rows"
import { FocusedJob } from "@/components/mission-control/focused-job"
import { Icon } from "@/components/mission-control/icons"
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

interface Section {
  id: string
  jobId: string
  isNew: boolean
}

interface ToastState {
  message: string
  key: number
}

function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = (message: string) => setToast({ message, key: Date.now() })
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])
  return { toast, show }
}

function MissionControlInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { toast } = useToast()
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

  // ── Loop state — array of focused-job sections. Initial section seeded from URL or top job.
  const urlJobId = searchParams.get("jobId")
  const [sections, setSections] = useState<Section[]>([])
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const hasSeeded = useRef(false)

  useEffect(() => {
    if (hasSeeded.current) return
    const seedId = urlJobId ?? topJobs[0]?.job_id ?? null
    if (!seedId) return
    if (!allMatchedJobs.find((j) => j.job_id === seedId)) return
    hasSeeded.current = true
    setSections([{ id: "init", jobId: seedId, isNew: false }])
  }, [urlJobId, topJobs, allMatchedJobs])

  const currentActiveId = sections.length > 0 ? sections[sections.length - 1].jobId : null

  const handlePick = useCallback(
    (jobId: string) => {
      const job = allMatchedJobs.find((j) => j.job_id === jobId)
      if (!job) return
      setSections((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.jobId === jobId) return prev
        const newId = `s-${Date.now()}`
        const next = [...prev.map((s) => ({ ...s, isNew: false })), { id: newId, jobId, isNew: true }]
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = sectionRefs.current[newId]
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
          })
        })
        return next
      })
    },
    [allMatchedJobs],
  )

  // ── Build chip lists from real data.
  const selfFocusApps = useMemo(() => apps.filter((a) => a.source === "user_discovery"), [apps])

  const myroChips: ChipJob[] = useMemo(
    () =>
      topJobs.map((j) => ({
        id: j.job_id,
        label: j.company ?? j.title ?? "Role",
        fit: Math.round(j.overlap_score),
      })),
    [topJobs],
  )

  const selfChips: SelfChip[] = useMemo(
    () =>
      selfFocusApps.map((a) => {
        const j = allMatchedJobs.find((x) => x.job_id === a.job_id)
        return {
          id: a.job_id,
          label: a.company ?? a.title ?? "Role",
          fit: j ? Math.round(j.overlap_score) : null,
        }
      }),
    [selfFocusApps, allMatchedJobs],
  )

  // ── Mutations
  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })
  const removeSelfFocus = useMutation({
    mutationFn: (jobId: string) => jobs.removeTrackerJob(token!, jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }),
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
  const primaryJob = sections.length > 0 ? allMatchedJobs.find((j) => j.job_id === sections[sections.length - 1].jobId) : topJobs[0]
  const firstMissing = primaryJob?.matched_skills?.length ? null : "Product Family Engineering"

  const checkpoints = [
    { label: "Find Job", done: topJobs.length > 0 },
    { label: "Practice", done: hasForged },
    { label: "Log", done: loggedToday },
    { label: "Level Up", done: (evidenceData?.score_delta ?? 0) > 0 },
    { label: "Apply", done: hasApplied },
  ]

  const nextMoves = useMemo(() => {
    const moves: Array<{
      icon: "forge" | "cv" | "diary"
      title: string
      meta: string
      reward: string
      href?: string
      onClick?: () => void
      primary?: boolean
    }> = []
    if (primaryJob) {
      moves.push({
        icon: "cv",
        title: `Tailor CV for ${primaryJob.company ?? primaryJob.title}`,
        meta: `Boost match → +18 Fit potential`,
        reward: "+18 Fit",
        href: `/cv?jobId=${primaryJob.job_id}`,
        primary: true,
      })
    }
    if (!hasForged || cartSkills.length > 0) {
      const seedSkill = cartSkills[0]?.skill_name ?? firstMissing ?? "your next skill"
      moves.push({
        icon: "forge",
        title: `Practice ${seedSkill}`,
        meta: "L0 → L1 · 12 sessions",
        reward: "+30 XP",
        href: "/forge",
      })
    }
    if (!loggedToday) {
      moves.push({
        icon: "diary",
        title: "Log today's session",
        meta: `Streak ${streak} → ${streak + 1} days`,
        reward: "+10 XP",
        onClick: () => router.push("/forge?diary=1"),
      })
    }

    const addIfRoom = (move: (typeof moves)[number]) => {
      if (moves.length >= 3) return
      if (moves.some((m) => m.title === move.title)) return
      moves.push(move)
    }

    addIfRoom({
      icon: "cv",
      title: "Star one company hiring PMs",
      meta: "Builds your heatmap",
      reward: "Open",
      href: "/market",
    })
    addIfRoom({
      icon: "forge",
      title: "Read one skill gap",
      meta: "Open your weakest domain",
      reward: "Live Job Data",
      href: "/skills",
    })
    addIfRoom({
      icon: "diary",
      title: loggedToday ? "Review tracker follow-up" : "Log today's session",
      meta: loggedToday ? `${activeTargets} active target${activeTargets === 1 ? "" : "s"}` : `Streak ${streak} → ${streak + 1} days`,
      reward: loggedToday ? "Track" : "+10 XP",
      href: loggedToday ? "/tracker" : "/forge?diary=1",
    })

    return moves.slice(0, 3)
  }, [primaryJob, hasForged, cartSkills, firstMissing, loggedToday, streak, router, activeTargets])

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

  return (
    <>
      <RequiresCV>
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "var(--z-toast)" as never,
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-int-border)",
            borderRadius: "var(--tm-radius-pill)",
            padding: "10px 20px",
            fontSize: 13,
            color: "var(--tm-interactive)",
            fontWeight: 600,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 12px var(--tm-int-border-soft)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="mc-scope" style={{ overflowY: "auto", height: "100%" }}>
        <div className="mc-page">
          <div className="mc-inner">
            <Topbar
              location={profile?.target_location ?? ""}
              refresh={refreshVm}
              onFeedback={() => openFeedbackHub({})}
              onOpenDiary={() => router.push("/forge?diary=1")}
              cartCount={cartSkills.length}
            />

            <Hero
              name={firstName}
              dateLine={dayStr}
              activeTargets={activeTargets}
              checkpoints={checkpoints}
              nextMoves={nextMoves}
              score={score}
              streak={streak}
              sessions={entries.length}
              diaryEntries={evidenceData?.diary_entries_count ?? entries.length}
            />

            {topJobs.length > 0 && (
              <MatchesRows
                myroFound={myroChips}
                selfFound={selfChips}
                activeId={currentActiveId}
                onPick={handlePick}
                onRemoveSelf={(id) => removeSelfFocus.mutate(id)}
              />
            )}

            {sections.length > 0 ? (
              <button
                type="button"
                className="mc-all-matches tm-control-focus"
                onClick={() => setSections([])}
              >
                <Icon name="arrowLeft" size={12} /> All matches
              </button>
            ) : null}

            {sections.map((s, i) => {
              const job = allMatchedJobs.find((j) => j.job_id === s.jobId)
              if (!job || !token) return null
              const status = appsByJobId[job.job_id] ?? "saved"
              return (
                <div key={s.id}>
                  {i > 0 ? (
                    <div className="mc-loop-divider">
                      <div className="line" />
                      <div className="lbl">
                        Cycle {i + 1} · {job.company ?? job.title}
                      </div>
                      <div className="line" />
                    </div>
                  ) : null}

                  <FocusedJob
                    ref={(el) => {
                      sectionRefs.current[s.id] = el
                    }}
                    job={job}
                    status={status}
                    token={token}
                    isNew={s.isNew}
                    cycleIndex={i + 1}
                    cartSkillNames={cartSkillNames}
                    onStatus={(st) => updateStatus.mutate({ jobId: job.job_id, status: st })}
                    onSkillToggle={handleSkillToggle}
                  />

                  {topJobs.length > 0 ? (
                    <div style={{ marginTop: 32 }}>
                      <div className="mc-loop-eyebrow">↻ Keep the loop going</div>
                      <MatchesRows
                        myroFound={myroChips}
                        selfFound={selfChips}
                        activeId={currentActiveId}
                        onPick={handlePick}
                        onRemoveSelf={(id) => removeSelfFocus.mutate(id)}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}

            {sections.length === 0 && !jobsLoading && topJobs.length === 0 ? (
              <div className="mc-empty">
                <div className="msg">No matches yet — upload your CV then refresh.</div>
                <Link href="/jobs">Go to Matched Jobs →</Link>
              </div>
            ) : null}

            {sections.length > 0 ? (
              <div className="mc-loop-end">
                <span className="arrow">↓</span>
                Click any job to keep the loop going · {sections.length} {sections.length === 1 ? "role" : "roles"} explored
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {sections.length > 1 ? (
        <div className="mc-cycle-indicator">
          <span className="dot" />
          <span>Cycle</span>
          <span className="count">{sections.length}</span>
        </div>
      ) : null}
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
