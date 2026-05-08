"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { NextMissionCard } from "@/components/diary/next-mission-card"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { ForgeFocusOverlay, type ForgeCompletionPayload } from "@/components/diary/forge-focus-overlay"
import { cv, diary, jobs, scores, users } from "@/lib/api"
import { buildDiaryPrefill, parseDiarySelections } from "@/lib/diary-skill-cart"
import { dataKeys, invalidateJobPathData } from "@/lib/domain-data"
import type { JobPathMilestone, Milestone, MilestonePayload } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import Link from "next/link"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

// ── Constants ─────────────────────────────────────────────────

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

const STATUS_COLOR: Record<string, string> = {
  pending:      "var(--tm-text-faint)",
  applied:      "var(--tm-accent)",
  interviewing: "var(--tm-success)",
  responded:    "var(--tm-warning)",
  offer:        "#A78BFA",
  rejected:     "var(--tm-danger)",
  no_response:  "var(--tm-text-faint)",
  abandoned:    "var(--tm-text-faint)",
}

const STATUS_LABEL: Record<string, string> = {
  pending:      "Saved",
  applied:      "Applied",
  interviewing: "Interviewing",
  responded:    "Responded",
  offer:        "Offer",
  rejected:     "Rejected",
  no_response:  "No Response",
  abandoned:    "Abandoned",
}

// ── Types ─────────────────────────────────────────────────────

interface SkillDelta { taxonomy_key: string; xp_added: number }
interface DiaryEntry {
  id: string; log_date: string; entry_text: string
  score_before: number | null; score_after: number | null
  skills_delta: SkillDelta[]
}

// ── Helpers ───────────────────────────────────────────────────

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diff === 0) return "today"
  if (diff === 1) return "1d"
  return `${diff}d`
}

function computeStreak(entries: DiaryEntry[]): number {
  const dates = new Set(entries.map((e) => e.log_date))
  let streak = 0
  const d = new Date()
  while (true) {
    const key = d.toISOString().slice(0, 10)
    if (!dates.has(key)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function computeTotalXP(entries: DiaryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.skills_delta.reduce((s, d) => s + d.xp_added, 0), 0)
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getWeekDates(): Date[] {
  const today = new Date()
  const day = today.getDay() === 0 ? 6 : today.getDay() - 1
  const monday = new Date(today)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(today.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(monday)
    next.setDate(monday.getDate() + i)
    return next
  })
}

function scrollForge() {
  document.getElementById("forge-section")?.scrollIntoView({ behavior: "smooth" })
}

// ── ScoreBar ──────────────────────────────────────────────────

function ScoreBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 4, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 99,
        background: color ?? "var(--tm-accent)",
        transition: "width 800ms cubic-bezier(0.16,1,0.3,1)",
        boxShadow: `0 0 6px ${color ?? "var(--tm-accent-glow)"}`,
      }} />
    </div>
  )
}

// ── Deep Focus Timer ──────────────────────────────────────────

const DURATIONS = [
  { label: "25 min", seconds: 25 * 60 },
  { label: "40 min", seconds: 40 * 60 },
  { label: "60 min", seconds: 60 * 60 },
]
const CIRC = 2 * Math.PI * 44

function DeepFocusTimer({ todayTask }: { todayTask: string }) {
  const [durIdx, setDurIdx] = useState(0)
  const [remaining, setRemaining] = useState(DURATIONS[0].seconds)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [sessions, setSessions] = useState(0)

  const duration = DURATIONS[durIdx].seconds
  const progress = remaining / duration
  const dashArray = `${CIRC * progress} ${CIRC}`

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); setRunning(false); setDone(true); setSessions((s) => s + 1); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  function selectDur(idx: number) {
    if (running) return
    setDurIdx(idx); setRemaining(DURATIONS[idx].seconds); setDone(false)
  }

  function reset() { setRunning(false); setRemaining(DURATIONS[durIdx].seconds); setDone(false) }

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0")
  const secs = String(remaining % 60).padStart(2, "0")

  return (
    <div className="tm-card" style={{ backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="tm-label-caps" style={{ marginBottom: 6 }}>Deep Focus</div>
        {todayTask && (
          <div style={{ padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)" }}>
            <span style={{ color: "var(--tm-text-faint)" }}>Today · </span>{todayTask}
          </div>
        )}
      </div>

      {/* Timer ring */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 164, height: 164 }}>
          <svg width={164} height={164} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-border-soft)" strokeWidth={2} />
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-accent-wash)" strokeWidth={6} strokeDasharray={`${CIRC} ${CIRC}`} />
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={dashArray}
              style={{ transition: running ? "stroke-dasharray 1s linear" : "stroke-dasharray 0.4s var(--tm-ease)" }} />
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={dashArray}
              aria-hidden style={{ filter: "drop-shadow(0 0 8px var(--tm-accent-glow))", opacity: running ? 1 : 0, transition: "opacity var(--tm-dur) var(--tm-ease)", pointerEvents: "none" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: done ? 28 : 34, fontWeight: 300, color: done ? "var(--tm-success)" : "var(--tm-text)", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {done ? "✓" : `${mins}:${secs}`}
            </span>
            <span className="tm-label-caps" style={{ fontSize: 9 }}>
              {done ? "Complete" : running ? "Deep Work" : "Ready"}
            </span>
          </div>
        </div>
      </div>

      {/* Duration selector */}
      <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
        {DURATIONS.map((d, i) => (
          <button key={d.label} onClick={() => selectDur(i)} disabled={running} style={{
            padding: "4px 12px", borderRadius: "var(--tm-radius-pill)",
            fontSize: "var(--tm-fs-meta)", fontWeight: 500,
            background: i === durIdx ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${i === durIdx ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
            color: i === durIdx ? "var(--tm-accent)" : "var(--tm-text-faint)",
            cursor: running ? "default" : "pointer", fontFamily: "inherit",
            transition: "all var(--tm-dur) var(--tm-ease)",
            opacity: running && i !== durIdx ? 0.4 : 1,
          }}>{d.label}</button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setRunning((r) => !r)} disabled={done} className="tm-btn tm-btn-primary" style={{ flex: 1, justifyContent: "center", opacity: done ? 0.5 : 1 }}>
          {running ? "⏸ Pause" : done ? "✓ Done" : "▶ Start"}
        </button>
        <button onClick={reset} className="tm-btn tm-btn-ghost" style={{ fontSize: "var(--tm-fs-meta)" }}>↺</button>
      </div>

      {/* Session dots */}
      <div>
        <div className="tm-meta" style={{ marginBottom: 8 }}>Today&apos;s sessions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {Array.from({ length: Math.max(5, sessions + 1) }).map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i < sessions ? "var(--tm-accent)" : "var(--tm-border-soft)",
              boxShadow: i < sessions ? "0 0 5px var(--tm-accent-glow)" : "none",
              transition: "all var(--tm-dur) var(--tm-ease)",
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
          {sessions === 0 ? "No sessions yet — start your first" : `${sessions} session${sessions !== 1 ? "s" : ""} completed`}
        </div>
      </div>
    </div>
  )
}

// ── Milestone Ring ─────────────────────────────────────────────

function MilestoneRing({ done, icon, label }: { done: boolean; icon: string; label: string }) {
  const r = 22
  const circ = 2 * Math.PI * r
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "12px 8px", borderRadius: "var(--tm-radius-sm)",
      background: done ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${done ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
      opacity: done ? 1 : 0.5, transition: "all var(--tm-dur) var(--tm-ease)",
    }}>
      <div style={{ position: "relative", width: 50, height: 50 }}>
        <svg width={50} height={50} viewBox="0 0 56 56" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={28} cy={28} r={r} fill="none" stroke="var(--tm-border-soft)" strokeWidth={3} />
          <circle cx={28} cy={28} r={r} fill="none" stroke={done ? "var(--tm-accent)" : "var(--tm-border)"} strokeWidth={3}
            strokeDasharray={circ} strokeDashoffset={done ? 0 : circ} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.9s var(--tm-ease)", filter: done ? "drop-shadow(0 0 4px var(--tm-accent-glow))" : "none" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: done ? "var(--tm-accent)" : "var(--tm-text-faint)", filter: done ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none" }}>
          {done ? icon : "○"}
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: done ? "var(--tm-text)" : "var(--tm-text-faint)", textAlign: "center", lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 10, color: done ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>{done ? "✓" : "Locked"}</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

function HomeForgePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  // ── UI state ─────────────────────────────────────────────
  const [activeJobIdx, setActiveJobIdx] = useState(0)
  const [entryText, setEntryText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [promptSkills, setPromptSkills] = useState<string[]>([])
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editText, setEditText] = useState("")
  const [completionDay, setCompletionDay] = useState<number | null>(null)
  const [completionProof, setCompletionProof] = useState("")
  const [completionImpact, setCompletionImpact] = useState("")
  const [completionConfidence, setCompletionConfidence] = useState(0.7)
  const [jobProof, setJobProof] = useState("")
  const [jobImpact, setJobImpact] = useState("")
  const [jobConfidence] = useState(3)
  const [missionLogged, setMissionLogged] = useState(false)
  const [missionCompleted, setMissionCompleted] = useState(false)
  const [missionDismissed, setMissionDismissed] = useState(false)
  const [forgeMode, setForgeMode] = useState(false)

  // ── URL params ───────────────────────────────────────────
  const urlJobId = searchParams.get("jobId")
  const milestoneId = searchParams.get("milestoneId")

  // ── Prefill from diary skill cart ────────────────────────
  useEffect(() => {
    const selections = parseDiarySelections(new URLSearchParams(searchParams.toString()))
    const prefill = buildDiaryPrefill(selections)
    if (prefill.skills.length === 0 || !prefill.entryText) return
    setPromptSkills(prefill.skills)
    setEntryText(prefill.entryText)
  }, [searchParams])

  // ── Queries ──────────────────────────────────────────────
  const { data: scoreData } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData } = useQuery({
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
  const milestonesQuery = useQuery({
    queryKey: dataKeys.milestones(),
    queryFn: () => diary.milestones(token!, 30),
    enabled: !!token,
  })
  const { data: evidenceData, isLoading: evidenceLoading } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  // ── Derived values (order matters) ───────────────────────
  const topJobs = jobsData?.jobs?.slice(0, 5) ?? []
  const apps = applications ?? []
  const pipelineApps = apps.slice(0, 4)
  const targetRoles = profile?.target_roles?.join(", ") ?? "Set your target role"
  const targetLoc = profile?.target_location ?? "Set location"

  // Active job: URL param match takes priority over focus strip selection
  const activeJob = urlJobId
    ? (topJobs.find((j) => j.job_id === urlJobId) ?? null)
    : (topJobs[activeJobIdx] ?? null)
  const activeJobFocusId = activeJob?.job_id ?? null

  // Milestones
  const _rawMilestones = milestonesQuery.data?.milestones ?? []
  const nextJobMilestone = _rawMilestones
    .filter((m) => m.source_type === "job" && !m.completed_at)
    .sort((a, b) => a.milestone_date.localeCompare(b.milestone_date))[0] ?? null
  const activeJobId = urlJobId ?? activeJobFocusId ?? nextJobMilestone?.job_id ?? null

  // Dependent queries
  const { data: skillGapData } = useQuery({
    queryKey: ["skillGap", activeJobFocusId],
    queryFn: () => jobs.skillGap(token!, activeJobFocusId!),
    enabled: !!token && !!activeJobFocusId,
    staleTime: 10 * 60 * 1000,
  })
  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(urlJobId),
    queryFn: () => jobs.path(token!, urlJobId!),
    enabled: !!token && !!urlJobId,
  })

  const score = scoreData?.total_score ?? 0
  const hasCv = !!scoreData
  const gapSkills = scoreData?.gap_skills ?? []
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const totalXP = computeTotalXP(entries)
  const persistedMilestones = milestonesQuery.data?.milestones ?? []
  const allJobMilestones = persistedMilestones.filter((m) => m.source_type === "job")

  const appsByJobId = new Map(apps.map((a) => [a.job_id, a]))
  const activeApp = activeJobId ? appsByJobId.get(activeJobId) : undefined

  const jobMilestone = milestoneId
    ? jobPathQuery.data?.milestones.find((m) => m.id === milestoneId) ?? null
    : jobPathQuery.data?.today_milestone ?? null
  const activeMission = jobMilestone
    ? jobMilestone
    : nextJobMilestone
    ? { id: nextJobMilestone.id, title: nextJobMilestone.skill ?? "Skill", action: nextJobMilestone.task, completed_at: nextJobMilestone.completed_at }
    : null
  const activeMissionJobTitle = urlJobId ? (jobPathQuery.data?.job_title ?? undefined) : (activeApp?.title ?? undefined)
  const activeMissionCompany = urlJobId ? (jobPathQuery.data?.company ?? undefined) : (activeApp?.company ?? undefined)
  const activeMissionReadiness = urlJobId ? jobPathQuery.data?.readiness_pct : undefined

  // 7-day plan
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const weekDates = getWeekDates()
  const personalMilestones = persistedMilestones.filter((m) => m.source_type === "personal")
  const milestonesByDate = new Map<string, Milestone>(personalMilestones.map((m) => [m.milestone_date, m]))
  const weekPlan = weekDays.map((day, i) => {
    const dateKey = toDateKey(weekDates[i])
    const saved = milestonesByDate.get(dateKey)
    const defaultSkill = gapSkills[i]?.skill ?? null
    return {
      day, dateKey,
      skill: saved?.skill ?? defaultSkill,
      task: saved?.task ?? (defaultSkill ? `Practice ${gapSkills[i].skill}` : i === 6 ? "Rest & reflect" : "Log your progress"),
      proof: saved?.proof ?? "",
      impact: saved?.impact ?? "",
      confidence: saved?.confidence ?? 0.7,
      done: !!saved?.completed_at,
    }
  })
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
  const todayMilestone = weekPlan[todayIdx]
  const todayTask = weekPlan[todayIdx]?.task ?? "Log your progress"

  // Forge context
  const forgeMilestones = jobPathQuery.data?.milestones ?? []
  const activeForgeMilestone: JobPathMilestone | null = urlJobId
    ? (jobMilestone ?? jobPathQuery.data?.today_milestone ?? forgeMilestones.find((m) => !m.completed_at) ?? null)
    : null
  const forgeSkill = activeForgeMilestone?.skill ?? jobPathQuery.data?.target_skills?.[0]?.skill ?? gapSkills[0]?.skill ?? "Skill"
  const forgeTask = activeForgeMilestone?.action ?? todayTask
  const cvHref = urlJobId ? `/cv?source=forge&jobId=${encodeURIComponent(urlJobId)}` : "/cv?source=forge"
  const prefillText = activeMission
    ? `Working on: ${activeMission.title}\n\nTask: ${activeMission.action}\n\nProgress today: `
    : ""

  const ACHIEVEMENTS = [
    { label: "CV Analysed",    done: entries.length > 0 || !!scoreData, icon: "◈" },
    { label: "Score Computed", done: !!scoreData,                        icon: "◉" },
    { label: "First Entry",    done: entries.length >= 1,                icon: "▣" },
    { label: "5-Day Streak",   done: streak >= 5,                        icon: "◆" },
    { label: "Gap Closed",     done: persistedMilestones.some((m) => !!m.completed_at), icon: "◑" },
    { label: "Score 80+",      done: score >= 80,                        icon: "▲" },
  ]

  // ── Mutations ─────────────────────────────────────────────
  const saveEntry = useMutation({
    mutationFn: () => diary.createEntry(token!, entryText),
    onMutate: () => setError(null),
    onSuccess: () => {
      setEntryText(""); setPromptSkills([])
      queryClient.invalidateQueries({ queryKey: dataKeys.diary() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save entry"),
  })

  const saveMilestone = useMutation({
    mutationFn: (payload: MilestonePayload) => diary.saveMilestone(token!, payload),
    onMutate: () => setError(null),
    onSuccess: () => {
      setEditingDay(null); setCompletionDay(null); setCompletionProof(""); setCompletionImpact("")
      queryClient.invalidateQueries({ queryKey: dataKeys.milestones() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save milestone"),
  })

  const saveJobMilestone = useMutation({
    mutationFn: () => {
      const activeMilestoneId = milestoneId ?? jobMilestone?.id ?? nextJobMilestone?.id
      if (!activeJobId || !activeMilestoneId) throw new Error("Missing job milestone")
      return jobs.updateMilestone(token!, activeJobId, activeMilestoneId, {
        proof: jobProof, impact: jobImpact || null, confidence: jobConfidence / 5, completed: true,
      })
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setJobProof(""); setJobImpact(""); setMissionCompleted(true)
      invalidateJobPathData(queryClient, activeJobId)
      queryClient.invalidateQueries({ queryKey: dataKeys.milestones() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save job milestone"),
  })

  // ── Event handlers ────────────────────────────────────────
  function saveDayEdit(i: number) {
    const trimmed = editText.trim()
    if (!trimmed) { setEditingDay(null); return }
    const item = weekPlan[i]
    saveMilestone.mutate({ milestone_date: item.dateKey, skill: item.skill, task: trimmed, proof: item.proof || null, impact: item.impact || null, confidence: item.confidence, completed: false })
  }

  function openCompletion(i: number) {
    const item = weekPlan[i]
    setCompletionDay(i); setCompletionProof(item.proof); setCompletionImpact(item.impact); setCompletionConfidence(item.confidence)
  }

  function completeMilestone(i: number) {
    const proof = completionProof.trim()
    if (!proof) { setError("Add one proof point before completing this milestone."); return }
    const item = weekPlan[i]
    saveMilestone.mutate({ milestone_date: item.dateKey, skill: item.skill, task: item.task, proof, impact: completionImpact.trim() || null, confidence: completionConfidence, completed: true })
  }

  async function handleForgeSessionComplete(payload: ForgeCompletionPayload): Promise<{ xpGained: number }> {
    if (!token) throw new Error("Sign in to log this focus session.")
    const reflection = payload.reflection.trim()
    const minutes = Math.max(1, Math.round(payload.durationSeconds / 60))
    const text = [
      `Forge session complete (${minutes} min).`,
      `Skill focus: ${forgeSkill}.`,
      `Milestone: ${forgeTask}.`,
      `Progress note: ${reflection}`,
    ].join("\n")
    const entry = await diary.createEntry(token, text)
    const xpGained = entry.skills_delta.reduce((sum, delta) => sum + delta.xp_added, 0)
    if (urlJobId && activeForgeMilestone) {
      await jobs.updateMilestone(token, urlJobId, activeForgeMilestone.id, { proof: reflection, confidence: 0.72, completed: true })
      invalidateJobPathData(queryClient, urlJobId)
    } else {
      await diary.saveMilestone(token, {
        milestone_date: todayMilestone?.dateKey ?? toDateKey(new Date()),
        skill: todayMilestone?.skill ?? forgeSkill,
        task: todayTask, proof: reflection, confidence: 0.72, completed: true,
      })
    }
    queryClient.invalidateQueries({ queryKey: dataKeys.diary() })
    queryClient.invalidateQueries({ queryKey: dataKeys.milestones() })
    queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
    queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence() })
    queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
    queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    return { xpGained }
  }

  async function handleForgeJobCvGenerate(): Promise<{ notice?: string }> {
    if (!token || !urlJobId) throw new Error("Track a job first to generate a job CV pointer.")
    const result = await jobs.generateJobCv(token, urlJobId, false)
    invalidateJobPathData(queryClient, urlJobId)
    queryClient.invalidateQueries({ queryKey: dataKeys.cvProfile() })
    return { notice: result.from_cache ? "Using your latest cached job CV pointer." : "Job CV pointer generated from your latest proof." }
  }

  if (!ready) return null

  // ── Render ────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="tm-page-enter" style={{ overflowY: "auto", height: "100%" }}>

        {/* ══════════════════════════════════════════════════
            SECTION 1 — MISSION CONTROL
        ══════════════════════════════════════════════════ */}
        <div style={{ padding: "var(--tm-page-py) var(--tm-page-px)", display: "flex", flexDirection: "column", gap: 16, borderBottom: "1px solid var(--tm-border-soft)" }}>

          {/* Topbar */}
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 2 }}>
              Target: {targetRoles} · {targetLoc}
            </div>
            <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", margin: 0 }}>
              Mission Control
            </h1>
          </div>

          {/* Active Focus strip */}
          {topJobs.length > 0 && (
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", flexShrink: 0 }}>Active focus →</span>
                {topJobs.map((j, i) => (
                  <button key={j.job_id} onClick={() => setActiveJobIdx(i)} style={{
                    padding: "5px 14px", borderRadius: 99, cursor: "pointer", flexShrink: 0,
                    background: i === activeJobIdx ? "var(--tm-accent)" : "rgba(255,255,255,0.03)",
                    border: `1.5px solid ${i === activeJobIdx ? "var(--tm-accent)" : "var(--tm-border)"}`,
                    color: i === activeJobIdx ? "var(--tm-accent-fg)" : "var(--tm-text-muted)",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                    transition: "all 200ms var(--tm-ease)",
                  }}>
                    {j.company ?? "Company"}
                  </button>
                ))}
                <Link href="/market" style={{ padding: "5px 12px", borderRadius: 99, border: "1.5px dashed var(--tm-border)", fontSize: 11, color: "var(--tm-text-faint)", cursor: "pointer", textDecoration: "none", transition: "all 200ms" }}>
                  + Add target
                </Link>
              </div>
            </div>
          )}

          {/* Row 1: Score · Active Job · Today */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 1fr", gap: 14 }}>

            {/* Score card */}
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Myro Score</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: "var(--tm-accent)", lineHeight: 1, fontFamily: "var(--tm-font-mono)", filter: "drop-shadow(0 0 12px var(--tm-accent-glow))" }}>
                {Math.round(score)}
              </div>
              <ScoreBar pct={score} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-success)" }}>↑ improving</span>
                <Link href="/skills" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", border: "1px solid var(--tm-border-soft)", borderRadius: 6, padding: "3px 10px" }}>
                  Open Skill Intelligence →
                </Link>
              </div>
            </div>

            {/* Active Job card */}
            {activeJob ? (
              <div style={{ background: "var(--tm-surface)", border: "2px solid var(--tm-accent)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 0 24px var(--tm-accent-glow)" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  Focused on: {activeJob.company ?? ""}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1.2 }}>{activeJob.title}</div>
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>
                      {[activeJob.company, activeJob.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ padding: "4px 10px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {Math.min(100, Math.round(activeJob.overlap_score))}% fit
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {activeJob.matched_skills?.slice(0, 4).map((s) => (
                    <span key={s} style={{ padding: "2px 8px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 11, fontWeight: 500 }}>
                      {s} ✓
                    </span>
                  ))}
                </div>
                <button onClick={scrollForge} style={{
                  padding: "10px 16px", borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 0 16px var(--tm-accent-glow)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span>▶ Forge: {skillGapData?.skills?.find((g) => g.missing)?.skill ?? "next gap"}</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>↓ Forge</span>
                </button>
              </div>
            ) : (
              <div style={{ background: "var(--tm-surface)", border: "1px dashed var(--tm-border)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No active job targeted yet</div>
                <Link href="/market" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Browse Intel →</Link>
              </div>
            )}

            {/* Today card */}
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Today</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1 }}>
                  {new Date().toLocaleDateString("en", { weekday: "short" })}
                </span>
                <span style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
                  {new Date().toLocaleDateString("en", { month: "short", day: "numeric" })}
                </span>
              </div>
              <button onClick={scrollForge} style={{
                padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                background: "var(--tm-warning-wash)", border: "1px solid rgba(245,158,11,0.3)",
                color: "var(--tm-warning)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                display: "block", textAlign: "center", width: "100%",
                transition: "all 200ms var(--tm-ease)",
              }}>
                Open Forge ↓
              </button>
            </div>
          </div>

          {/* Row 2: Top Gaps · Pipeline · CV Readiness */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>

            {/* Top Skill Gaps */}
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                Top Gaps{activeJob ? ` — ${activeJob.company ?? activeJob.title}` : ""}
              </div>
              {!activeJob ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--tm-text-faint)", textAlign: "center" }}>Save a target job to see your skill gaps</span>
                </div>
              ) : !skillGapData ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Loading gaps…</span>
                </div>
              ) : skillGapData.skills.filter((g) => g.missing).length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--tm-success)" }}>No gaps — you meet all requirements ✓</span>
                </div>
              ) : (
                <>
                  {skillGapData.skills.filter((g) => g.missing).slice(0, 3).map((gap) => (
                    <div key={gap.skill} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: gap.user_level === 0 ? "var(--tm-danger)" : "var(--tm-warning)" }}>●</span>
                        <span style={{ fontSize: 13, color: "var(--tm-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gap.skill}</span>
                        <span style={{ fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0, fontFamily: "var(--tm-font-mono)" }}>
                          L{gap.user_level}→L{gap.required_level}
                        </span>
                      </div>
                      <button onClick={scrollForge} style={{ padding: "4px 10px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer", background: "transparent", border: "1px solid var(--tm-border)", color: "var(--tm-accent)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", textAlign: "left", transition: "all 150ms var(--tm-ease)" }}>
                        ▶ Forge this gap
                      </button>
                    </div>
                  ))}
                </>
              )}
              <Link href="/skills" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
                View all skill gaps →
              </Link>
            </div>

            {/* Pipeline */}
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Pipeline</div>
              {pipelineApps.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>No applications yet</span>
                </div>
              ) : (
                pipelineApps.map((app) => (
                  <div key={app.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "7px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {app.company ?? app.title}
                      </span>
                      <span style={{ fontSize: 11, flexShrink: 0, color: STATUS_COLOR[app.status] ?? "var(--tm-text-faint)" }}>
                        <span style={{ fontWeight: 600 }}>{STATUS_LABEL[app.status] ?? app.status}</span>
                        {" · "}
                        <span style={{ opacity: 0.7 }}>{daysAgo(app.created_at)}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--tm-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.title}</div>
                    <button
                      onClick={() => router.push(`/home?jobId=${app.job_id}#forge-section`)}
                      style={{ alignSelf: "flex-end", padding: "3px 10px", borderRadius: "var(--tm-radius-sm)", background: "transparent", border: "1px solid var(--tm-border)", color: "var(--tm-text-faint)", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 150ms var(--tm-ease)" }}
                    >
                      Log update →
                    </button>
                  </div>
                ))
              )}
              <Link href="/tracker" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
                All applications →
              </Link>
            </div>

            {/* CV Readiness */}
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                CV — {activeJob?.company ?? "Target"}
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--tm-warning)", lineHeight: 1, fontFamily: "var(--tm-font-mono)" }}>
                {activeJob ? `${Math.min(100, Math.round(activeJob.overlap_score))}%` : "—"}
              </div>
              <ScoreBar pct={activeJob ? Math.min(100, activeJob.overlap_score) : 0} color="var(--tm-warning)" />
              <Link href="/cv" style={{ padding: "9px 14px", borderRadius: "var(--tm-radius-sm)", textAlign: "center", background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "block", boxShadow: "0 0 12px var(--tm-accent-glow)" }}>
                Generate CV →
              </Link>
            </div>
          </div>

          {/* Evidence Since Last CV */}
          {evidenceData && evidenceData.evidence_count > 0 && (
            <div style={{
              padding: "14px 0 2px",
              borderTop: "1px solid var(--tm-border-soft)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div className="tm-label-caps">Evidence Since Last CV</div>
                <span style={{
                  fontSize: 10,
                  color: evidenceData?.eligible ? "var(--tm-accent)" : "var(--tm-text-faint)",
                  background: evidenceData?.eligible ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                  padding: "2px 8px", borderRadius: 999,
                  border: `1px solid ${evidenceData?.eligible ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                }}>
                  {evidenceData.evidence_count}/{evidenceData.required_count} days
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "Milestone days",  value: evidenceData.evidence_count },
                  { label: "Diary entries",   value: evidenceData.diary_entries_count },
                  { label: "Skill upgrades",  value: evidenceData.skill_upgrades_count },
                  { label: "Score move",      value: evidenceData.score_delta == null ? "0" : `${evidenceData.score_delta >= 0 ? "+" : ""}${Math.round(evidenceData.score_delta)}` },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "8px 10px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 16, color: "var(--tm-text)", fontWeight: 700 }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
              {evidenceLoading ? (
                <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Loading evidence…</div>
              ) : evidenceData.evidence.length > 0 && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {evidenceData.evidence.slice(-7).map((item) => (
                    <div key={`${item.date}-${item.skill}-${item.task}`} style={{
                      flexShrink: 0, width: 180,
                      padding: "8px 10px", borderRadius: "var(--tm-radius-sm)",
                      border: "1px solid var(--tm-border-soft)", background: "var(--tm-surface)",
                    }}>
                      <div style={{ fontSize: 11, color: "var(--tm-accent)", fontWeight: 600, marginBottom: 3 }}>{item.skill}</div>
                      <div style={{ fontSize: 11, color: "var(--tm-text-muted)", lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.task}</div>
                      <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 4 }}>{new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════
            SECTION 2 — FORGE
        ══════════════════════════════════════════════════ */}
        <div id="forge-section">

          {/* Forge Stats Ribbon */}
          <div style={{ background: "linear-gradient(135deg, var(--tm-accent-wash), var(--tm-surface))", borderBottom: "1px solid var(--tm-border-soft)", padding: "14px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div className="tm-label-caps">Forge · Progress</div>
              <button
                onClick={() => setForgeMode(true)}
                style={{ marginLeft: "auto", padding: "5px 14px", borderRadius: "var(--tm-radius-pill)", background: "linear-gradient(135deg, #060C1A, #0B1424)", border: "1px solid rgba(0,245,212,0.4)", color: "#00F5D4", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 12px rgba(0,245,212,0.2)" }}
              >
                ◑ Enter Forge Mode
              </button>
              {streak >= 3 && (
                <span className="tm-pill tm-pill-warning">🔥 {streak}-day streak</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {[
                { label: "Streak",     value: streak,            unit: "d"    },
                { label: "Entries",    value: entries.length,    unit: ""     },
                { label: "Total XP",   value: totalXP,           unit: ""     },
                { label: "Myro Score", value: Math.round(score), unit: "/100" },
              ].map(({ label, value, unit }, idx) => (
                <div key={label} style={{ flex: 1, padding: "6px 20px", borderRight: idx < 3 ? "1px solid var(--tm-border-soft)" : "none", display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 27, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1 }}>{value}{unit}</div>
                  <div className="tm-label-caps">{label}</div>
                </div>
              ))}
              <div style={{ flex: 2, padding: "6px 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
                <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, score)}%`, background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-pressed))", borderRadius: 999, transition: "width 1.2s var(--tm-ease)" }} />
                </div>
                <div className="tm-meta">
                  {score < 50 ? "Keep going — every entry counts" : score < 80 ? "Strong progress — closing the gap" : "Excellent — top market position"}
                </div>
              </div>
            </div>
          </div>

          {/* Forge Body */}
          <div style={{ padding: "20px 32px 32px" }}>

            <CVRequiredNudge hasCv={hasCv} feature="personalised milestones" />

            {activeMission && (
              <NextMissionCard
                mission={activeMission}
                jobTitle={activeMissionJobTitle}
                company={activeMissionCompany}
                readinessPct={activeMissionReadiness}
                isLogged={missionLogged}
                isCompleted={missionCompleted || !!activeMission?.completed_at}
                isDismissed={missionDismissed}
                completeError={saveJobMilestone.isError ? (saveJobMilestone.error instanceof Error ? saveJobMilestone.error.message : "Could not mark complete") : null}
                onLogProgress={() => { setEntryText(prefillText); setMissionLogged(true) }}
                onComplete={() => saveJobMilestone.mutate()}
                onDismiss={() => setMissionDismissed((d) => !d)}
              />
            )}

            {/* Deep Focus Timer + 7-Day Plan */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.45fr", gap: 16, marginBottom: 16 }}>
              <DeepFocusTimer todayTask={todayTask} />

              {/* 7-Day Milestone Plan */}
              <div className="tm-card" style={{ backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="tm-label-caps">7-Day Milestone Plan</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {weekPlan.map((item, i) => {
                    const isToday = i === todayIdx
                    const isEditing = editingDay === i
                    const isCompleting = completionDay === i
                    return (
                      <div key={item.dateKey}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                          background: item.done ? "var(--tm-accent-wash)" : isToday ? "var(--tm-surface-2)" : "rgba(255,255,255,0.02)",
                          border: item.done ? "1px solid var(--tm-accent-ring)" : isToday ? "1px solid var(--tm-border)" : "1px solid var(--tm-border-soft)",
                        }}>
                          <div style={{ width: 30, fontSize: 11, fontWeight: 700, color: item.done ? "var(--tm-accent)" : isToday ? "var(--tm-text)" : "var(--tm-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>{item.day}</div>
                          <div style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, border: `1.5px solid ${item.done ? "var(--tm-accent)" : isToday ? "var(--tm-text-muted)" : "var(--tm-border)"}`, background: item.done ? "var(--tm-accent-wash)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: item.done ? "var(--tm-accent)" : isToday ? "var(--tm-text-muted)" : "transparent" }}>
                            {item.done ? "✓" : isToday ? "▸" : ""}
                          </div>
                          {isEditing ? (
                            <input
                              aria-label={`Edit ${item.day} milestone`} autoFocus
                              value={editText} onChange={(e) => setEditText(e.target.value)}
                              onBlur={() => saveDayEdit(i)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveDayEdit(i); if (e.key === "Escape") setEditingDay(null) }}
                              style={{ flex: 1, fontSize: 13, background: "var(--tm-surface-2)", border: "1px solid var(--tm-accent-ring)", borderRadius: 4, color: "var(--tm-text)", padding: "2px 6px", fontFamily: "inherit", outline: "none" }}
                            />
                          ) : (
                            <span style={{ flex: 1, fontSize: 13, color: item.done ? "var(--tm-text-faint)" : isToday ? "var(--tm-text)" : "var(--tm-text-faint)", textDecoration: item.done ? "line-through" : "none" }}>{item.task}</span>
                          )}
                          {isToday && !item.done && !isEditing && (
                            <span className="tm-label-caps" style={{ fontSize: 9, color: "var(--tm-accent)" }}>TODAY</span>
                          )}
                          {!isEditing && !item.done && (
                            <button type="button" onClick={() => openCompletion(i)} className="tm-btn tm-btn-ghost" style={{ height: 26, padding: "0 8px", fontSize: 11 }}>Complete</button>
                          )}
                          {!isEditing && (
                            <button type="button" onClick={() => { setEditingDay(i); setEditText(item.task) }}
                              aria-label={`Edit ${item.day} milestone`} title="Edit this day's plan"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm-text-faint)", padding: "2px 4px", fontSize: 12, lineHeight: 1, flexShrink: 0, opacity: 0.4, transition: "opacity 0.15s" }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}>✎</button>
                          )}
                        </div>
                        {isCompleting && (
                          <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-accent-ring)", background: "var(--tm-accent-wash)", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--tm-text-muted)" }}>
                              Proof
                              <input value={completionProof} onChange={(e) => setCompletionProof(e.target.value)} placeholder={`What proves ${item.skill ?? "this"} happened?`} aria-invalid={!completionProof.trim() && !!error} style={{ padding: "7px 9px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border)", background: "var(--tm-surface-2)", color: "var(--tm-text)", fontSize: 12, fontFamily: "inherit" }} />
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--tm-text-muted)" }}>
                              Impact
                              <input value={completionImpact} onChange={(e) => setCompletionImpact(e.target.value)} placeholder="What changed because of it?" style={{ padding: "7px 9px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border)", background: "var(--tm-surface-2)", color: "var(--tm-text)", fontSize: 12, fontFamily: "inherit" }} />
                            </label>
                            <button type="button" onClick={() => completeMilestone(i)} disabled={saveMilestone.isPending} className="tm-btn tm-btn-primary" style={{ height: 34, fontSize: 12, whiteSpace: "nowrap" }}>Save evidence</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {error && completionDay !== null && (
                  <div role="alert" style={{ fontSize: 12, color: "var(--tm-danger)" }}>{error}</div>
                )}
                <div style={{ height: 1, background: "var(--tm-border-soft)" }} />
                <div>
                  <div className="tm-label-caps" style={{ marginBottom: 10 }}>Achievements</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {ACHIEVEMENTS.map((a) => (
                      <MilestoneRing key={a.label} done={a.done} icon={a.icon} label={a.label} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Job Path Milestones */}
            {allJobMilestones.length > 0 && (
              <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
                <div className="tm-label-caps" style={{ marginBottom: 12 }}>Job Path Milestones</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {allJobMilestones.map((m) => {
                    const app = m.job_id ? appsByJobId.get(m.job_id) : undefined
                    const isDone = !!m.completed_at
                    return (
                      <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: "var(--tm-radius-sm)", background: isDone ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)", border: `1px solid ${isDone ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`, opacity: isDone ? 0.7 : 1 }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1, border: `1.5px solid ${isDone ? "var(--tm-accent)" : "var(--tm-border)"}`, background: isDone ? "var(--tm-accent-wash)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: isDone ? "var(--tm-accent)" : "transparent" }}>
                          {isDone ? "✓" : ""}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: isDone ? "var(--tm-text-faint)" : "var(--tm-text)", textDecoration: isDone ? "line-through" : "none", lineHeight: 1.4 }}>{m.task}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {m.skill && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-accent-wash)", color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)" }}>{m.skill}</span>}
                            {app && <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{app.title}{app.company ? ` @ ${app.company}` : ""}</span>}
                            <span style={{ fontSize: 11, color: "var(--tm-text-faint)", marginLeft: "auto" }}>{m.milestone_date}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Learning Diary */}
            <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
              <div className="tm-label-caps" style={{ marginBottom: 16 }}>Learning Diary</div>
              {promptSkills.length > 0 && (
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)" }}>
                  <div className="tm-label-caps" style={{ marginBottom: 6, color: "var(--tm-accent)" }}>Skills tagged from Intel</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {promptSkills.map((skill) => (
                      <span key={skill} className="tm-pill" style={{ background: "var(--tm-accent-wash)", color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)" }}>{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <textarea
                  value={entryText}
                  onChange={(e) => setEntryText(e.target.value)}
                  placeholder="What did you learn today? Any blockers? How are you feeling about the journey?"
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent)" }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-surface-2)", border: "1px solid var(--tm-border)", color: "var(--tm-text)", fontSize: "var(--tm-fs-meta)", lineHeight: 1.6, resize: "none" as const, minHeight: 72, fontFamily: "inherit", outline: "none", transition: "border-color var(--tm-dur) var(--tm-ease)" }}
                />
                <button onClick={() => saveEntry.mutate()} disabled={!entryText.trim() || saveEntry.isPending} className="tm-btn tm-btn-primary" style={{ alignSelf: "flex-end", whiteSpace: "nowrap", opacity: !entryText.trim() ? 0.4 : 1 }}>
                  {saveEntry.isPending ? "…" : "Add entry"}
                </button>
              </div>
              {error && (
                <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)", marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {historyQuery.isLoading ? (
                  <div style={{ height: 80, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }} />
                ) : entries.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
                    No entries yet. Write your first diary entry above.
                  </div>
                ) : (
                  entries.map((item) => (
                    <div key={item.id} style={{ padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.06em" }}>{item.log_date}</span>
                        {item.score_after != null && (
                          <span style={{ fontSize: 11, color: "var(--tm-accent)", marginLeft: "auto" }}>
                            Score: {item.score_before ?? "new"} → {item.score_after}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{item.entry_text}</p>
                      {item.skills_delta.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                          {item.skills_delta.map((sd) => (
                            <span key={`${item.id}-${sd.taxonomy_key}`} className="tm-pill" style={{ background: "var(--tm-accent-wash)", color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)" }}>
                              {sd.taxonomy_key} +{sd.xp_added} XP
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ForgeFocusOverlay
        open={forgeMode}
        onOpenChange={setForgeMode}
        milestoneText={forgeTask}
        focusSkill={forgeSkill}
        cvHref={cvHref}
        hasJobContext={!!urlJobId}
        onSessionComplete={handleForgeSessionComplete}
        onGenerateJobCv={urlJobId ? handleForgeJobCvGenerate : undefined}
      />
    </AppShell>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeForgePageInner />
    </Suspense>
  )
}
