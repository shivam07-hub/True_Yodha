"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import type { CartSkill, ForgeSessionResult } from "@/types/xp"
import { XP_POLICY } from "@/lib/xp-policy"
import { claimableForgeMinutes, claimableForgeXP, forgeProgressRatio } from "@/lib/forge-progress"

const RING_R = 84
const RING_CIRC = 2 * Math.PI * RING_R

const DURATIONS = [
  { label: "25 min", seconds: 25 * 60 },
  { label: "40 min", seconds: 40 * 60 },
  { label: "60 min", seconds: 60 * 60 },
]

// Deterministic edge particle positions
const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const edge = i % 4
  const pct = ((i * 37 + 13) % 100)
  const delay = (i * 0.4) % 5
  const dur = 2.5 + (i % 4) * 0.7
  return { edge, pct, delay, dur }
})

interface SessionResult { skill: CartSkill; result: ForgeSessionResult }

interface ForgeModalProps {
  cartSkills: CartSkill[]
  onClose: () => void
  onXPEarned: (amount: number, newBalance: number) => void
  onCompleteSession: (payload: { skill_name: string; duration_minutes: number }) => Promise<ForgeSessionResult>
  onOpenDiary?: () => void
}

type Screen = "queue" | "session" | "complete"

export function ForgeModal({ cartSkills, onClose, onXPEarned, onCompleteSession, onOpenDiary }: ForgeModalProps) {
  const [screen, setScreen] = useState<Screen>("queue")
  const [sessionIdx, setSessionIdx] = useState(0)
  const [glowX, setGlowX] = useState(-400)
  const [glowY, setGlowY] = useState(-400)
  const [durIdx, setDurIdx] = useState(0)
  const [remaining, setRemaining] = useState(DURATIONS[0].seconds)
  const [running, setRunning] = useState(false)
  const [sessionsDone, setSessionsDone] = useState<SessionResult[]>([])
  const [saving, setSaving] = useState(false)
  const [levelUpSkill, setLevelUpSkill] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const duration = DURATIONS[durIdx].seconds
  const progress = forgeProgressRatio(duration, remaining)
  const dashOffset = RING_CIRC * (1 - progress)
  const currentSkill = cartSkills[sessionIdx]
  const hasForgeTarget = cartSkills.length > 0
  const totalXP = sessionsDone.reduce((s, r) => s + r.result.xp_earned, 0)
  const isTimerDone = remaining === 0 && !running
  const readyXP = claimableForgeXP(duration, remaining, XP_POLICY.forgeFocusedRate)
  const claimMinutes = claimableForgeMinutes(duration, remaining)
  const canClaim = readyXP > 0

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); setRunning(false); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    setGlowX(e.clientX)
    setGlowY(e.clientY)
  }

  function changeDuration(idx: number) {
    if (running) return
    setDurIdx(idx)
    setRemaining(DURATIONS[idx].seconds)
  }

  async function completeSession() {
    if (!currentSkill || !canClaim || saving) return
    try {
      setSaving(true)
      const result = await onCompleteSession({
        skill_name: currentSkill.skill_name,
        duration_minutes: claimMinutes,
      })
      setSessionsDone((prev) => [...prev, { skill: currentSkill, result }])
      onXPEarned(result.xp_earned, result.new_xp_balance)
      if (result.leveled_up) {
        setLevelUpSkill("Forge")
        setTimeout(() => setLevelUpSkill(null), 2500)
      }
      setSessionIdx((s) => cartSkills.length ? (s + 1) % cartSkills.length : 0)
      setRemaining(DURATIONS[durIdx].seconds)
      setRunning(true)
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  const overlay = (
    <div
      onMouseMove={handleMouseMove}
      style={{
        position: "fixed", inset: 0, zIndex: "var(--z-modal)" as never,
        background: "#070711", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* CSS keyframes for particles */}
      <style>{`
        @keyframes forge-particle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.7; transform: scale(1.4); }
        }
      `}</style>

      {/* Cursor glow */}
      <div style={{
        position: "absolute", width: 480, height: 480, borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle, rgba(0,245,212,0.13) 0%, transparent 68%)",
        transform: `translate(${glowX - 240}px, ${glowY - 240}px)`,
        transition: "transform 60ms linear",
      }} />

      {/* Edge particles */}
      {PARTICLES.map((p, i) => {
        const s: React.CSSProperties = {
          position: "absolute", width: 3, height: 3, borderRadius: "50%",
          background: "var(--tm-accent)", opacity: 0,
          animation: `forge-particle ${p.dur}s ${p.delay}s infinite ease-in-out`,
          boxShadow: "0 0 5px rgba(0,245,212,0.9)",
        }
        if (p.edge === 0) { s.top = 0; s.left = `${p.pct}%` }
        else if (p.edge === 1) { s.right = 0; s.top = `${p.pct}%` }
        else if (p.edge === 2) { s.bottom = 0; s.left = `${p.pct}%` }
        else { s.left = 0; s.top = `${p.pct}%` }
        return <div key={i} style={s} />
      })}

      {/* Level-up flash */}
      {levelUpSkill && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(7,7,17,0.75)", backdropFilter: "blur(4px)",
          animation: "tmPageIn 200ms var(--tm-ease) forwards",
        }}>
          <div style={{
            textAlign: "center", padding: "40px 64px",
            borderRadius: "var(--tm-radius-xl)",
            border: "1px solid var(--tm-accent-ring)",
            background: "rgba(0,245,212,0.05)",
            boxShadow: "0 0 60px rgba(0,245,212,0.15)",
          }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 52, color: "var(--tm-accent)", lineHeight: 1, marginBottom: 12, filter: "drop-shadow(0 0 16px rgba(0,245,212,0.6))" }}>◆</div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 22, color: "var(--tm-accent)", letterSpacing: "0.15em", marginBottom: 8 }}>LEVEL UP</div>
          </div>
        </div>
      )}

      {/* ── QUEUE SCREEN ── */}
      {screen === "queue" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 32 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.18em", color: "var(--tm-text-faint)", marginBottom: 10 }}>
              FORGE XP · {XP_POLICY.forgeFocusedRate} XP/MIN · SOFT CAP {DURATIONS[durIdx].label.toUpperCase()}
            </div>
            <div style={{ width: 220, height: 220, borderRadius: "50%", border: "1px solid var(--tm-accent-ring)", display: "grid", placeItems: "center", margin: "24px auto 0", boxShadow: "0 0 48px rgba(0,245,212,0.14), inset 0 0 40px rgba(0,245,212,0.04)" }}>
              <div>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 44, color: "var(--tm-accent)", fontWeight: 700, lineHeight: 1 }}>+0</div>
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 8 }}>XP ready</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (!hasForgeTarget) return
                setScreen("session")
                setRunning(true)
              }}
              disabled={!hasForgeTarget}
              style={{
                padding: "14px 40px", borderRadius: "var(--tm-radius-pill)",
                background: hasForgeTarget ? "var(--tm-accent)" : "rgba(255,255,255,0.05)", border: "none",
                color: hasForgeTarget ? "var(--tm-accent-fg)" : "var(--tm-text-faint)", fontSize: 15, fontWeight: 700,
                cursor: hasForgeTarget ? "pointer" : "default", fontFamily: "inherit",
                boxShadow: hasForgeTarget ? "0 0 28px rgba(0,245,212,0.35)" : "none",
              }}
            >
              Start forging ↗
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--tm-text-faint)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "6px 12px" }}>
              Exit
            </button>
          </div>
        </div>
      )}

      {/* ── SESSION SCREEN ── */}
      {screen === "session" && currentSkill && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 24px", gap: 16 }}>
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--tm-text-faint)" }}>
              FORGE XP
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {totalXP > 0 && (
                <div style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(0,245,212,0.06)", border: "1px solid var(--tm-accent-ring)", fontSize: 11, color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)" }}>
                  +{totalXP} XP today
                </div>
              )}
              <button onClick={onClose} style={{ padding: "5px 14px", borderRadius: "var(--tm-radius-pill)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-faint)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Exit
              </button>
            </div>
          </div>

          {/* SVG Ring */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
            <div style={{ position: "relative", width: "min(60vh,60vw,420px)", aspectRatio: "1/1" }}>
              <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={100} cy={100} r={RING_R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
                <circle cx={100} cy={100} r={RING_R} fill="none" stroke="rgba(0,245,212,0.06)" strokeWidth={8} />
                <circle cx={100} cy={100} r={RING_R} fill="none" stroke="var(--tm-accent)" strokeWidth={5}
                  strokeLinecap="round" strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                  strokeDashoffset={dashOffset}
                  style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 300ms var(--tm-ease)" }}
                />
                {running && (
                  <circle cx={100} cy={100} r={RING_R} fill="none" stroke="var(--tm-accent)" strokeWidth={5}
                    strokeLinecap="round" strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                    strokeDashoffset={dashOffset} aria-hidden
                    style={{ filter: "drop-shadow(0 0 10px rgba(0,245,212,0.7))", opacity: 0.4, transition: "stroke-dashoffset 1s linear" }}
                  />
                )}
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 24 }}>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: "clamp(40px,8vw,80px)", fontWeight: 700, color: isTimerDone ? "var(--tm-success)" : "var(--tm-text)", letterSpacing: 0, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  +{readyXP}
                </div>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  XP ready
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Duration picker */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              {DURATIONS.map((d, i) => (
                <button key={d.label} onClick={() => changeDuration(i)} disabled={running} style={{
                  padding: "4px 14px", borderRadius: 999, fontSize: 12, fontFamily: "inherit",
                  cursor: running ? "default" : "pointer",
                  background: i === durIdx ? "rgba(0,245,212,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${i === durIdx ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  color: i === durIdx ? "var(--tm-accent)" : "var(--tm-text-faint)",
                  opacity: running && i !== durIdx ? 0.3 : 1,
                }}>{d.label}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              <button onClick={() => setRunning((r) => !r)} style={{
                padding: "12px 28px", borderRadius: "var(--tm-radius-pill)",
                background: running ? "rgba(255,255,255,0.06)" : "var(--tm-accent)", border: running ? "1px solid rgba(255,255,255,0.1)" : "none",
                color: running ? "var(--tm-text-muted)" : "var(--tm-accent-fg)", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: running ? "none" : "0 0 20px rgba(0,245,212,0.3)",
              }}>
                {running ? "⏸ Pause" : "▶ Start"}
              </button>
              <button onClick={completeSession} disabled={!canClaim || saving} style={{
                padding: "12px 34px", borderRadius: "var(--tm-radius-pill)",
                background: canClaim && !saving ? "var(--tm-accent)" : "rgba(255,255,255,0.05)", border: canClaim && !saving ? "none" : "1px solid rgba(255,255,255,0.08)",
                color: canClaim && !saving ? "var(--tm-accent-fg)" : "var(--tm-text-faint)", fontSize: 14, fontWeight: 700,
                cursor: canClaim && !saving ? "pointer" : "default", fontFamily: "inherit",
                boxShadow: canClaim && !saving ? "0 0 20px rgba(0,245,212,0.3)" : "none",
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? "Saving…" : `Claim +${readyXP} XP`}
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              {running ? "Building" : "Paused"} · {XP_POLICY.forgeFocusedRate} XP/min
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLETE SCREEN ── */}
      {screen === "complete" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 28 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.18em", color: "var(--tm-text-faint)", marginBottom: 8 }}>
              FORGE COMPLETE · {sessionsDone.length} SESSION{sessionsDone.length !== 1 ? "S" : ""}
            </div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 36, color: "var(--tm-accent)", fontWeight: 700, filter: "drop-shadow(0 0 16px rgba(0,245,212,0.4))" }}>
              +{totalXP} XP
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, width: "100%", maxWidth: 480 }}>
            {sessionsDone.map(({ result }, idx) => (
              <div key={idx} style={{
                padding: "14px 16px", borderRadius: "var(--tm-radius)",
                border: "1px solid var(--tm-accent-ring)",
                background: "rgba(0,245,212,0.04)", display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)" }}>Forge claim</div>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-accent)" }}>+{result.xp_earned} XP</div>
                {result.leveled_up && (
                  <div style={{ fontSize: 11, color: "var(--tm-success)" }}>◆ L{result.level_before} → L{result.level_after}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {onOpenDiary && (
              <button onClick={() => { onClose(); onOpenDiary() }} style={{
                padding: "10px 24px", borderRadius: "var(--tm-radius-pill)",
                background: "var(--tm-accent)", border: "none",
                color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                Log in diary →
              </button>
            )}
            <button onClick={onClose} style={{
              padding: "10px 24px", borderRadius: "var(--tm-radius-pill)",
              background: "transparent", border: "1px solid var(--tm-border)",
              color: "var(--tm-text-faint)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
