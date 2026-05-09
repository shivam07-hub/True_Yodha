"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { JourneyStrip } from "@/components/common/journey-strip"
import { ForgeModal } from "@/components/forge/ForgeModal"
import { DiaryPanel } from "@/components/diary/DiaryPanel"
import { HeroCard } from "@/components/home/HeroCard"
import { RightRail } from "@/components/home/RightRail"
import { ForgeStrip } from "@/components/home/ForgeStrip"
import { PipelineCol, CVCol } from "@/components/home/HomeColumns"
import { cv, diary, jobs, scores, users, xp } from "@/lib/api"
import { dataKeys, invalidateJobPathData } from "@/lib/domain-data"
import type { CartSkill, ForgeSessionResult } from "@/types/xp"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { computeStreak } from "@/lib/forge-helpers"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"
import { useCartStore } from "@/store/cartStore"
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
  const { balance: xpBalance, setBalance: setXPBalance, addBalance } = useXPStore()
  const { skills: cartSkills, addSkill, removeSkill, clearCart } = useCartStore()

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [forgeOpen, setForgeOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [proofText, setProofText] = useState("")
  const [confidence] = useState(3)

  const { open: diaryOpen, initialText: diaryInitialText, openDiary, closeDiary } = useDiaryIntentStore()
  const urlJobId = searchParams.get("jobId")

  const { data: scoreData } = useQuery({ queryKey: dataKeys.scores(), queryFn: () => scores.me(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: profile } = useQuery({ queryKey: dataKeys.profile(), queryFn: () => users.me(token!), enabled: !!token, staleTime: 10 * 60 * 1000 })
  const { data: jobsData } = useQuery({ queryKey: dataKeys.jobs(), queryFn: () => withLocalCache(userCacheKey(token!, ["matches"]), MATCHES_TTL, () => jobs.matches(token!)), enabled: !!token, staleTime: MATCHES_TTL })
  const { data: applications } = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobs.applications(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const historyQuery = useQuery({ queryKey: dataKeys.diary(), queryFn: () => diary.history(token!), enabled: !!token })
  const { data: evidenceData } = useQuery({ queryKey: dataKeys.cvEvidence(), queryFn: () => cv.evidence(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })

  const topJobs = jobsData?.jobs?.slice(0, 5) ?? []
  const apps = applications ?? []
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const score = scoreData?.total_score ?? 0
  const hasCv = !!scoreData
  const allTargetRoles = profile?.target_roles ?? []
  const targetRoles = allTargetRoles.length === 0 ? "Set your target role" : allTargetRoles.slice(0, 2).join(", ") + (allTargetRoles.length > 2 ? ` +${allTargetRoles.length - 2} more` : "")
  const targetLoc = profile?.target_location ?? "Set location"

  const activeJob = urlJobId ? (topJobs.find(j => j.job_id === urlJobId) ?? null) : (topJobs.find(j => j.job_id === activeJobId) ?? topJobs[0] ?? null)
  const appsByJobId = useMemo(() => { const m: Record<string, ApplicationStatus> = {}; for (const a of apps) m[a.job_id] = a.status; return m }, [apps])
  const activeJobStatus = activeJob ? (appsByJobId[activeJob.job_id] ?? "pending") : "pending"
  const cartSkillNames = useMemo(() => new Set(cartSkills.map(c => c.skill_name)), [cartSkills])

  useEffect(() => { if (!token) return; xp.balance(token).then(r => setXPBalance(r.balance)).catch(() => {}) }, [token, setXPBalance])

  const { data: skillGapData } = useQuery({ queryKey: dataKeys.skillGap(activeJob?.job_id ?? null), queryFn: () => jobs.skillGap(token!, activeJob!.job_id), enabled: !!token && !!activeJob?.job_id, staleTime: 10 * 60 * 1000 })
  const jobPathQuery = useQuery({ queryKey: dataKeys.jobPath(activeJob?.job_id ?? null), queryFn: () => jobs.path(token!, activeJob!.job_id), enabled: !!token && !!activeJob?.job_id && !!appsByJobId[activeJob.job_id], staleTime: 5 * 60 * 1000 })

  const gapSkills = skillGapData?.skills?.filter(g => g.missing) ?? []
  const ACHIEVEMENTS = [
    { label: "CV Analysed", done: !!scoreData, icon: "◈" },
    { label: "Score Computed", done: !!scoreData, icon: "◉" },
    { label: "First Entry", done: entries.length >= 1, icon: "▣" },
    { label: "5-Day Streak", done: streak >= 5, icon: "◆" },
    { label: "Gap Closed", done: gapSkills.length === 0 && !!activeJob, icon: "◑" },
    { label: "Score 80+", done: score >= 80, icon: "▲" },
  ]

  const saveEntry = useMutation({ mutationFn: ({ text, cart }: { text: string; cart: CartSkill[] }) => diary.createEntry(token!, text, undefined, cart.map(s => ({ ...s }))), onSuccess: () => { addBalance(30); clearCart(); showToast("+30 XP · entry logged"); queryClient.invalidateQueries({ queryKey: dataKeys.diary() }); queryClient.invalidateQueries({ queryKey: dataKeys.scores() }) } })
  const updateStatus = useMutation({ mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) => jobs.updateApplication(token!, jobId, { status }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: dataKeys.applications() }) } })
  const saveMilestoneProof = useMutation({ mutationFn: ({ jobId, milestoneId, proof }: { jobId: string; milestoneId: string; proof: string }) => jobs.updateMilestone(token!, jobId, milestoneId, { proof, confidence: confidence / 5, completed: true }), onSuccess: (_data, variables) => { setProofText(""); invalidateJobPathData(queryClient, variables.jobId) } })
  const generateJobCv = useMutation({ mutationFn: ({ aiPolish }: { aiPolish: boolean }) => jobs.generateJobCv(token!, activeJob!.job_id, aiPolish), onSuccess: () => invalidateJobPathData(queryClient, activeJob!.job_id) })

  async function handleDiarySubmit(text: string, cart: CartSkill[]) { await saveEntry.mutateAsync({ text, cart }) }
  async function handleForgeSession(payload: { skill_name: string; duration_minutes: number }): Promise<ForgeSessionResult> { if (!token) throw new Error("Sign in first."); return xp.completeForge(token, payload) }
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
        {/* Header */}
        <div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em", color: "var(--tm-accent)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 8px var(--tm-accent-glow)", display: "inline-block" }} />
            Target: {targetRoles} · {targetLoc}
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--tm-text)" }}>Mission Control</h1>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.06em", marginTop: 6 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()} · {topJobs.length} active targets{apps.filter(a => a.status === "interviewing").length > 0 ? ` · ${apps.filter(a => a.status === "interviewing").length} in interview` : ""}
          </div>
          <div style={{ marginTop: 10 }}><JourneyStrip /></div>
        </div>

        <ForgeStrip streak={streak} sessions={entries.length} xpBalance={xpBalance} score={score} evidenceData={evidenceData ?? null} onEnterForge={() => setForgeOpen(true)} onOpenDiary={() => { setDrawerOpen(true); openDiary() }} cartCount={cartSkills.length} />

        <CVRequiredNudge hasCv={hasCv} feature="job matching" />

        {/* Focus strip */}
        {topJobs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "10px 16px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", marginRight: 4 }}>Active focus →</span>
            {topJobs.map(j => {
              const isActive = j.job_id === (activeJobId ?? topJobs[0]?.job_id)
              return (
                <button key={j.job_id} onClick={() => { setActiveJobId(j.job_id); setExpanded(true) }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: isActive ? "var(--tm-accent)" : "rgba(255,255,255,0.025)", border: `1.5px solid ${isActive ? "var(--tm-accent)" : "var(--tm-border)"}`, color: isActive ? "var(--tm-accent-fg)" : "var(--tm-text-muted)", cursor: "pointer", transition: "all 120ms var(--tm-ease)", boxShadow: isActive ? "0 0 12px var(--tm-accent-glow)" : "none" }}>
                  {j.company ?? "Company"}
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, opacity: 0.8 }}>· {Math.round(j.overlap_score)}%</span>
                </button>
              )
            })}
            <Link href="/market" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: "1.5px dashed var(--tm-border)", fontSize: 11.5, color: "var(--tm-text-faint)", textDecoration: "none" }}>+ Add target</Link>
          </div>
        )}

        {/* Hero + columns */}
        {activeJob ? (
          expanded ? (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, alignItems: "start" }}>
              <HeroCard job={activeJob} status={activeJobStatus} skillGapData={skillGapData} expanded={expanded} onToggle={() => setExpanded(v => !v)} onStatus={s => updateStatus.mutate({ jobId: activeJob.job_id, status: s })} cartSkillNames={cartSkillNames} onSkillToggle={handleSkillToggle} onForge={() => setForgeOpen(true)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <PipelineCol apps={apps} activeJobId={activeJob.job_id} onPick={id => setActiveJobId(id)} />
                <CVCol job={activeJob} onSpendXP={handleSpendXP} />
              </div>
            </div>
          ) : (
            <>
              <HeroCard job={activeJob} status={activeJobStatus} skillGapData={skillGapData} expanded={expanded} onToggle={() => setExpanded(v => !v)} onStatus={s => updateStatus.mutate({ jobId: activeJob.job_id, status: s })} cartSkillNames={cartSkillNames} onSkillToggle={handleSkillToggle} onForge={() => setForgeOpen(true)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <PipelineCol apps={apps} activeJobId={activeJob.job_id} onPick={id => setActiveJobId(id)} />
                <CVCol job={activeJob} onSpendXP={handleSpendXP} />
              </div>
            </>
          )
        ) : (
          <div style={{ padding: "28px", textAlign: "center", borderRadius: 10, border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No active job targeted yet</div>
            <Link href="/market" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Browse Intel →</Link>
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
            <RightRail job={activeJob} jobPath={jobPathQuery.data} cartSkills={cartSkills} onRemoveCart={c => removeSkill(c.skill_name)} onSendBatch={handleSendBatch} achievements={ACHIEVEMENTS} proofText={proofText} savingProof={saveMilestoneProof.isPending} onProofChange={setProofText} onSaveProof={milestone => activeJob && saveMilestoneProof.mutate({ jobId: activeJob.job_id, milestoneId: milestone.id, proof: proofText })} generatingCv={generateJobCv.isPending} onGenerateCv={() => activeJob && generateJobCv.mutate({ aiPolish: false })} onPolishCv={() => activeJob && generateJobCv.mutate({ aiPolish: true })} />
          </div>
        </>
      )}

      {forgeOpen && (
        <ForgeModal cartSkills={cartSkills.length > 0 ? cartSkills : gapSkills.slice(0, 3).map(g => ({ skill_name: g.skill, level_from: g.user_level, level_to: g.required_level, company: activeJob?.company ?? undefined }))} onClose={() => setForgeOpen(false)} onXPEarned={(amount, newBalance) => { addBalance(amount); setXPBalance(newBalance) }} onCompleteSession={handleForgeSession} onOpenDiary={() => openDiary()} />
      )}

      <DiaryPanel open={diaryOpen} onClose={closeDiary} initialText={diaryInitialText} cartSkills={cartSkills} onAddSkill={addSkill} onRemoveSkill={removeSkill} gapSkills={gapSkills.map(g => ({ skill: g.skill, user_level: g.user_level, required_level: g.required_level }))} activeCompany={activeJob?.company} onSubmit={handleDiarySubmit} recentEntries={entries} />
    </AppShell>
  )
}

export default function HomePage() {
  return <Suspense><HomePageInner /></Suspense>
}
