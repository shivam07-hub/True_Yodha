"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useForgeTimerStore, FORGE_AMBIENT_DURATION, FORGE_AMBIENT_RATE } from "@/store/forgeTimerStore"
import type { ForgeSessionResult } from "@/types/xp"

const RING_R = 38
const RING_CIRC = 2 * Math.PI * RING_R
const MINI_R = 11
const MINI_CIRC = 2 * Math.PI * MINI_R
const XP_LABEL = FORGE_AMBIENT_DURATION / 60 * FORGE_AMBIENT_RATE  // 50

interface Props {
  onXPEarned: (amount: number, newBalance: number) => void
  onCompleteSession: (payload: { skill_name: string; duration_minutes: number }) => Promise<ForgeSessionResult>
  onSaveReflection: (text: string, skillName: string) => Promise<void>
}

export function ForgeFloatingTimer({ onXPEarned, onCompleteSession, onSaveReflection }: Props) {
  const {
    sessionActive, skillName, dismissed, running, minimized, remaining,
    setRunning, setMinimized, tick, resetSession, dismiss,
  } = useForgeTimerStore()

  const [reflection, setReflection] = useState("")
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [nudging, setNudging] = useState(true)
  const nudgeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Stop attention nudge after 4s
  useEffect(() => {
    if (!sessionActive) return
    nudgeRef.current = setTimeout(() => setNudging(false), 4000)
    return () => { if (nudgeRef.current) clearTimeout(nudgeRef.current) }
  }, [sessionActive])

  // Timer tick
  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running, tick])

  // Auto-expand when timer completes
  useEffect(() => {
    if (remaining === 0 && !running && sessionActive) {
      setMinimized(false)
    }
  }, [remaining, running, sessionActive, setMinimized])

  const isComplete = remaining === 0 && !running && sessionActive
  const progress = remaining / FORGE_AMBIENT_DURATION
  const fullDashOffset = RING_CIRC * (1 - progress)
  const miniDashOffset = MINI_CIRC * (1 - progress)
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0")
  const secs = String(remaining % 60).padStart(2, "0")
  const canClaim = reflection.trim().length >= 1

  async function handleClaim() {
    if (!skillName || !canClaim || claiming) return
    try {
      setClaiming(true)
      setClaimError(null)
      const [result] = await Promise.all([
        onCompleteSession({ skill_name: skillName, duration_minutes: FORGE_AMBIENT_DURATION / 60 }),
        onSaveReflection(reflection.trim(), skillName),
      ])
      onXPEarned(result.xp_earned, result.new_xp_balance)
      resetSession()
      setReflection("")
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Could not save session")
    } finally {
      setClaiming(false)
    }
  }

  if (!mounted || !sessionActive || dismissed) return null

  const accentColor = isComplete ? "var(--tm-success, #4ade80)" : "var(--tm-accent)"
  const ringGlow = isComplete
    ? "0 0 28px rgba(74,222,128,0.25), 0 8px 32px rgba(0,0,0,0.6)"
    : "0 8px 32px rgba(0,0,0,0.6), 0 0 16px rgba(0,245,212,0.08)"

  const entranceStyle = nudging
    ? { animation: "fft-entrance 500ms cubic-bezier(0.25,0.46,0.45,0.94) forwards, fft-attention 900ms 500ms ease 3" }
    : {}

  // ── Minimized pill ───────────────────────────────────────────────────────────
  if (minimized) {
    return createPortal(
      <>
        <style>{FFT_STYLES}</style>
        <button
          onClick={() => setMinimized(false)}
          title="Expand Forge timer"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 200,
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px 6px 8px", borderRadius: 999,
            background: "rgba(7,7,17,0.95)",
            border: `1px solid ${isComplete ? "rgba(74,222,128,0.5)" : "var(--tm-accent-ring)"}`,
            boxShadow: isComplete
              ? "0 0 20px rgba(74,222,128,0.3), 0 4px 16px rgba(0,0,0,0.5)"
              : "0 4px 16px rgba(0,0,0,0.5)",
            cursor: "pointer", backdropFilter: "blur(16px)",
            ...entranceStyle,
          }}
        >
          <svg width={28} height={28} viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
            <circle cx={14} cy={14} r={MINI_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2} />
            <circle cx={14} cy={14} r={MINI_R} fill="none" stroke={accentColor} strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${MINI_CIRC} ${MINI_CIRC}`}
              strokeDashoffset={miniDashOffset}
              style={{ transition: running ? "stroke-dashoffset 1s linear" : "none" }}
            />
          </svg>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, fontWeight: 600, color: accentColor, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>
            {isComplete ? "Note →" : `${mins}:${secs}`}
          </span>
          {!isComplete && (
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {skillName}
            </span>
          )}
        </button>
      </>,
      document.body
    )
  }

  // ── Expanded card ─────────────────────────────────────────────────────────────
  return createPortal(
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 200, width: 264,
      background: "rgba(7,7,17,0.97)",
      border: `1px solid ${isComplete ? "rgba(74,222,128,0.4)" : "var(--tm-accent-ring)"}`,
      borderRadius: "var(--tm-radius-lg, 16px)", backdropFilter: "blur(20px)",
      boxShadow: ringGlow,
      transition: "box-shadow 400ms ease, border-color 400ms ease",
      overflow: "hidden",
      ...entranceStyle,
    }}>
      <style>{FFT_STYLES}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--tm-text-faint)", textTransform: "uppercase" }}>◆ Forge</span>
          {running && (
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--tm-accent)", animation: "fft-pulse 1.4s ease infinite", boxShadow: "0 0 4px rgba(0,245,212,0.8)" }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {!isComplete && (
            <button onClick={() => setMinimized(true)} title="Minimize" style={iconBtnStyle}>−</button>
          )}
          <button onClick={dismiss} title="Dismiss" style={iconBtnStyle}>✕</button>
        </div>
      </div>

      {/* Ring + skill info */}
      <div style={{ padding: "16px 16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <svg width={88} height={88} viewBox="0 0 88 88" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={44} cy={44} r={RING_R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={3} />
            <circle cx={44} cy={44} r={RING_R} fill="none" stroke={isComplete ? "rgba(74,222,128,0.08)" : "rgba(0,245,212,0.06)"} strokeWidth={8} />
            <circle cx={44} cy={44} r={RING_R} fill="none" stroke={accentColor} strokeWidth={4} strokeLinecap="round"
              strokeDasharray={`${RING_CIRC} ${RING_CIRC}`} strokeDashoffset={fullDashOffset}
              style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 300ms ease" }}
            />
            {running && (
              <circle cx={44} cy={44} r={RING_R} fill="none" stroke="var(--tm-accent)" strokeWidth={4}
                strokeLinecap="round" strokeDasharray={`${RING_CIRC} ${RING_CIRC}`} strokeDashoffset={fullDashOffset}
                aria-hidden style={{ filter: "drop-shadow(0 0 8px rgba(0,245,212,0.6))", opacity: 0.3, transition: "stroke-dashoffset 1s linear" }}
              />
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 22, fontWeight: 300, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: isComplete ? "var(--tm-success, #4ade80)" : "var(--tm-text)", lineHeight: 1 }}>
              {isComplete ? "✓" : `${mins}:${secs}`}
            </div>
            <div style={{ fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              {isComplete ? "done" : running ? "forging" : "paused"}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 2 }}>Forging</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 232 }}>
            {skillName}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {!isComplete ? (
          <>
            <button
              onClick={() => setRunning(!running)}
              style={{
                width: "100%", padding: "8px", borderRadius: "var(--tm-radius-pill, 999px)",
                background: running ? "rgba(255,255,255,0.06)" : "var(--tm-accent)",
                border: running ? "1px solid rgba(255,255,255,0.1)" : "none",
                color: running ? "var(--tm-text-muted)" : "var(--tm-accent-fg, #070711)",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                transition: "all 150ms ease",
              }}
            >
              {running ? "⏸ Pause" : "▶ Start"}
            </button>
            <div style={{ textAlign: "center", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              +{XP_LABEL} XP on completion · {FORGE_AMBIENT_RATE} XP/min
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>
              One line about what you practiced:
            </div>
            <textarea
              value={reflection}
              onChange={(e) => { setReflection(e.target.value); setClaimError(null) }}
              placeholder={`I practiced ${skillName} by…`}
              rows={2}
              style={{
                width: "100%", resize: "none", borderRadius: "var(--tm-radius-sm, 8px)",
                border: `1px solid ${claimError ? "var(--tm-danger, #f87171)" : "var(--tm-border)"}`,
                background: "rgba(255,255,255,0.04)",
                color: "var(--tm-text)", padding: "8px 10px",
                fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
            {claimError && (
              <div style={{ fontSize: 10, color: "var(--tm-danger, #f87171)" }}>{claimError}</div>
            )}
            <button
              onClick={handleClaim}
              disabled={!canClaim || claiming}
              style={{
                width: "100%", padding: "8px", borderRadius: "var(--tm-radius-pill, 999px)",
                background: canClaim && !claiming ? "var(--tm-accent)" : "rgba(255,255,255,0.05)",
                border: "none",
                color: canClaim && !claiming ? "var(--tm-accent-fg, #070711)" : "var(--tm-text-faint)",
                fontSize: 12, fontWeight: 700,
                cursor: canClaim && !claiming ? "pointer" : "default",
                fontFamily: "inherit", transition: "all 200ms ease",
              }}
            >
              {claiming ? "Saving…" : `Claim +${XP_LABEL} XP →`}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: "50%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--tm-text-faint)", cursor: "pointer",
  display: "grid", placeItems: "center",
  fontSize: 11, fontFamily: "inherit",
}

const FFT_STYLES = `
  @keyframes fft-entrance {
    0%   { opacity: 0; transform: translateY(16px) scale(0.93); }
    60%  { transform: translateY(-3px) scale(1.01); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes fft-attention {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,245,212,0.45); }
    50%       { box-shadow: 0 0 0 7px rgba(0,245,212,0); }
  }
  @keyframes fft-pulse {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1; }
  }
`
