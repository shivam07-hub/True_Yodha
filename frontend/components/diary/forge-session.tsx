"use client"

import { useEffect, useRef, useState } from "react"
import { ForgeQuestCard, type QuestStep } from "./forge-quest-card"
import { LevelUpOverlay } from "./level-up-overlay"
import type { JobPathMilestone } from "@/lib/api"

interface ForgeSessionProps {
  skillName: string
  currentLevel: number
  milestones: JobPathMilestone[]
  jobName?: string
  onStepComplete: (milestoneId: string, proof: string) => void
  onSessionEnd: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

const CIRC = 2 * Math.PI * 24

const F = {
  bg: "#060C1A", surf: "#0B1424", border: "#1A2540",
  ac: "#00F5D4", acw: "rgba(0,245,212,0.08)", acr: "rgba(0,245,212,0.25)",
  text: "#E8F0FF", muted: "#7A88A8", faint: "#3A4560",
}

export function ForgeSession({ skillName, currentLevel, milestones, jobName, onStepComplete, onSessionEnd }: ForgeSessionProps) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [activeStep, setActiveStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [xpTotal, setXpTotal] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) return
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running])

  const questSteps: QuestStep[] = milestones.slice(0, 3).map((m, i) => ({
    n: i + 1,
    title: m.title ?? "Complete this milestone",
    description: m.action ?? "",
    xpReward: [120, 180, 240][i] ?? 120,
    proofPrompt: m.proof_prompt ?? undefined,
    done: completedSteps.has(m.id),
    active: activeStep === i && !completedSteps.has(m.id),
  }))

  const allDone = questSteps.every(s => s.done)
  const xpPct = Math.min((xpTotal / 540) * 100, 100)
  const levelProgressPct = Math.min(30 + (completedSteps.size / Math.max(milestones.length, 1)) * 50, 95)


  function handleStepComplete(milestoneId: string, proof: string) {
    const step = questSteps.find(s => s.done === false && s.active)
    const xp = step?.xpReward ?? 120
    setCompletedSteps(prev => new Set(Array.from(prev).concat(milestoneId)))
    setXpTotal(prev => prev + xp)
    if (completedSteps.size + 1 >= milestones.length) {
      setTimeout(() => setShowLevelUp(true), 400)
    } else {
      setActiveStep(prev => prev + 1)
    }
    onStepComplete(milestoneId, proof)
  }

  return (
    <div style={{ background: F.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <LevelUpOverlay
        show={showLevelUp}
        skillName={skillName}
        newLevel={currentLevel + 1}
        xpGained={xpTotal}
        onDone={() => { setShowLevelUp(false); onSessionEnd() }}
      />

      {/* Topbar */}
      <div style={{ height: 48, background: F.surf, borderBottom: `1px solid ${F.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: F.ac, opacity: 0.7 }}>FORGE · DEEP WORK CHAMBER</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: F.text, lineHeight: 1.1 }}>{skillName} — Level {currentLevel} → {currentLevel + 1}</div>
        </div>
        {jobName && (
          <div style={{ padding: "4px 12px", borderRadius: 6, background: F.acw, border: `1px solid ${F.acr}`, fontSize: 11, color: F.ac, flexShrink: 0 }}>
            For: {jobName}
          </div>
        )}
        <button onClick={onSessionEnd} style={{ padding: "5px 14px", borderRadius: 6, background: "transparent", border: `1px solid ${F.border}`, color: F.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          ✕ Exit
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "20px", display: "grid", gridTemplateColumns: "200px 1fr 180px", gap: 16, maxWidth: 1100, margin: "0 auto", width: "100%", alignItems: "start" }}>

        {/* Left: timer + XP */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Session timer */}
          <div style={{ background: F.surf, border: `1.5px solid ${F.acr}`, borderRadius: 10, padding: "18px 14px", textAlign: "center", boxShadow: `0 0 24px rgba(0,245,212,0.08)` }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: F.muted, marginBottom: 8 }}>Deep Work Time</div>
            <div style={{ fontSize: 42, fontWeight: 700, color: F.ac, lineHeight: 1, fontFamily: "var(--tm-font-mono)", textShadow: `0 0 24px rgba(0,245,212,0.5)` }}>
              {formatTime(elapsed)}
            </div>
            <div style={{ fontSize: 11, color: F.muted, marginTop: 4 }}>elapsed · you&apos;re in flow</div>
            <div style={{ height: 1, background: F.border, margin: "12px 0" }} />
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <button onClick={() => setRunning(r => !r)} style={{ padding: "5px 12px", borderRadius: 6, background: "transparent", border: `1px solid ${F.border}`, color: F.muted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
                {running ? "⏸" : "▶"}
              </button>
              <button onClick={onSessionEnd} style={{ padding: "5px 12px", borderRadius: 6, background: "transparent", border: `1px solid ${F.border}`, color: F.muted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>■</button>
            </div>
          </div>

          {/* XP progress */}
          <div style={{ background: F.surf, border: `1.5px solid ${F.border}`, borderRadius: 10, padding: "14px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: F.muted, marginBottom: 8 }}>Session XP</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: F.ac, fontFamily: "var(--tm-font-mono)", lineHeight: 1 }}>+{xpTotal}</div>
            <div style={{ height: 4, background: F.border, borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
              <div style={{ height: "100%", width: `${xpPct}%`, background: `linear-gradient(90deg, ${F.acr}, ${F.ac})`, borderRadius: 99, boxShadow: `0 0 8px ${F.ac}50`, transition: "width 600ms cubic-bezier(0.16,1,0.3,1)" }} />
            </div>
            <div style={{ fontSize: 10, color: F.faint, marginTop: 4 }}>{completedSteps.size}/{milestones.length} quests done</div>
          </div>
        </div>

        {/* Center: quest cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Skill ring header */}
          <div style={{ padding: "16px 18px", background: `linear-gradient(135deg, ${F.acw}, rgba(0,0,0,0.08))`, border: `1px solid ${F.acr}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: F.ac, marginBottom: 4 }}>FORGING NOW</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: F.text }}>{skillName}</div>
              <div style={{ fontSize: 12, color: F.muted }}>Quest {activeStep + 1} of {questSteps.length}{jobName ? ` · ${jobName}` : ""}</div>
            </div>
            {/* Circular level progress */}
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: F.muted, marginBottom: 6 }}>Level Progress</div>
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ display: "block" }}>
                <circle cx="28" cy="28" r="24" fill="none" stroke={F.border} strokeWidth="3" />
                <circle cx="28" cy="28" r="24" fill="none" stroke={F.ac} strokeWidth="3"
                  strokeDasharray={`${CIRC * levelProgressPct / 100} ${CIRC}`}
                  strokeLinecap="round"
                  style={{ transform: "rotate(-90deg)", transformOrigin: "28px 28px", transition: "stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)", filter: `drop-shadow(0 0 4px ${F.ac})` }}
                />
                <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill={F.ac} fontFamily="inherit">
                  {Math.round(levelProgressPct)}%
                </text>
              </svg>
              <div style={{ fontSize: 10, color: F.muted, marginTop: 2 }}>to L{currentLevel + 1}</div>
            </div>
          </div>

          {/* Quest cards */}
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: F.muted }}>
            TODAY&apos;S QUESTS
          </div>
          {questSteps.map((step, i) => (
            <ForgeQuestCard
              key={i}
              step={step}
              onComplete={(proof) => milestones[i] && handleStepComplete(milestones[i].id, proof)}
              disabled={i > activeStep && !completedSteps.has(milestones[i]?.id ?? "")}
            />
          ))}

          {allDone && (
            <div style={{ padding: "16px", borderRadius: 10, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.3)", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4ADE80", marginBottom: 4 }}>All quests complete! 🎉</div>
              <div style={{ fontSize: 12, color: F.muted }}>+{xpTotal} XP earned this session</div>
            </div>
          )}
        </div>

        {/* Right: skill mini-tree */}
        <div style={{ background: F.surf, border: `1.5px solid ${F.border}`, borderRadius: 10, padding: "14px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: F.muted, marginBottom: 10 }}>Skill Path</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[`L${currentLevel}`, `L${currentLevel + 1}`, `L${Math.min(currentLevel + 2, 5)}`].map((lvl, i) => {
              const unlocked = i === 0
              const current = i === 1
              return (
                <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: unlocked ? F.acw : current ? F.acw : "transparent",
                    border: `2px solid ${unlocked ? F.ac : current ? F.acr : F.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: unlocked ? F.ac : current ? F.muted : F.faint,
                    boxShadow: current ? `0 0 12px ${F.ac}30` : "none",
                  }}>{lvl}</div>
                  <div style={{ fontSize: 12, color: unlocked ? F.ac : current ? F.muted : F.faint }}>
                    {unlocked ? "Current" : current ? "Forging…" : "Next"}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ height: 1, background: F.border, margin: "12px 0" }} />
          <div style={{ fontSize: 10, color: F.faint, lineHeight: 1.6 }}>
            Proof logged in today&apos;s session unlocks the next level.
          </div>
        </div>
      </div>
    </div>
  )
}
