"use client"

import Link from "next/link"
import { useState } from "react"

import { useForgeSession } from "@/lib/hooks/use-forge-session"
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
 * Top-bar widget — the ambient Forge surface.
 *
 * Pure presentation. All session state + claim logic lives in useForgeSession
 * (see CONTEXT.md → "Forge Session"). The 1-second heartbeat is owned by
 * <ForgeClockDriver /> mounted in AppShell, NOT here.
 */
export function ForgeXpPill({ xpBalance, onClaimed, onXpClick }: Props) {
  const { state, mm, ss, ringPct, canClaim, claiming, pendingXp, claim } = useForgeSession()
  const [toast, setToast] = useState<number | null>(null)

  const sessionActive = state !== "idle"
  const running = state === "running"

  async function handleClaim() {
    if (!canClaim) return
    try {
      await claim({
        onClaimed: (result) => {
          setToast(result.xp_earned)
          window.setTimeout(() => setToast(null), 1800)
          onClaimed?.(result.new_xp_balance, result.xp_earned)
        },
      })
    } catch {
      // Hook already exposes claimError; toast handles success path.
    }
  }

  return (
    <div className="tm-forge-xp-pill" data-state={running ? "running" : sessionActive ? "paused" : "idle"}>
      <button
        type="button"
        onClick={onXpClick}
        className="tm-forge-xp-pill-xp"
        aria-label={`${xpBalance} XP — open XP guide`}
        style={{ position: "relative" }}
      >
        <span className="tm-forge-xp-pill-diamond" aria-hidden>◆</span>
        <span className="tm-forge-xp-pill-num">{xpBalance.toLocaleString()}</span>
        <span className="tm-forge-xp-pill-unit">XP</span>
        <XpDeltaNudge />
      </button>

      {sessionActive ? (
        <Link
          href="/forge"
          className="tm-forge-xp-pill-timer"
          aria-label={`Forge ${running ? "running" : "paused"} — ${mm} minutes ${ss} seconds remaining. Tap to open Forge.`}
        >
          <span
            className="tm-forge-xp-pill-ring"
            style={{ background: `conic-gradient(var(--tm-interactive) ${ringPct}%, var(--tm-int-border-soft) ${ringPct}%)` }}
            aria-hidden
          />
          <span className="tm-forge-xp-pill-time">
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
        </Link>
      ) : (
        <Link href="/forge" className="tm-forge-xp-pill-cta" aria-label="Open Practice">
          <span aria-hidden>◆</span>
          <span>Practice</span>
        </Link>
      )}

      {canClaim && (
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming}
          className="tm-forge-xp-pill-claim"
          aria-label={`Claim ${pendingXp} XP`}
        >
          {claiming ? "…" : `+${pendingXp}`}
        </button>
      )}

      {toast !== null && (
        <div className="tm-forge-xp-pill-toast" aria-live="polite">
          +{toast} XP
        </div>
      )}
    </div>
  )
}
