"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { ForgeModal } from "@/components/forge/ForgeModal"
import { DiaryPanel } from "@/components/diary/DiaryPanel"
import { HeroCard } from "@/components/home/HeroCard"
import { ReviewModal } from "@/components/home/ReviewModal"
import { RightRail } from "@/components/home/RightRail"
import { MissionHeader } from "@/components/home/MissionHeader"
import { SkillGapCol, CVCol } from "@/components/home/HomeColumns"
import { JobCard } from "@/components/jobs/JobCard"
import { cv, diary, jobs, scores, users, xp, APPLICATION_OUTCOMES } from "@/lib/api"
import { dataKeys, invalidateJobPathData } from "@/lib/domain-data"
import type { CartSkill, ForgeSessionResult } from "@/types/xp"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreak } from "@/lib/forge-helpers"
import { useMatchRefresh } from "@/lib/hooks/use-match-refresh"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"
import { useCartStore } from "@/store/cartStore"
import { useForgeTimerStore } from "@/store/forgeTimerStore"
import { useDiaryIntentStore } from "@/store/diaryIntentStore"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

interface ToastState { message: string; key: number }

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

function HomePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { toast, show: showToast } = useToast()
  const { setBalance: setXPBalance, addBalance } = useXPStore()
  const { skills: cartSkills, addSkill, removeSkill, clearCart } = useCartStore()

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [forgeOpen, setForgeOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [proofText, setProofText] = useState("")
  const [confidence] = useState(3)
  const [reviewJobId, setReviewJobId] = useState<string | null>(null)
  const [dismissedStale, setDismissedStale] = useState<Set<string>>(new Set())

  const { open: diaryOpen, initialText: diaryInitialText, openDiary, closeDiary } = useDiaryIntentStore()
  const { sessionActive, dismissed, startSession, setRunning: setForgeTimerRunning } = useForgeTimerStore()
  const { isRefreshing, notice: refreshNotice, refresh: refreshMatches, cleanup: cleanupRefresh } = useMatchRefresh(token, queryClient)
  useEffect(() => cleanupRefresh, []) // eslint-disable-line react-hooks/exhaustive-deps
  const urlJobId = searchParams.get("jobId")

  const { data: scoreData } = useQuery({ queryKey: dataKeys.scores(), queryFn: () => scores.me(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: profile } = useQuery({ queryKey: dataKeys.profile(), queryFn: () => users.me(token!), enabled: !!token, staleTime: 10 * 60 * 1000 })
  const { data: jobsData, isLoading: jobsLoading } = useQuery({ queryKey: dataKeys.jobs(), queryFn: () => withLocalCache(userCacheKey(token!, ["matches"]), MATCHES_TTL, () => jobs.matches(token!)), enabled: !!token, staleTime: MATCHES_TTL })
  const { data: applications } = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobs.applications(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const historyQuery = useQuery({ queryKey: dataKeys.diary(), queryFn: () => diary.history(token!), enabled: !!token })
  const { data: evidenceData } = useQuery({ queryKey: dataKeys.cvEvidence(), queryFn: () => cv.evidence(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: staleApps } = useQuery({ queryKey: dataKeys.staleApplications(), queryFn: () => jobs.staleApplications(token!), enabled: !!token, staleTime: 10 * 60 * 1000 })

  const allMatchedJobs = jobsData?.jobs ?? []
  const topJobs = allMatchedJobs.slice(0, 5)
  const apps = useMemo(() => applications ?? [], [applications])
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const score = scoreData?.total_score ?? 0
  const hasCv = !!scoreData
  const allTargetRoles = profile?.target_roles ?? []
  const targetRoles = allTargetRoles.length === 0 ? "Set your target role" : allTargetRoles.slice(0, 2).join(", ") + (allTargetRoles.length > 2 ? ` +${allTargetRoles.length - 2} more` : "")
  const targetLoc = profile?.target_location ?? "Set location"

  const activeJob = urlJobId
    ? (allMatchedJobs.find(j => j.job_id === urlJobId) ?? null)
    : (activeJobId ? (allMatchedJobs.find(j => j.job_id === activeJobId) ?? null) : null)
  const appsByJobId = useMemo(() => { const m: Record<string, ApplicationStatus> = {}; for (const a of apps) m[a.job_id] = a.status; return m }, [apps])
  const activeJobStatus = activeJob ? (appsByJobId[activeJob.job_id] ?? "saved") : "saved"
  const cartSkillNames = useMemo(() => new Set(cartSkills.map(c => c.skill_name)), [cartSkills])

  useEffect(() => { if (!token) return; xp.balance(token).then(r => setXPBalance(r.balance)).catch(() => {}) }, [token, setXPBalance])

  // Pause ambient timer when full ForgeModal opens
  useEffect(() => {
    if (forgeOpen) setForgeTimerRunning(false)
  }, [forgeOpen, setForgeTimerRunning])

  const { data: skillGapData } = useQuery({ queryKey: dataKeys.skillGap(activeJob?.job_id ?? null), queryFn: () => jobs.skillGap(token!, activeJob!.job_id), enabled: !!token && !!activeJob?.job_id, staleTime: 10 * 60 * 1000 })

  const trackedJobIds = useMemo(() => apps.map(a => a.job_id), [apps])
  const jobPathQueries = useQueries({
    queries: trackedJobIds.map(jobId => ({
      queryKey: dataKeys.jobPath(jobId),
      queryFn: () => jobs.path(token!, jobId),
      enabled: !!token,
      staleTime: 5 * 60 * 1000,
    }))
  })
  const pendingMilestoneJobIds = useMemo(() => {
    const s = new Set<string>()
    jobPathQueries.forEach((q, i) => {
      if (q.data?.today_milestone && !q.data.today_milestone.completed_at) s.add(trackedJobIds[i])
    })
    return s
  }, [jobPathQueries, trackedJobIds])
  const activeJobPath = useMemo(
    () => jobPathQueries.find((_, i) => trackedJobIds[i] === activeJob?.job_id)?.data,
    [jobPathQueries, trackedJobIds, activeJob?.job_id]
  )

  const gapSkills = skillGapData?.skills?.filter(g => g.missing) ?? []

  // Seed mini forge timer once when skills first become available.
  // Fallback chain: cart → missing gap skill → any gap skill (all need skill data)
  const anyGapSkill = skillGapData?.skills?.[0] ?? null
  const seedKey = cartSkills[0]?.skill_name ?? gapSkills[0]?.skill ?? anyGapSkill?.skill ?? null
  useEffect(() => {
    if (!seedKey || sessionActive || dismissed) return
    const seed = cartSkills[0] ?? (gapSkills[0]
      ? { skill_name: gapSkills[0].skill, level_from: gapSkills[0].user_level ?? 0, level_to: gapSkills[0].required_level ?? 1, company: activeJob?.company }
      : { skill_name: anyGapSkill!.skill, level_from: anyGapSkill!.user_level ?? 0, level_to: anyGapSkill!.required_level ?? 1, company: activeJob?.company }
    )
    startSession(seed)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey])
  const todayStr = new Date().toISOString().slice(0, 10)
  const loggedToday = entries.length > 0 && entries[0].log_date === todayStr
  const hasApplied = apps.some(a => a.status !== "saved")
  const ACHIEVEMENTS = [
    { label: "CV Analysed", done: !!scoreData, icon: "◈" },
    { label: "Score Computed", done: !!scoreData, icon: "◉" },
    { label: "First Entry", done: entries.length >= 1, icon: "▣" },
    { label: "5-Day Streak", done: streak >= 5, icon: "◆" },
    { label: "Gap Closed", done: gapSkills.length === 0 && !!activeJob, icon: "◑" },
    { label: "Score 80+", done: score >= 80, icon: "▲" },
  ]

  const selfFocusJobs = useMemo(() => apps.filter(a => a.source === "user_discovery"), [apps])

  const saveEntry = useMutation({ mutationFn: ({ text, cart }: { text: string; cart: CartSkill[] }) => diary.createEntry(token!, text, undefined, cart.map(s => ({ ...s }))), onSuccess: () => { addBalance(30); clearCart(); showToast("+30 XP · entry logged"); queryClient.invalidateQueries({ queryKey: dataKeys.diary() }); queryClient.invalidateQueries({ queryKey: dataKeys.scores() }) } })
  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) => jobs.updateApplication(token!, jobId, { status }),
    onSuccess: (_data, { jobId, status }) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
      if (APPLICATION_OUTCOMES.includes(status)) setReviewJobId(jobId)
    },
  })
  const removeSelfFocus = useMutation({ mutationFn: (jobId: string) => jobs.removeTrackerJob(token!, jobId), onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }) })
  const [analysingJobId, setAnalysingJobId] = useState<string | null>(null)
  const analyseMutation = useMutation({
    mutationFn: (jobId: string) => jobs.analyseJob(token!, jobId),
    onMutate: (jobId) => setAnalysingJobId(jobId),
    onSettled: () => setAnalysingJobId(null),
    onSuccess: (data) => { setXPBalance(data.new_xp_balance); showToast(`Analysed · ${data.overlap_score}% match · −50 XP`) },
    onError: () => showToast("Not enough XP — forge a session to earn more"),
  })
  const saveMilestoneProof = useMutation({ mutationFn: ({ jobId, milestoneId, proof }: { jobId: string; milestoneId: string; proof: string }) => jobs.updateMilestone(token!, jobId, milestoneId, { proof, confidence: confidence / 5, completed: true }), onSuccess: (_data, variables) => { setProofText(""); invalidateJobPathData(queryClient, variables.jobId) } })
  const generateJobCv = useMutation({ mutationFn: ({ aiPolish }: { aiPolish: boolean }) => jobs.generateJobCv(token!, activeJob!.job_id, aiPolish), onSuccess: () => invalidateJobPathData(queryClient, activeJob!.job_id) })

  async function handleDiarySubmit(text: string, cart: CartSkill[]) { await saveEntry.mutateAsync({ text, cart }) }
  async function handleForgeSession(payload: { skill_name: string; duration_minutes: number }): Promise<ForgeSessionResult> { if (!token) throw new Error("Sign in first."); return xp.completeForge(token, { ...payload, session_type: "focused" }) }
  async function handleSpendXP(amount: number, action: string) { if (!token) return; try { const r = await xp.spend(token, amount, action); setXPBalance(r.balance); showToast(`${action === "rewrite_cv_line" ? "CV line rewriting…" : "Download unlocked"} −${amount} XP`) } catch { showToast("Not enough XP — forge a session to earn more") } }
  function handleSkillToggle(skill: SkillGapItem) { if (cartSkills.find(c => c.skill_name === skill.skill)) { removeSkill(skill.skill) } else { addSkill({ skill_name: skill.skill, level_from: skill.user_level ?? 0, level_to: skill.required_level ?? 1 }) } }
  function handleSendBatch() { openDiary(); setDrawerOpen(false); router.push("/home") }

  if (!ready) return null

  return (
    <AppShell>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: "var(--z-toast)" as never, background: "var(--tm-surface-2)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius-pill)", padding: "10px 20px", fontSize: 13, color: "var(--tm-accent)", fontWeight: 600, boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 12px rgba(0,245,212,0.15)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast.message}
        </div>
      )}
      <div className="tm-page-enter" style={{ overflowY: "auto", height: "100%", padding: "var(--tm-page-py) var(--tm-page-px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <MissionHeader
          targetRoles={targetRoles}
          targetLoc={targetLoc}
          firstName={profile?.full_name?.split(" ")[0] ?? null}
          streak={streak}
          sessions={entries.length}
          score={score}
          evidenceData={evidenceData ?? null}
          hasCv={hasCv}
          hasJob={topJobs.length > 0}
          loggedToday={loggedToday}
          hasApplied={hasApplied}
          isRefreshing={isRefreshing}
          refreshNotice={refreshNotice}
          cartCount={cartSkills.length}
          onRefreshMatches={refreshMatches}
          onEnterForge={() => setForgeOpen(true)}
          onOpenDiary={() => { setDrawerOpen(true); openDiary() }}
        />

        <CVRequiredNudge hasCv={hasCv} feature="job matching" />

        {/* Focus strip */}
        {topJobs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "10px 16px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", marginRight: 4 }}>Active focus →</span>
            {topJobs.map(j => {
              const isActive = j.job_id === activeJobId
              const status = appsByJobId[j.job_id]
              const fit = Math.round(j.overlap_score)
              const hasMilestoneDot = pendingMilestoneJobIds.has(j.job_id) && !isActive

              let bg = "rgba(255,255,255,0.025)"
              let border = "1.5px solid var(--tm-border)"
              let color = "var(--tm-text-muted)"
              let opacity = fit < 50 && !status ? 0.4 : 1
              let shadow = "none"

              if (isActive) {
                bg = "var(--tm-accent)"; border = "1.5px solid var(--tm-accent)"; color = "var(--tm-accent-fg)"; opacity = 1; shadow = "0 0 12px var(--tm-accent-glow)"
              } else if (status === "interviewing" || status === "final_round" || status === "offer") {
                bg = "var(--tm-success-wash)"; border = "1.5px solid rgba(74,222,128,0.5)"; color = "var(--tm-success)"; opacity = 1
              } else if (status === "applied" || status === "screening") {
                bg = "var(--tm-accent-wash)"; border = "1.5px solid var(--tm-accent-ring)"; color = "var(--tm-accent)"; opacity = 1
              } else if (fit < 50) {
                opacity = 0.4
              }

              return (
                <button key={j.job_id} onClick={() => setActiveJobId(j.job_id)} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: bg, border, color, cursor: "pointer", transition: "all 120ms var(--tm-ease)", boxShadow: shadow, opacity }}>
                  {j.company ?? "Company"}
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, opacity: 0.8 }}>· {fit}%</span>
                  {hasMilestoneDot && (
                    <span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 6px var(--tm-accent-glow)", border: "1.5px solid var(--tm-bg)" }} />
                  )}
                </button>
              )
            })}
            <Link href="/market" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: "1.5px dashed var(--tm-border)", fontSize: 11.5, color: "var(--tm-text-faint)", textDecoration: "none", transition: "all 120ms var(--tm-ease)" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }} onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border)" }}>+ Add target</Link>
          </div>
        )}

        {/* Self Focus strip */}
        {selfFocusJobs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "10px 16px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", marginRight: 4 }}>Self focus →</span>
            {selfFocusJobs.map(a => (
              <div key={a.job_id} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 14px", borderRadius: 99, fontSize: 13, fontWeight: 500, background: "rgba(255,255,255,0.025)", border: "1.5px solid var(--tm-border)", color: "var(--tm-text-muted)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {a.company ?? a.title}
                </span>
                <button
                  onClick={() => analyseMutation.mutate(a.job_id)}
                  disabled={analysingJobId === a.job_id}
                  title="Run skill gap analysis (−50 XP)"
                  style={{
                    display: "inline-flex", alignItems: "center",
                    fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.06em",
                    padding: "2px 8px", borderRadius: 99, cursor: analysingJobId === a.job_id ? "default" : "pointer",
                    background: "rgba(0,245,212,0.08)", border: "1px solid var(--tm-accent)",
                    color: "var(--tm-accent)", transition: "opacity 120ms ease",
                    opacity: analysingJobId === a.job_id ? 0.5 : 1,
                  }}
                >
                  {analysingJobId === a.job_id ? "…" : "Analyse → 50 XP"}
                </button>
                <button
                  onClick={() => removeSelfFocus.mutate(a.job_id)}
                  title="Remove"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "transparent", border: "none", cursor: "pointer", color: "var(--tm-text-faint)", fontSize: 11, padding: 0, marginLeft: 2 }}
                >
                  ✕
                </button>
              </div>
            ))}
            <Link href="/market" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: "1.5px dashed var(--tm-border)", fontSize: 11.5, color: "var(--tm-text-faint)", textDecoration: "none", transition: "all 120ms var(--tm-ease)" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }} onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border)" }}>+ Find more</Link>
          </div>
        )}

        {/* Stale applications prompt */}
        {staleApps && staleApps.filter(a => !dismissedStale.has(a.job_id)).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {staleApps.filter(a => !dismissedStale.has(a.job_id)).map(a => (
              <div key={a.job_id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "8px 14px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "rgba(251,191,36,0.9)", marginRight: 4 }}>⏱</span>
                <span style={{ fontSize: 13, color: "var(--tm-text-muted)", flex: 1 }}>
                  Been 7 days since we last heard from <strong style={{ color: "var(--tm-text)" }}>{a.company ?? a.title}</strong>
                </span>
                <button
                  onClick={() => updateStatus.mutate({ jobId: a.job_id, status: "ghosted" })}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.3)", color: "var(--tm-danger)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Ghosted me
                </button>
                <button
                  onClick={() => { setActiveJobId(a.job_id); setDismissedStale(prev => new Set(Array.from(prev).concat(a.job_id))) }}
                  style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Update tracker
                </button>
                <button
                  onClick={() => setDismissedStale(prev => new Set(Array.from(prev).concat(a.job_id)))}
                  style={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: "50%", background: "transparent", border: "none", color: "var(--tm-text-faint)", cursor: "pointer", fontSize: 11, padding: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main content: job detail OR matched jobs grid */}
        {activeJob ? (
          <>
            <button
              onClick={() => setActiveJobId(null)}
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tm-text-faint)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
            >
              ← All matches
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
              <HeroCard job={activeJob} status={activeJobStatus} skillGapData={skillGapData} onStatus={s => updateStatus.mutate({ jobId: activeJob.job_id, status: s })} onForge={() => setForgeOpen(true)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <SkillGapCol skillGapData={skillGapData} cartSkillNames={cartSkillNames} onSkillToggle={handleSkillToggle} />
                <CVCol job={activeJob} onSpendXP={handleSpendXP} />
              </div>
            </div>
          </>
        ) : jobsLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 140, borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)", animation: "pulse 2s infinite" }} />
            ))}
          </div>
        ) : allMatchedJobs.length > 0 ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, opacity: 0.7 }}>Matched Jobs</div>
                <p style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>{allMatchedJobs.length} recommendations · click a job to see skill gap + CV tools</p>
              </div>
              <Link href="/jobs" style={{ fontSize: 13, color: "var(--tm-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>View all →</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {allMatchedJobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  isTracked={!!appsByJobId[job.job_id]}
                  onTrack={jobId => updateStatus.mutate({ jobId, status: "saved" })}
                  onSelect={jobId => setActiveJobId(jobId)}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: "28px", textAlign: "center", borderRadius: 10, border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No matches yet — upload your CV then refresh</div>
            <Link href="/jobs" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Go to Matched Jobs →</Link>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,10,24,0.65)", backdropFilter: "blur(4px)", zIndex: 50 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "100vw", background: "var(--tm-surface)", borderLeft: "1px solid var(--tm-accent-ring)", zIndex: 51, padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tm-text)" }}>Diary · cart · milestone</h2>
              <button onClick={() => setDrawerOpen(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 14, fontFamily: "inherit" }}>✕</button>
            </div>
            <RightRail job={activeJob} jobPath={activeJobPath} cartSkills={cartSkills} onRemoveCart={c => removeSkill(c.skill_name)} onSendBatch={handleSendBatch} achievements={ACHIEVEMENTS} proofText={proofText} savingProof={saveMilestoneProof.isPending} onProofChange={setProofText} onSaveProof={milestone => activeJob && saveMilestoneProof.mutate({ jobId: activeJob.job_id, milestoneId: milestone.id, proof: proofText })} generatingCv={generateJobCv.isPending} onGenerateCv={() => activeJob && generateJobCv.mutate({ aiPolish: false })} onPolishCv={() => activeJob && generateJobCv.mutate({ aiPolish: true })} />
          </div>
        </>
      )}

      {forgeOpen && (
        <ForgeModal cartSkills={cartSkills.length > 0 ? cartSkills : gapSkills.slice(0, 3).map(g => ({ skill_name: g.skill, level_from: g.user_level, level_to: g.required_level, company: activeJob?.company ?? undefined }))} onClose={() => setForgeOpen(false)} onXPEarned={(amount, newBalance) => { addBalance(amount); setXPBalance(newBalance) }} onCompleteSession={handleForgeSession} onOpenDiary={() => openDiary()} />
      )}

      <DiaryPanel open={diaryOpen} onClose={closeDiary} initialText={diaryInitialText} cartSkills={cartSkills} onAddSkill={addSkill} onRemoveSkill={removeSkill} gapSkills={gapSkills.map(g => ({ skill: g.skill, user_level: g.user_level, required_level: g.required_level }))} activeCompany={activeJob?.company} onSubmit={handleDiarySubmit} recentEntries={entries} />

      {reviewJobId && (
        <ReviewModal
          company={apps.find(a => a.job_id === reviewJobId)?.company ?? null}
          onClose={() => setReviewJobId(null)}
          onSubmit={async (data) => { await jobs.submitReview(token!, reviewJobId, data); setReviewJobId(null); showToast("Review submitted") }}
        />
      )}
    </AppShell>
  )
}

export default function HomePage() {
  return <Suspense><HomePageInner /></Suspense>
}
