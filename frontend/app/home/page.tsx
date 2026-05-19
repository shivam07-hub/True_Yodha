"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { ForgeModal } from "@/components/forge/ForgeModal"
import { DiaryPanel } from "@/components/diary/DiaryPanel"
import { HeroCard } from "@/components/home/HeroCard"
import { RightRail } from "@/components/home/RightRail"
import { MissionHeader } from "@/components/home/MissionHeader"
import { SkillGapCol } from "@/components/home/HomeColumns"
import { AddChip, IconButton, InfoPill, InlineActionPill, SelectionChip, StripLabel } from "@/components/home/interaction-pills"
import { cv, diary, jobs, scores, users, xp } from "@/lib/api"
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
import { userCacheKey, withLocalCache, clearLocalCache } from "@/lib/local-cache"

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
  // Stale banner + ReviewModal moved to /tracker (PTL v1 — Q1, Q11). Self-Focus stays here.

  const { open: diaryOpen, initialText: diaryInitialText, openDiary, closeDiary } = useDiaryIntentStore()
  const { sessionActive, dismissed, startSession, setRunning: setForgeTimerRunning } = useForgeTimerStore()
  const { isRefreshing, notice: refreshNotice, isExhausted: matchesExhausted, refresh: refreshMatches, cleanup: cleanupRefresh } = useMatchRefresh(token, queryClient)
  useEffect(() => cleanupRefresh, []) // eslint-disable-line react-hooks/exhaustive-deps
  const urlJobId = searchParams.get("jobId")

  const { data: scoreData } = useQuery({ queryKey: dataKeys.scores(), queryFn: () => scores.me(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: profile } = useQuery({ queryKey: dataKeys.profile(), queryFn: () => users.me(token!), enabled: !!token, staleTime: 10 * 60 * 1000 })
  const { data: jobsData, isLoading: jobsLoading } = useQuery({ queryKey: dataKeys.jobs(), queryFn: () => withLocalCache(userCacheKey(token!, ["matches"]), MATCHES_TTL, () => jobs.matches(token!)), enabled: !!token, staleTime: MATCHES_TTL })
  const { data: applications } = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobs.applications(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const historyQuery = useQuery({ queryKey: dataKeys.diary(), queryFn: () => diary.history(token!), enabled: !!token })
  const { data: evidenceData } = useQuery({ queryKey: dataKeys.cvEvidence(), queryFn: () => cv.evidence(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })

  const allMatchedJobs = useMemo(() => jobsData?.jobs ?? [], [jobsData])
  const topJobs = useMemo(() => allMatchedJobs.slice(0, 5), [allMatchedJobs])
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
  const analysedJobIds = useMemo(() => new Set(allMatchedJobs.map(j => j.job_id)), [allMatchedJobs])

  const hasAutoOpened = useRef(false)
  useEffect(() => {
    if (hasAutoOpened.current || urlJobId || !topJobs[0]?.job_id) return
    hasAutoOpened.current = true
    setActiveJobId(topJobs[0].job_id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topJobs[0]?.job_id, urlJobId])

  const saveEntry = useMutation({ mutationFn: ({ text, cart }: { text: string; cart: CartSkill[] }) => diary.createEntry(token!, text, undefined, cart.map(s => ({ ...s }))), onSuccess: () => { addBalance(30); clearCart(); showToast("+30 XP · entry logged"); queryClient.invalidateQueries({ queryKey: dataKeys.diary() }); queryClient.invalidateQueries({ queryKey: dataKeys.scores() }) } })
  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) => jobs.updateApplication(token!, jobId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })
  const removeSelfFocus = useMutation({ mutationFn: (jobId: string) => jobs.removeTrackerJob(token!, jobId), onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }) })
  const [analysingJobId, setAnalysingJobId] = useState<string | null>(null)
  const analyseMutation = useMutation({
    mutationFn: (jobId: string) => jobs.analyseJob(token!, jobId),
    onMutate: (jobId) => setAnalysingJobId(jobId),
    onSettled: () => setAnalysingJobId(null),
    onSuccess: (data, jobId) => {
      setXPBalance(data.new_xp_balance)
      showToast(`Analysed · ${data.overlap_score}% match · −10 XP`)
      clearLocalCache(userCacheKey(token!, ["matches"]))
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      queryClient.invalidateQueries({ queryKey: dataKeys.skillGap(jobId) })
      setActiveJobId(jobId)
    },
    onError: () => showToast("Not enough XP — forge a session to earn more"),
  })
  const saveMilestoneProof = useMutation({ mutationFn: ({ jobId, milestoneId, proof }: { jobId: string; milestoneId: string; proof: string }) => jobs.updateMilestone(token!, jobId, milestoneId, { proof, confidence: confidence / 5, completed: true }), onSuccess: (_data, variables) => { setProofText(""); invalidateJobPathData(queryClient, variables.jobId) } })

  async function handleDiarySubmit(text: string, cart: CartSkill[]) { await saveEntry.mutateAsync({ text, cart }) }
  async function handleForgeSession(payload: { skill_name: string; duration_minutes: number }): Promise<ForgeSessionResult> { if (!token) throw new Error("Sign in first."); return xp.completeForge(token, { ...payload, session_type: "focused" }) }
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
          matchesExhausted={matchesExhausted}
          cartCount={cartSkills.length}
          onRefreshMatches={refreshMatches}
          onEnterForge={() => setForgeOpen(true)}
          onOpenDiary={() => { setDrawerOpen(true); openDiary() }}
        />

        <CVRequiredNudge hasCv={hasCv} feature="job matching" />

        {/* Focus strip */}
        {topJobs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "10px 16px", flexWrap: "wrap" }}>
            <StripLabel>Myro Found</StripLabel>
            {topJobs.map(j => {
              const isActive = j.job_id === activeJobId
              const fit = Math.round(j.overlap_score)
              const hasMilestoneDot = pendingMilestoneJobIds.has(j.job_id) && !isActive

              return (
                <SelectionChip
                  key={j.job_id}
                  active={isActive}
                  alertDot={hasMilestoneDot}
                  ariaLabel={`Focus ${j.company ?? "company"} at ${fit}% fit`}
                  onClick={() => setActiveJobId(j.job_id)}
                >
                  {j.company ?? "Company"}
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, opacity: 0.8 }}>· {fit}%</span>
                </SelectionChip>
              )
            })}
            <AddChip href="/jobs">Add target</AddChip>
          </div>
        )}

        {/* Self Focus strip */}
        {selfFocusJobs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "10px 16px", flexWrap: "wrap" }}>
            <StripLabel>Self Found</StripLabel>
            {selfFocusJobs.map(a => {
              const isAnalysed = analysedJobIds.has(a.job_id)
              const matchedJob = isAnalysed ? allMatchedJobs.find(j => j.job_id === a.job_id) : null
              const isActive = a.job_id === activeJobId

              if (isAnalysed && matchedJob) {
                const fit = Math.round(matchedJob.overlap_score)
                return (
                  <div key={a.job_id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <SelectionChip
                      active={isActive}
                      ariaLabel={`Focus ${a.company ?? a.title ?? "self found role"} at ${fit}% fit`}
                      onClick={() => setActiveJobId(a.job_id)}
                    >
                      {a.company ?? a.title}
                      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, opacity: 0.8 }}>· {fit}%</span>
                    </SelectionChip>
                    <IconButton label={`Remove ${a.company ?? a.title ?? "self found role"}`} onClick={() => removeSelfFocus.mutate(a.job_id)}>
                      ✕
                    </IconButton>
                  </div>
                )
              }

              return (
                <div key={a.job_id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <InfoPill style={{ maxWidth: 180, overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.company ?? a.title}
                    </span>
                  </InfoPill>
                  <InlineActionPill
                    onClick={() => analyseMutation.mutate(a.job_id)}
                    disabled={analysingJobId === a.job_id}
                    ariaLabel={`Analyse ${a.company ?? a.title ?? "self found role"} for 10 XP`}
                  >
                    {analysingJobId === a.job_id ? "Analysing" : "Analyse · 10 XP"}
                  </InlineActionPill>
                  <IconButton label={`Remove ${a.company ?? a.title ?? "self found role"}`} onClick={() => removeSelfFocus.mutate(a.job_id)}>
                    ✕
                  </IconButton>
                </div>
              )
            })}
            <AddChip href="/market">Find more</AddChip>
          </div>
        )}

        {/* Stale banner moved to /tracker (PTL v1, Q1+Q11). */}

        {/* Main content: job detail OR matched jobs grid */}
        {activeJob ? (
          <>
            <button
              onClick={() => setActiveJobId(null)}
              className="tm-control-focus"
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, minHeight: 34, padding: "0 13px", borderRadius: 999, fontSize: 12, fontWeight: 650, color: "var(--tm-text-muted)", background: "rgba(255,255,255,0.025)", border: "1px solid var(--tm-border-soft)", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.background = "var(--tm-accent-wash)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-muted)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)"; e.currentTarget.style.background = "rgba(255,255,255,0.025)" }}
            >
              ← All matches
            </button>
            <div className="tm-home-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
              <HeroCard job={activeJob} status={activeJobStatus} skillGapData={skillGapData} onStatus={s => updateStatus.mutate({ jobId: activeJob.job_id, status: s })} onForge={() => setForgeOpen(true)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <SkillGapCol skillGapData={skillGapData} cartSkillNames={cartSkillNames} onSkillToggle={handleSkillToggle} />
              </div>
            </div>
          </>
        ) : topJobs.length > 0 ? (
          <div style={{ padding: "32px 28px", textAlign: "center", borderRadius: 10, border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Select a role above to see skill gap + CV tools</div>
            <Link href="/jobs" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>View all matched jobs →</Link>
          </div>
        ) : !jobsLoading ? (
          <div style={{ padding: "32px 28px", textAlign: "center", borderRadius: 10, border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No matches yet — upload your CV then refresh</div>
            <Link href="/jobs" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Go to Matched Jobs →</Link>
          </div>
        ) : null}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,10,24,0.65)", backdropFilter: "blur(4px)", zIndex: 50 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "100vw", background: "var(--tm-surface)", borderLeft: "1px solid var(--tm-accent-ring)", zIndex: 51, padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tm-text)" }}>Diary · cart · milestone</h2>
              <button
                type="button"
                aria-label="Close diary cart"
                className="tm-control-focus"
                onClick={() => setDrawerOpen(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 14, fontFamily: "inherit" }}
              >
                ✕
              </button>
            </div>
            <RightRail job={activeJob} jobPath={activeJobPath} cartSkills={cartSkills} onRemoveCart={c => removeSkill(c.skill_name)} onSendBatch={handleSendBatch} achievements={ACHIEVEMENTS} proofText={proofText} savingProof={saveMilestoneProof.isPending} onProofChange={setProofText} onSaveProof={milestone => activeJob && saveMilestoneProof.mutate({ jobId: activeJob.job_id, milestoneId: milestone.id, proof: proofText })} />
          </div>
        </>
      )}

      {forgeOpen && (
        <ForgeModal cartSkills={cartSkills.length > 0 ? cartSkills : gapSkills.slice(0, 3).map(g => ({ skill_name: g.skill, level_from: g.user_level, level_to: g.required_level, company: activeJob?.company ?? undefined }))} onClose={() => setForgeOpen(false)} onXPEarned={(amount, newBalance) => { addBalance(amount); setXPBalance(newBalance) }} onCompleteSession={handleForgeSession} onOpenDiary={() => openDiary()} />
      )}

      <DiaryPanel open={diaryOpen} onClose={closeDiary} initialText={diaryInitialText} cartSkills={cartSkills} onAddSkill={addSkill} onRemoveSkill={removeSkill} gapSkills={gapSkills.map(g => ({ skill: g.skill, user_level: g.user_level, required_level: g.required_level }))} activeCompany={activeJob?.company} onSubmit={handleDiarySubmit} recentEntries={entries} />

      {/* ReviewModal trigger moved to /tracker (PTL v1, Q1). */}
    </AppShell>
  )
}

export default function HomePage() {
  return <Suspense><HomePageInner /></Suspense>
}
