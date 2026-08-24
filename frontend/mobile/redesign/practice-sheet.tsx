"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { upskilling } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"
import { BottomSheet } from "./bottom-sheet"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   PracticeSheet — top-bar bolt → the handoff Practice sheet. A launcher: shows
   the next set (from real upskilling.skills) + the L1–L5 ladder, then routes to
   the full practice yard (/practice) to run it. Streak from real activity dates,
   coins from the wallet store. Graceful-degrade when no data yet.
   ══════════════════════════════════════════════════════════════════════════ */

/** Consecutive-day streak ending today or yesterday. */
function currentStreak(dates: string[]): number {
  if (!dates.length) return 0
  const set = new Set(dates.map(d => d.slice(0, 10)))
  const day = 86_400_000
  let cursor = new Date()
  // Allow the streak to be "alive" if today isn't logged yet but yesterday is.
  const today = cursor.toISOString().slice(0, 10)
  if (!set.has(today)) cursor = new Date(cursor.getTime() - day)
  let n = 0
  while (set.has(cursor.toISOString().slice(0, 10))) {
    n += 1
    cursor = new Date(cursor.getTime() - day)
  }
  return n
}

export function PracticeSheet() {
  const { practiceOpen, closePractice } = useMobileUI()
  const { token } = useAuth()
  const router = useRouter()
  const coins = useXPStore(s => s.balance)

  const skillsQ = useQuery({
    queryKey: ["upskilling", "skills", token],
    queryFn: () => upskilling.skills(token!),
    enabled: !!token && practiceOpen,
    staleTime: 5 * 60 * 1000,
  })
  const activityQ = useQuery({
    queryKey: ["upskilling", "activity", token],
    queryFn: () => upskilling.activityDates(token!),
    enabled: !!token && practiceOpen,
    staleTime: 5 * 60 * 1000,
  })

  const streak = currentStreak(activityQ.data?.dates ?? [])
  // Next set = the first unlocked skill with a level still to clear, richest
  // demand first (mirrors the yard's own ordering intent).
  const next = (skillsQ.data ?? [])
    .filter(s => !s.locked && s.next_level <= s.max_bank_level && s.next_level >= 1)
    .sort((a, b) => (a.cleared_level - b.cleared_level) || (b.job_count - a.job_count))[0]

  const nextLevel = next?.next_level ?? 1
  const metaBits = [streak > 0 ? `${streak}-day streak` : null, `${coins} coins`].filter(Boolean).join(" · ")

  const start = () => {
    closePractice()
    router.push(next ? `/practice?skill=${encodeURIComponent(next.skill_key)}` : "/practice")
  }

  return (
    <BottomSheet open={practiceOpen} onClose={closePractice} label="Practice">
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mm-text)" }}>Practice</span>
          {metaBits && <span style={{ fontSize: 11.5, color: "var(--mm-faint)" }}>{metaBits}</span>}
        </div>

        <div style={{ marginTop: 12, background: "var(--mm-inset)", border: "1px solid var(--mm-hair)", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--mm-accent)", textTransform: "uppercase" }}>
            Your next set
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 4, color: "var(--mm-text)" }}>
            {next ? `${next.display_name} · L${nextLevel}` : "You're all caught up"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mm-muted)", marginTop: 3, lineHeight: 1.5 }}>
            {next
              ? "10 questions · untimed · pass 8/10 to bank +50 coins and record the level."
              : "No open levels right now — upload a fresh CV or check back after new roles land."}
          </div>
          {next && (
            <div style={{ display: "flex", gap: 5, marginTop: 11 }}>
              {["L1", "L2", "L3", "L4", "L5"].map((l, i) => {
                const on = i + 1 === nextLevel
                return (
                  <span
                    key={l}
                    style={{
                      flex: 1, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      background: on ? "var(--mm-accent-wash)" : "transparent",
                      color: on ? "var(--mm-accent)" : "var(--mm-dim)",
                      border: `1px solid ${on ? "rgba(79,199,246,0.3)" : "var(--mm-border)"}`,
                    }}
                  >
                    {l}
                  </span>
                )
              })}
            </div>
          )}
          <button
            onClick={start}
            className="mm-press"
            style={{
              width: "100%", height: 40, marginTop: 12, borderRadius: 12, border: "none",
              background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 13.5, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {next ? `Start set · L${nextLevel}` : "Open Practice"}
          </button>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--mm-dim)", marginTop: 10, textAlign: "center" }}>
          Closing gaps here raises your fit on real roles.
        </div>
      </div>
    </BottomSheet>
  )
}
