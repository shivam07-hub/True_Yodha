"use client"

import Link from "next/link"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { ForgeSkeleton } from "@/components/loading/page-skeletons"
import { cv, diary, jobs, scores, users, xp } from "@/lib/api"
import type {
  DiaryEntry,
  Milestone,
  SkillGapResponse,
  UserSkillDemandResponse,
  UserSkillsByDomain,
} from "@/lib/api"
import { dataKeys, invalidateDiaryData } from "@/lib/domain-data"
import { forgeProgressRatio } from "@/lib/forge-progress"
import { useAuth } from "@/lib/hooks/use-auth"
import { useForgeSession } from "@/lib/hooks/use-forge-session"
import { XP_POLICY } from "@/lib/xp-policy"
import { sessionsForGap } from "@/lib/level-thresholds"
import { useCartStore } from "@/store/cartStore"
import { FORGE_AMBIENT_DURATION, useForgeTimerStore } from "@/store/forgeTimerStore"
import { useXPStore } from "@/store/xpStore"
import type { CartSkill } from "@/types/xp"

const DIAL_SIZE = 224
const DIAL_R = 96
const DIAL_C = 2 * Math.PI * DIAL_R

type CandidateTag = "queued" | "job" | "upgrade" | "ready"
type FilterMode = "all" | "queued" | "job" | "upgrade"

interface ForgeCandidate {
  skill_name: string
  level_from: number
  level_to: number
  sources: string[]
  tags: CandidateTag[]
  context: string | null
  demand: number
  jobCount: number
  priority: number
  inCart: boolean
}

function sessionEstimate(from: number, to: number): number {
  return Math.max(1, sessionsForGap(from, to))
}

function normalizeSkillName(value: string): string {
  return value.trim().toLowerCase()
}

function pushUnique<T>(items: T[], value: T) {
  if (!items.includes(value)) items.push(value)
}

function toCartSkill(candidate: ForgeCandidate): CartSkill {
  return {
    skill_name: candidate.skill_name,
    level_from: candidate.level_from,
    level_to: candidate.level_to,
    ...(candidate.context ? { company: candidate.context } : {}),
  }
}

function buildForgeCandidates(
  cartSkills: CartSkill[],
  jobGaps: SkillGapResponse[],
  skillDemand?: UserSkillDemandResponse,
  userSkills?: UserSkillsByDomain,
): ForgeCandidate[] {
  const map = new Map<string, ForgeCandidate>()

  function upsert(input: {
    skill_name: string
    level_from: number
    level_to: number
    source: string
    tag: CandidateTag
    context?: string | null
    demand?: number
    jobCount?: number
    priority: number
    inCart?: boolean
  }) {
    const skill = input.skill_name.trim()
    if (!skill) return
    const key = normalizeSkillName(skill)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        skill_name: skill,
        level_from: Math.max(0, input.level_from),
        level_to: Math.max(input.level_from + 1, input.level_to),
        sources: [input.source],
        tags: [input.tag],
        context: input.context ?? null,
        demand: input.demand ?? 0,
        jobCount: input.jobCount ?? 0,
        priority: input.priority,
        inCart: !!input.inCart,
      })
      return
    }

    existing.level_from = Math.min(existing.level_from, Math.max(0, input.level_from))
    existing.level_to = Math.max(existing.level_to, input.level_to)
    existing.demand = Math.max(existing.demand, input.demand ?? 0)
    existing.jobCount = Math.max(existing.jobCount, input.jobCount ?? 0)
    existing.priority = Math.min(existing.priority, input.priority)
    existing.inCart = existing.inCart || !!input.inCart
    if (!existing.context && input.context) existing.context = input.context
    pushUnique(existing.sources, input.source)
    pushUnique(existing.tags, input.tag)
  }

  cartSkills.forEach((skill) => {
    upsert({
      skill_name: skill.skill_name,
      level_from: skill.level_from,
      level_to: skill.level_to,
      source: "Queued",
      tag: "queued",
      context: skill.company ?? null,
      priority: 0,
      inCart: true,
    })
  })

  jobGaps.forEach((gap) => {
    gap.skills
      .filter((skill) => skill.missing || skill.user_level < skill.required_level)
      .forEach((skill) => {
        upsert({
          skill_name: skill.skill,
          level_from: skill.user_level ?? 0,
          level_to: skill.required_level ?? 1,
          source: gap.company ? `Job gap · ${gap.company}` : "Job gap",
          tag: "job",
          context: gap.company ?? null,
          priority: skill.is_primary ? 1 : 2,
        })
      })
  })

  skillDemand?.skills
    .filter((skill) => skill.needs_upgrade && skill.target_level != null)
    .forEach((skill) => {
      upsert({
        skill_name: skill.display_name || skill.skill,
        level_from: skill.current_level,
        level_to: skill.target_level ?? Math.min(skill.current_level + 1, 5),
        source: "Target upgrade",
        tag: "upgrade",
        demand: skill.weighted_demand,
        jobCount: skill.job_count_30d,
        priority: 3,
      })
    })

  Object.values(userSkills?.by_domain ?? {})
    .flat()
    .filter((skill) => skill.forged_level_up_available)
    .forEach((skill) => {
      upsert({
        skill_name: skill.display_name,
        level_from: skill.level,
        level_to: Math.min(skill.level + 1, 5),
        source: "Ready upgrade",
        tag: "ready",
        priority: 2,
      })
    })

  return Array.from(map.values()).sort((a, b) => {
    if (a.inCart !== b.inCart) return a.inCart ? -1 : 1
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.demand !== b.demand) return b.demand - a.demand
    return a.skill_name.localeCompare(b.skill_name)
  })
}

function ForgePageInner() {
  const { token, ready } = useAuth()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { skills: cartSkills, addSkill, removeSkill, clearCart } = useCartStore()
  const { addBalance } = useXPStore()
  const {
    sessionActive,
    skillName,
    remaining,
    running,
    dismissed,
    startSession,
    setRunning,
  } = useForgeTimerStore()

  // Single source of truth for XP/claim — matches sidebar widget (ambient rate).
  // Immersive Focus Mode (follow-up) will mount a separate surface with sessionType: "focused".
  const forgeSession = useForgeSession({ sessionType: "ambient" })

  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>("all")
  const [diaryRailOpen, setDiaryRailOpen] = useState(() => searchParams.get("diary") === "1")
  const [entryText, setEntryText] = useState("")
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get("diary") === "1") setDiaryRailOpen(true)
  }, [searchParams])

  const skillParam = searchParams.get("skill")
  useEffect(() => {
    if (!skillParam) return
    setSelectedSkill(skillParam)
    if (!cartSkills.some((skill) => normalizeSkillName(skill.skill_name) === normalizeSkillName(skillParam))) {
      addSkill({ skill_name: skillParam, level_from: 0, level_to: 1 })
    }
  }, [addSkill, cartSkills, skillParam])

  // Auto-resume the last forged skill on entry so the user can keep moving
  // without picking again. Only fires when no session is active and no ?skill=
  // override is present — explicit user choices win.
  useEffect(() => {
    if (!token || !ready) return
    if (sessionActive || skillParam) return
    let cancelled = false
    xp.lastForgedSkill(token)
      .then((res) => {
        if (cancelled || !res?.skill_name) return
        startSession({ skill_name: res.skill_name, skill_id: res.skill_id })
      })
      .catch(() => { /* silent — first-time users have no last skill */ })
    return () => { cancelled = true }
  }, [token, ready, sessionActive, skillParam, startSession])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const topJobs = useMemo(() => (jobsData?.jobs ?? []).slice(0, 5), [jobsData])
  const jobGapQueries = useQueries({
    queries: topJobs.map((job) => ({
      queryKey: dataKeys.skillGap(job.job_id),
      queryFn: () => jobs.skillGap(token!, job.job_id),
      enabled: !!token && !!job.job_id,
      staleTime: 10 * 60 * 1000,
    })),
  })
  const { data: skillDemand } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: userSkills } = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: history } = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token!),
    enabled: !!token,
  })
  const { data: milestones } = useQuery({
    queryKey: dataKeys.milestones(),
    queryFn: () => diary.milestones(token!),
    enabled: !!token,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const jobGaps = jobGapQueries
    .map((query) => query.data)
    .filter((gap): gap is SkillGapResponse => !!gap)
  const candidates = buildForgeCandidates(cartSkills, jobGaps, skillDemand, userSkills)
  const firstCandidateName = candidates[0]?.skill_name ?? null

  useEffect(() => {
    if (!selectedSkill && firstCandidateName) setSelectedSkill(firstCandidateName)
  }, [firstCandidateName, selectedSkill])

  const selectedCandidate = candidates.find((candidate) => candidate.skill_name === selectedSkill) ?? candidates[0] ?? null
  const activeSessionName = skillName ?? selectedCandidate?.skill_name ?? null
  const progress = forgeProgressRatio(FORGE_AMBIENT_DURATION, remaining)
  const dashOffset = DIAL_C * (1 - progress)
  const readyXP = forgeSession.pendingXp
  const canClaim = forgeSession.canClaim && !!activeSessionName
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
  const entries = (history?.entries ?? []) as DiaryEntry[]
  const milestoneRows = (milestones?.milestones ?? []) as Milestone[]
  const completedMilestones = milestoneRows.filter((milestone) => milestone.completed_at).length

  const filteredCandidates = candidates.filter((candidate) => {
    if (filter === "all") return true
    if (filter === "queued") return candidate.inCart
    if (filter === "job") return candidate.tags.includes("job")
    return candidate.tags.includes("upgrade") || candidate.tags.includes("ready")
  })

  async function handleClaim() {
    if (!activeSessionName || !canClaim || forgeSession.claiming) return
    try {
      await forgeSession.claim({
        onClaimed: (result) => {
          setToast(`+${result.xp_earned} XP · practice logged`)
          queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
          queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
          queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
        },
      })
    } catch {
      // Hook exposes claimError; toast handles success path.
    }
  }

  const saveEntry = useMutation({
    mutationFn: async (payload: { text: string; cart: CartSkill[] }) => {
      if (!token) throw new Error("Sign in first.")
      return diary.createEntry(token, payload.text, undefined, payload.cart.map((skill) => ({ ...skill })))
    },
    onSuccess: () => {
      addBalance(XP_POLICY.diaryEntry)
      clearCart()
      setEntryText("")
      setToast(`+${XP_POLICY.diaryEntry} XP · diary logged`)
      invalidateDiaryData(queryClient)
    },
  })

  function handleStart(candidate: ForgeCandidate) {
    const skill = toCartSkill(candidate)
    addSkill(skill)
    setSelectedSkill(candidate.skill_name)
    startSession(skill)
    setToast(`Practicing · ${candidate.skill_name}`)
  }

  function handleToggleTimer() {
    if (!sessionActive) {
      if (selectedCandidate) handleStart(selectedCandidate)
      return
    }
    setRunning(!running)
  }

  function handleDiarySubmit() {
    const text = entryText.trim()
    if (!text || saveEntry.isPending) return
    saveEntry.mutate({ text, cart: cartSkills })
  }

  if (!ready || scoreLoading) return <ForgeSkeleton />

  return (
    <>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: "var(--z-toast)" as never, background: "var(--tm-surface-2)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-pill)", padding: "10px 18px", fontSize: 13, color: "var(--tm-interactive)", fontWeight: 700, boxShadow: "0 10px 34px rgba(0,0,0,0.36), 0 0 18px var(--tm-int-border-soft)", pointerEvents: "none" }}>
          {toast}
        </div>
      )}

      <RequiresCV>
      <div className="tm-page-enter" style={{ minHeight: "100%", padding: "var(--tm-page-py) var(--tm-page-px)", display: "flex", flexDirection: "column", gap: 18 }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div>
            <button
              type="button"
              onClick={() => {
                if (!sessionActive) {
                  const skill = selectedCandidate ?? candidates[0]
                  if (skill) startSession(toCartSkill(skill))
                  return
                }
                setRunning(!running)
              }}
              aria-label={
                !sessionActive ? "Start practice session"
                : running ? "Pause practice session"
                : "Resume practice session"
              }
              style={{
                margin: 0, padding: 0, background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: "var(--tm-font-display)",
                fontSize: 44, lineHeight: 1, fontWeight: 500, color: "var(--tm-text)",
                letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: 12,
              }}
            >
              Practice
              <span aria-hidden style={{
                fontFamily: "var(--tm-font-mono)", fontSize: 13, fontWeight: 600,
                padding: "3px 9px", borderRadius: 999,
                background: !sessionActive
                  ? "rgba(255,255,255,0.04)"
                  : running ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.06)",
                color: !sessionActive
                  ? "var(--tm-text-faint)"
                  : running ? "var(--tm-interactive)" : "var(--tm-text-muted)",
                border: `1px solid ${running && sessionActive ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                {!sessionActive ? "Tap to start" : running ? "Running" : "Paused"}
              </span>
            </button>
            <div style={{ marginTop: 9, fontFamily: "var(--tm-font-mono)", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              Diary · cart · milestone
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/home" style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", textDecoration: "none", fontSize: 13, fontWeight: 650 }}>
              Tackle Today
            </Link>
            <button
              type="button"
              className="tm-control-focus"
              onClick={() => setDiaryRailOpen((open) => !open)}
              style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 14px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: diaryRailOpen ? "var(--tm-int-bg-wash)" : "transparent", color: diaryRailOpen ? "var(--tm-interactive)" : "var(--tm-text-muted)", fontSize: 13, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}
            >
              <IconDiary />
              Diary + cart
              {cartSkills.length > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 99, display: "inline-grid", placeItems: "center", padding: "0 5px", background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)", fontFamily: "var(--tm-font-mono)", fontSize: 10, fontWeight: 800 }}>
                  {cartSkills.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <div className="tm-forge-layout" data-diary={diaryRailOpen ? "open" : "closed"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <section className="tm-forge-stage" style={{ border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", background: "linear-gradient(180deg, var(--tm-int-bg-subtle), var(--tm-surface) 42%)", padding: 24, display: "grid", gridTemplateColumns: "minmax(260px, 0.9fr) minmax(280px, 1.1fr)", gap: 24, alignItems: "center", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ position: "relative", width: DIAL_SIZE, height: DIAL_SIZE, display: "grid", placeItems: "center" }}>
                  {running && !dismissed && (
                    <span aria-hidden className="tm-forge-breath" style={{ position: "absolute", inset: 6, borderRadius: "50%", background: "radial-gradient(circle, var(--tm-int-bg-wash), transparent 68%)", animation: "forge-breath 4.4s ease-in-out infinite" }} />
                  )}
                  <svg width={DIAL_SIZE} height={DIAL_SIZE} viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} style={{ position: "relative", overflow: "visible" }}>
                    <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_R} fill="rgba(5,10,24,0.28)" stroke="var(--tm-border-soft)" strokeWidth="2" />
                    <circle cx={DIAL_SIZE / 2} cy={DIAL_SIZE / 2} r={DIAL_R} fill="none" stroke="var(--tm-int-bg-wash)" strokeWidth="14" />
                    <circle
                      cx={DIAL_SIZE / 2}
                      cy={DIAL_SIZE / 2}
                      r={DIAL_R}
                      fill="none"
                      stroke="var(--tm-interactive)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={DIAL_C}
                      strokeDashoffset={dashOffset}
                      transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
                      style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 300ms var(--tm-ease)", filter: "drop-shadow(0 0 8px var(--tm-int-bg-hover))" }}
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
                    <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 58, lineHeight: 0.95, fontWeight: 800, color: "var(--tm-interactive)", letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                      +{readyXP}
                    </div>
                    <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                      XP ready
                    </div>
                    <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 18, color: "var(--tm-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {clock}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10, fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: running ? "var(--tm-interactive)" : "var(--tm-text-faint)", boxShadow: running ? "0 0 8px var(--tm-int-bg-hover)" : "none" }} />
                    {running ? "Practicing" : sessionActive ? "Paused" : "Ready"}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 26, lineHeight: 1.15, fontWeight: 750, color: "var(--tm-text)", letterSpacing: 0 }}>
                    {activeSessionName ?? "Choose a skill to practice"}
                  </h2>
                  <p style={{ margin: "8px 0 0", color: "var(--tm-text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                    {selectedCandidate
                      ? `L${selectedCandidate.level_from} → L${selectedCandidate.level_to} · ${sessionEstimate(selectedCandidate.level_from, selectedCandidate.level_to)} sessions estimated`
                      : "Skills from job gaps and target upgrades will appear here."}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="tm-control-focus"
                    onClick={handleToggleTimer}
                    disabled={!selectedCandidate && !sessionActive}
                    style={{ height: 42, padding: "0 18px", borderRadius: 999, border: running ? "1px solid var(--tm-border-soft)" : "1px solid var(--tm-interactive)", background: running ? "rgba(255,255,255,0.04)" : "var(--tm-interactive)", color: running ? "var(--tm-text-muted)" : "var(--tm-interactive-fg)", cursor: selectedCandidate || sessionActive ? "pointer" : "default", fontFamily: "inherit", fontSize: 14, fontWeight: 750 }}
                  >
                    {running ? "Pause" : sessionActive ? "Resume" : "Start practice"}
                  </button>
                  <button
                    type="button"
                    className="tm-control-focus"
                    onClick={handleClaim}
                    disabled={!canClaim || forgeSession.claiming}
                    style={{ height: 42, padding: "0 18px", borderRadius: 999, border: canClaim ? "1px solid var(--tm-int-border)" : "1px dashed var(--tm-border-soft)", background: canClaim ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.03)", color: canClaim ? "var(--tm-interactive)" : "var(--tm-text-faint)", cursor: canClaim && !forgeSession.claiming ? "pointer" : "default", fontFamily: "inherit", fontSize: 14, fontWeight: 750 }}
                  >
                    {forgeSession.claiming ? "Saving..." : `Claim +${readyXP} XP`}
                  </button>
                  <button
                    type="button"
                    className="tm-control-focus"
                    onClick={() => setDiaryRailOpen(true)}
                    style={{ height: 42, padding: "0 18px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 650 }}
                  >
                    Log proof
                  </button>
                </div>
                {forgeSession.claimError && (
                  <div style={{ color: "var(--tm-danger)", fontSize: 12 }}>
                    Could not save practice session. Try again in a moment.
                  </div>
                )}
              </div>
            </section>

            <section style={{ border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", background: "var(--tm-surface)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="tm-label-caps" style={{ marginBottom: 5 }}>Skills to practice</div>
                  <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
                    {candidates.length} upgrade targets · {cartSkills.length} queued
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
                  <FilterButton active={filter === "queued"} onClick={() => setFilter("queued")}>Queued</FilterButton>
                  <FilterButton active={filter === "job"} onClick={() => setFilter("job")}>Job gaps</FilterButton>
                  <FilterButton active={filter === "upgrade"} onClick={() => setFilter("upgrade")}>Upgrades</FilterButton>
                </div>
              </div>

              {filteredCandidates.length === 0 ? (
                <div style={{ minHeight: 180, borderRadius: "var(--tm-radius)", border: "1.5px dashed var(--tm-border-soft)", display: "grid", placeItems: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
                  No upgrade targets in this view.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredCandidates.map((candidate) => {
                    const selected = candidate.skill_name === selectedCandidate?.skill_name
                    return (
                      <div key={candidate.skill_name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 10, alignItems: "center", padding: "12px 12px", borderRadius: "var(--tm-radius-sm)", border: `1px solid ${selected ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`, background: selected ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.02)" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedSkill(candidate.skill_name)}
                          style={{ minWidth: 0, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 999, background: candidate.inCart ? "var(--tm-interactive)" : candidate.tags.includes("job") ? "var(--tm-danger)" : "var(--tm-warning)", boxShadow: candidate.inCart ? "0 0 7px var(--tm-int-bg-hover)" : "none", flexShrink: 0 }} />
                            <span style={{ color: "var(--tm-text)", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {candidate.skill_name}
                            </span>
                          </div>
                          <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap", color: "var(--tm-text-faint)", fontSize: 11 }}>
                            <span style={{ fontFamily: "var(--tm-font-mono)" }}>L{candidate.level_from} → L{candidate.level_to}</span>
                            <span>{candidate.sources.slice(0, 2).join(" · ")}</span>
                            {candidate.jobCount > 0 && <span>{candidate.jobCount} jobs</span>}
                          </div>
                        </button>
                        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", whiteSpace: "nowrap" }}>
                          {sessionEstimate(candidate.level_from, candidate.level_to)} ses
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="tm-control-focus"
                            onClick={() => candidate.inCart ? removeSkill(candidate.skill_name) : addSkill(toCartSkill(candidate))}
                            style={{ height: 30, padding: "0 10px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: candidate.inCart ? "rgba(74,222,128,0.08)" : "transparent", color: candidate.inCart ? "var(--tm-success)" : "var(--tm-text-muted)", fontSize: 11, fontWeight: 750, fontFamily: "inherit", cursor: "pointer" }}
                          >
                            {candidate.inCart ? "Queued" : "Queue"}
                          </button>
                          <button
                            type="button"
                            className="tm-control-focus"
                            onClick={() => handleStart(candidate)}
                            style={{ height: 30, padding: "0 10px", borderRadius: 999, border: "1px solid var(--tm-interactive)", background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)", fontSize: 11, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
                          >
                            Practice
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="tm-forge-diary-rail" aria-hidden={!diaryRailOpen}>
            <div className="tm-forge-diary-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--tm-border-soft)" }}>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  ◈ Journal
                </div>
                <button
                  type="button"
                  aria-label="Close diary rail"
                  className="tm-control-focus"
                  onClick={() => setDiaryRailOpen(false)}
                  style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.03)", color: "var(--tm-text-faint)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
                <section>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                    Today&apos;s thoughts
                  </div>
                  <textarea
                    value={entryText}
                    onChange={(event) => setEntryText(event.target.value)}
                    placeholder="Vent, reflect, celebrate — what's going on with your search today?"
                    style={{ width: "100%", minHeight: 116, resize: "vertical", background: "var(--tm-surface-2)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-sm)", color: "var(--tm-text)", fontSize: 14, lineHeight: 1.65, padding: "12px 14px", fontFamily: "inherit", outline: "none" }}
                  />
                </section>

                <section style={{ borderTop: "1px solid var(--tm-border-soft)", paddingTop: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                    Skill cart · Skills to practice this week
                  </div>
                  {cartSkills.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>No skills in cart — add from gaps below</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {cartSkills.map((skill) => (
                        <div key={skill.skill_name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-int-border)", background: "var(--tm-int-bg-wash)" }}>
                          <span style={{ flex: 1, minWidth: 0, color: "var(--tm-text)", fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{skill.skill_name}</span>
                          <span style={{ color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 10 }}>L{skill.level_from}→L{skill.level_to}</span>
                          <button type="button" aria-label={`Remove ${skill.skill_name}`} onClick={() => removeSkill(skill.skill_name)} style={{ border: "none", background: "transparent", color: "var(--tm-text-faint)", cursor: "pointer", fontSize: 13 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {candidates.filter((candidate) => !candidate.inCart).slice(0, 5).map((candidate) => (
                      <button
                        key={candidate.skill_name}
                        type="button"
                        onClick={() => addSkill(toCartSkill(candidate))}
                        style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.03)", color: "var(--tm-text-faint)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
                      >
                        + {candidate.skill_name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="tm-control-focus"
                    onClick={handleDiarySubmit}
                    disabled={!entryText.trim() || saveEntry.isPending}
                    style={{ width: "100%", height: 48, marginTop: 16, borderRadius: "var(--tm-radius)", border: "none", background: entryText.trim() ? "var(--tm-interactive)" : "rgba(255,255,255,0.06)", color: entryText.trim() ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)", cursor: entryText.trim() && !saveEntry.isPending ? "pointer" : "default", fontFamily: "inherit", fontSize: 14, fontWeight: 800 }}
                  >
                    {saveEntry.isPending ? "Saving..." : `Log entry · earn +${XP_POLICY.diaryEntry} XP`}
                  </button>
                </section>

                <section style={{ borderTop: "1px solid var(--tm-border-soft)", paddingTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Milestones</div>
                    <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)" }}>{completedMilestones}/{Math.max(milestoneRows.length, 1)}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <MilestonePill active={!!scoreData}>CV Analysed</MilestonePill>
                    <MilestonePill active={!!scoreData}>Score Computed</MilestonePill>
                    <MilestonePill active={entries.length > 0}>First Entry</MilestonePill>
                    <MilestonePill active={(evidenceData?.skill_upgrades_count ?? 0) > 0}>Gap Closed</MilestonePill>
                  </div>
                </section>

                {entries.length > 0 && (
                  <section style={{ borderTop: "1px solid var(--tm-border-soft)", paddingTop: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>Recent entries</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {entries.slice(0, 3).map((entry) => (
                        <div key={entry.id} style={{ padding: "11px 12px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
                          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)", marginBottom: 6 }}>{entry.log_date}</div>
                          <p style={{ margin: 0, color: "var(--tm-text-muted)", fontSize: 13, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as never, overflow: "hidden" }}>
                            {entry.entry_text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
      </RequiresCV>
    </>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="tm-control-focus"
      onClick={onClick}
      style={{ height: 30, padding: "0 11px", borderRadius: 999, border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, background: active ? "var(--tm-interactive)" : "transparent", color: active ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)", cursor: "pointer", fontSize: 12, fontWeight: 750, fontFamily: "inherit" }}
    >
      {children}
    </button>
  )
}

function MilestonePill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 999, border: active ? "1px solid var(--tm-int-border)" : "1px dashed var(--tm-border-soft)", background: active ? "var(--tm-int-bg-wash)" : "transparent", color: active ? "var(--tm-interactive)" : "var(--tm-text-faint)", fontSize: 12, fontWeight: 750 }}>
      {children}
    </span>
  )
}

function IconDiary() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M5 5.5h6M5 8h6M5 10.5h4" />
    </svg>
  )
}

export default function ForgePage() {
  return (
    <Suspense>
      <ForgePageInner />
    </Suspense>
  )
}
