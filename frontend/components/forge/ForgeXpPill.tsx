"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { xp } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import {
  FORGE_AMBIENT_DURATION,
  FORGE_AMBIENT_RATE,
  pendingXpFromMinutes,
  useForgeTimerStore,
} from "@/store/forgeTimerStore"
import "./forge-xp-pill.css"

interface Props {
  /** User's current XP balance, controlled by parent. */
  xpBalance: number
  /** Called when a successful claim returns from backend with the new balance. */
  onClaimed?: (newBalance: number, xpEarned: number) => void
  /** Optional click on the XP segment (e.g. open XP guide modal). */
  onXpClick?: () => void
}

/**
 * Top-bar widget — the only XP/Forge surface the user needs.
 *
 * Three states:
 *   idle        : no active session. Show XP balance + faint "Forge" CTA → /forge.
 *   running     : active session. Show XP balance + live mm:ss countdown.
 *   claim-ready : pendingMinutes > 0 → show "Claim +N XP" button alongside XP.
 *
 * Replaces the bottom-nav Forge slot per 2026-05-21 UX redesign — Forge is
 * now an ambient top-mounted surface, not a destination.
 */
export function ForgeXpPill({ xpBalance, onClaimed, onXpClick }: Props) {
  const {
    skillName,
    skillId,
    sessionActive,
    running,
    remaining,
    pendingMinutes,
    tick,
    markClaimed,
  } = useForgeTimerStore()

  const [showClaimToast, setShowClaimToast] = useState<number | null>(null)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [running, tick])

  const claim = useMutation({
    mutationFn: async (minutes: number) => {
      const token = getAccessToken()
      if (!token) throw new Error("No auth token")
      if (!skillName) throw new Error("No active skill")
      return xp.completeForge(token, {
        skill_name: skillName,
        skill_id: skillId ?? undefined,
        duration_minutes: minutes,
        session_type: "ambient",
      })
    },
    onSuccess: (result, minutes) => {
      markClaimed(minutes)
      setShowClaimToast(result.xp_earned)
      window.setTimeout(() => setShowClaimToast(null), 1800)
      onClaimed?.(result.new_xp_balance, result.xp_earned)
    },
  })

  const pendingXp = pendingXpFromMinutes(pendingMinutes)
  const canClaim = pendingMinutes > 0 && !claim.isPending
  const secondsLeft = Math.max(0, remaining)
  const mm = Math.floor(secondsLeft / 60)
  const ss = secondsLeft % 60
  const ringPct = sessionActive
    ? ((FORGE_AMBIENT_DURATION - secondsLeft) / FORGE_AMBIENT_DURATION) * 100
    : 0

  return (
    <div className="tm-forge-xp-pill" data-state={sessionActive ? (running ? "running" : "paused") : "idle"}>
      <button
        type="button"
        onClick={onXpClick}
        className="tm-forge-xp-pill-xp"
        aria-label={`${xpBalance} XP — open XP guide`}
      >
        <span className="tm-forge-xp-pill-diamond" aria-hidden>◆</span>
        <span className="tm-forge-xp-pill-num">{xpBalance.toLocaleString()}</span>
        <span className="tm-forge-xp-pill-unit">XP</span>
      </button>

      {sessionActive ? (
        <Link
          href="/forge"
          className="tm-forge-xp-pill-timer"
          aria-label={`Forge running — ${mm} minutes ${ss} seconds remaining. Tap to open Forge.`}
        >
          <span className="tm-forge-xp-pill-ring" style={{ background: `conic-gradient(var(--tm-accent) ${ringPct}%, rgba(0,245,212,0.12) ${ringPct}%)` }} aria-hidden />
          <span className="tm-forge-xp-pill-time">
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
        </Link>
      ) : (
        <Link href="/forge" className="tm-forge-xp-pill-cta" aria-label="Open Forge">
          <span aria-hidden>◆</span>
          <span>Forge</span>
        </Link>
      )}

      {canClaim && (
        <button
          type="button"
          onClick={() => claim.mutate(pendingMinutes)}
          disabled={claim.isPending}
          className="tm-forge-xp-pill-claim"
          aria-label={`Claim ${pendingXp} XP`}
        >
          {claim.isPending ? "…" : `+${pendingXp}`}
        </button>
      )}

      {showClaimToast !== null && (
        <div className="tm-forge-xp-pill-toast" aria-live="polite">
          +{showClaimToast} XP
        </div>
      )}
    </div>
  )
}

// Re-export so legacy imports keep working — single source of truth for the
// ambient XP rate now lives in the store.
export { FORGE_AMBIENT_RATE }
