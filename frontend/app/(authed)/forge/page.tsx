"use client"

import "./practice.css"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { ForgeSkeleton } from "@/components/loading/page-skeletons"
import { PracticeSkillList } from "@/components/skills/practice-skill-list"
import { ViewTriadToggle } from "@/components/ui/view-triad-toggle"
import type { TriadView } from "@/lib/views/triad"
import { SkillIntelHeader } from "@/components/skills/skill-intel-header"
import { SkillMapTab } from "@/components/skills/skill-map-tab"
import { SkillAuditView } from "@/components/skills/skill-audit-view"
import { jobs, scores, users, xp } from "@/lib/api"
import type { SkillGapResponse, UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { buildPracticeSkills } from "@/lib/practice-skills"
import { applySkillFilter, DEFAULT_SKILL_FILTER, type SkillFilterState } from "@/lib/skill-filter"
import { buildDomainEntries, skillIntelStats } from "@/lib/skill-domains"
import { forgeProgressRatio } from "@/lib/forge-progress"
import { useAuth } from "@/lib/hooks/use-auth"
import { useForgeSession } from "@/lib/hooks/use-forge-session"
import { sessionsForGap } from "@/lib/level-thresholds"
import { FORGE_AMBIENT_DURATION, useForgeTimerStore } from "@/store/forgeTimerStore"

const DIAL_SIZE = 224
const DIAL_R = 96
const DIAL_C = 2 * Math.PI * DIAL_R
const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

function sessionEstimate(from: number, to: number): number {
  return Math.max(1, sessionsForGap(from, to))
}

interface HeroSkill {
  skill_name: string
  level_from: number
  level_to: number
  skill_id?: string | null
}

function ForgePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const {
    sessionActive, skillName, remaining, running, dismissed, startSession, setRunning, resetSession,
  } = useForgeTimerStore()

  const forgeSession = useForgeSession({ sessionType: "ambient" })

  const [selectedSkill, setSelectedSkill] = useState<HeroSkill | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [skillFilter, setSkillFilter] = useState<SkillFilterState>(DEFAULT_SKILL_FILTER)

  const skillParam = searchParams.get("skill")
  const domainParam = searchParams.get("domain")
  const viewParam = searchParams.get("view")

  // Intel (the skills list) leads — the page's primary job per ADR-0019. URL is
  // the source of truth: ?view / ?domain / ?skill override. No localStorage
  // sticky (TRIAD_STICKY.skills = false) — never strand intent on a detour.
  const view: TriadView =
    skillParam ? "intel"
      : domainParam ? "map"
        : viewParam === "map" || viewParam === "audit" ? viewParam
          : "intel"

  const setView = useCallback((next: TriadView) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "intel") params.delete("view")
    else params.set("view", next)
    params.delete("domain")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])

  useEffect(() => {
    if (!skillParam) return
    setSelectedSkill({ skill_name: skillParam, level_from: 0, level_to: 1 })
  }, [skillParam])

  // Auto-resume the last forged skill on entry (Practice tab only).
  useEffect(() => {
    if (!token || !ready) return
    if (sessionActive || skillParam) return
    let cancelled = false
    xp.lastForgedSkill(token)
      .then((res) => {
        if (cancelled || !res?.skill_name) return
        startSession({ skill_name: res.skill_name, skill_id: res.skill_id })
      })
      .catch(() => { /* first-time users have no last skill */ })
    return () => { cancelled = true }
  }, [token, ready, sessionActive, skillParam, startSession])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(), queryFn: () => jobs.matches(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const topJobs = useMemo(() => (jobsData?.jobs ?? []).slice(0, 5), [jobsData])
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
  const { data: userSkills, isLoading: skillsLoading } = useQuery({
    queryKey: dataKeys.userSkills(), queryFn: () => users.mySkills(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(), queryFn: () => scores.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000, retry: false,
  })
  const { data: profile } = useQuery({
    queryKey: ["users-me", token], queryFn: () => users.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })

  const jobGaps = jobGapQueries
    .map((query) => query.data)
    .filter((gap): gap is SkillGapResponse => !!gap)
  const practiceSkills = useMemo(
    () => buildPracticeSkills(userSkills, jobGaps, skillDemand),
    [userSkills, jobGaps, skillDemand],
  )

  const filteredSkills = useMemo(
    () => applySkillFilter(practiceSkills, skillFilter),
    [practiceSkills, skillFilter],
  )
  const practiceTotal = practiceSkills.owned.length + practiceSkills.gaps.length

  const skills = userSkills ?? EMPTY_SKILLS
  const domainEntries = useMemo(() => buildDomainEntries(skills), [skills])
  const domainNames = useMemo(() => domainEntries.map((d) => d.domain).sort(), [domainEntries])
  const stats = useMemo(
    () => (scoreData ? skillIntelStats(skills, domainEntries) : null),
    [scoreData, skills, domainEntries],
  )
  const allSkills = useMemo(() => Object.values(skills.by_domain).flat(), [skills])
  const totalScore = scoreData ? Math.round(scoreData.total_score) : null

  const firstSkill = practiceSkills.owned[0] ?? null
  const firstGap = practiceSkills.gaps[0] ?? null
  useEffect(() => {
    if (selectedSkill || sessionActive) return
    if (firstSkill) {
      setSelectedSkill({ skill_name: firstSkill.item.display_name, level_from: firstSkill.item.level, level_to: firstSkill.targetLevel })
    } else if (firstGap) {
      setSelectedSkill({ skill_name: firstGap.skill_name, level_from: 0, level_to: firstGap.levelTo })
    }
  }, [firstSkill, firstGap, selectedSkill, sessionActive])

  const activeSessionName = skillName ?? selectedSkill?.skill_name ?? null
  const progress = forgeProgressRatio(FORGE_AMBIENT_DURATION, remaining)
  const dashOffset = DIAL_C * (1 - progress)
  const readyXP = forgeSession.pendingXp
  const canClaim = forgeSession.canClaim && !!activeSessionName
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`

  async function handleClaim() {
    if (!activeSessionName || !canClaim || forgeSession.claiming) return
    try {
      await forgeSession.claim({
        onClaimed: (result) => {
          setToast(`+${result.xp_earned} tokens · practice logged`)
          queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
          queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
          queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
        },
      })
    } catch { /* claimError surfaced inline */ }
  }

  function handlePractice(name: string, levelFrom: number, levelTo: number) {
    setSelectedSkill({ skill_name: name, level_from: levelFrom, level_to: levelTo })
    startSession({ skill_name: name })
    setToast(`Practicing · ${name}`)
    if (view !== "intel") setView("intel")
  }

  function handleToggleTimer() {
    if (!sessionActive) {
      if (selectedSkill) handlePractice(selectedSkill.skill_name, selectedSkill.level_from, selectedSkill.level_to)
      return
    }
    setRunning(!running)
  }

  // Stop a session without claiming. Forfeits any unclaimed tokens, so guard it
  // behind a confirm only when there's something to lose.
  function attemptEnd() {
    if (forgeSession.claiming) return
    if (readyXP > 0) {
      setRunning(false)
      setConfirmEnd(true)
      return
    }
    endSession()
  }

  function endSession() {
    setConfirmEnd(false)
    resetSession()
    setSelectedSkill(null)
    setToast("Session ended")
  }

  if (!ready || scoreLoading) return <ForgeSkeleton />

  return (
    <>
      {toast && <div className="tm-pr-toast" role="status">{toast}</div>}

      {confirmEnd && (
        <div className="tm-pr-end-scrim" role="dialog" aria-modal="true" aria-label="End session" onClick={() => setConfirmEnd(false)}>
          <div className="tm-pr-end-card" onClick={(e) => e.stopPropagation()}>
            <div className="tm-pr-end-title">End session — forfeit tokens?</div>
            <div className="tm-pr-end-body">You&apos;ll lose the +{readyXP} tokens built this session.</div>
            <div className="tm-pr-end-actions">
              <button type="button" className="tm-pr-btn tm-pr-btn-primary tm-control-focus" onClick={() => setConfirmEnd(false)}>
                Keep going
              </button>
              <button type="button" className="tm-pr-btn-end tm-control-focus" onClick={endSession}>
                End session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Practice absorbed Skills (Map/Audit tabs) — gate with the skills
          surface so no-CV users get the domain teaser, not the generic invite. */}
      <RequiresCV surface="skills">
        <div className="tm-page-enter tm-pr-page">
          <SkillIntelHeader
            totalScore={totalScore}
            ninjaName={profile?.ninja_name}
            stats={stats}
            domains={domainNames}
            filter={skillFilter}
            onFilterChange={setSkillFilter}
          />

          <ViewTriadToggle
            page="skills"
            value={view}
            onChange={setView}
            ariaLabel="Skill view"
            live={sessionActive && running ? "intel" : undefined}
          />

          {view === "intel" && (
            <>
              <section className="tm-pr-hero">
                <div className="tm-pr-dial-wrap">
                  <div className="tm-pr-dial" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
                    {running && !dismissed && <span aria-hidden className="tm-pr-dial-breath" />}
                    <svg width={DIAL_SIZE} height={DIAL_SIZE} viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} style={{ position: "relative", overflow: "visible" }}>
                      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_R} fill="rgba(5,10,24,0.28)" stroke="var(--tm-border-soft)" strokeWidth="2" />
                      <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_R} fill="none" stroke="var(--tm-int-bg-wash)" strokeWidth="14" />
                      <circle
                        cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_R} fill="none"
                        stroke="var(--tm-interactive)" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={DIAL_C} strokeDashoffset={dashOffset}
                        transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
                        style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 300ms var(--tm-ease)", filter: "drop-shadow(0 0 8px var(--tm-int-bg-hover))" }}
                      />
                    </svg>
                    <div className="tm-pr-dial-center">
                      <div className="tm-pr-dial-xp">+{readyXP}</div>
                      <div className="tm-pr-dial-xplbl">Tokens ready</div>
                      <div className="tm-pr-dial-clock">{clock}</div>
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="tm-pr-hero-now">
                    <span className={`tm-pr-hero-dot${running ? " is-running" : ""}`} />
                    {running ? "Practicing" : sessionActive ? "Paused" : "Ready"}
                  </div>
                  <h2 className="tm-pr-hero-name">{activeSessionName ?? "Choose a skill to practice"}</h2>
                  <p className="tm-pr-hero-meta">
                    {selectedSkill
                      ? `L${selectedSkill.level_from} → L${selectedSkill.level_to} · ${sessionEstimate(selectedSkill.level_from, selectedSkill.level_to)} sessions estimated`
                      : "Skills from your CV and job gaps appear below."}
                  </p>
                  <div className="tm-pr-hero-btns">
                    <button type="button" className={`tm-pr-btn tm-control-focus${running ? "" : " tm-pr-btn-primary"}`}
                      onClick={handleToggleTimer} disabled={!selectedSkill && !sessionActive}>
                      {running ? "Pause" : sessionActive ? "Resume" : "Start practice"}
                    </button>
                    <button type="button" className="tm-pr-btn tm-pr-btn-claim tm-control-focus"
                      onClick={handleClaim} disabled={!canClaim || forgeSession.claiming}>
                      {forgeSession.claiming ? "Saving..." : `Claim +${readyXP} tokens`}
                    </button>
                    {sessionActive && (
                      <button type="button" className="tm-pr-btn-end tm-control-focus"
                        onClick={attemptEnd} disabled={forgeSession.claiming}>
                        End session
                      </button>
                    )}
                  </div>
                  {forgeSession.claimError && (
                    <div className="tm-pr-hero-err">Could not save practice session. Try again in a moment.</div>
                  )}
                </div>
              </section>

              {token && (
                skillsLoading ? (
                  <div className="tm-pr-skills"><div className="tm-pr-empty">Loading your skills…</div></div>
                ) : (
                  <PracticeSkillList
                    token={token}
                    skills={filteredSkills}
                    totalCount={practiceTotal}
                    activeSkillName={activeSessionName}
                    onPractice={handlePractice}
                    filter={skillFilter}
                    onFilterChange={setSkillFilter}
                  />
                )
              )}
            </>
          )}

          {view === "map" && (
            <SkillMapTab userSkills={skills} initialDomain={domainParam} onPractice={handlePractice} />
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
