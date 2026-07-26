"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useHomeBootstrap } from "@/lib/hooks/use-home-bootstrap"
import { useAuth } from "@/lib/hooks/use-auth"
import { tierForScore } from "@/lib/score-tiers"
import { useXPStore } from "@/store/xpStore"
import { useMobileUI } from "./mobile-ui"

/* ══════════════════════════════════════════════════════════════════════════
   ProfileSurface — the handoff Profile tab: Myro Score ring + tier + stats,
   today's missions (derived from real signals), and the hub list (Skills &
   Score · Practice · Intel · Newsletter · Myrology · Settings · Sign out).
   Absorbs the retired avatar sheet. Wired to /home/bootstrap + wallet store.
   ══════════════════════════════════════════════════════════════════════════ */

const CIRC = 172.8 // 2π·27.5 — the 64px score ring

function todayISO() { return new Date().toISOString().slice(0, 10) }
function currentStreak(dates: string[]): number {
  if (!dates.length) return 0
  const set = new Set(dates.map(d => d.slice(0, 10)))
  const day = 86_400_000
  let cursor = new Date()
  if (!set.has(todayISO())) cursor = new Date(cursor.getTime() - day)
  let n = 0
  while (set.has(cursor.toISOString().slice(0, 10))) { n += 1; cursor = new Date(cursor.getTime() - day) }
  return n
}

export function ProfileSurface({ token }: { token: string }) {
  const router = useRouter()
  const { signOut } = useAuth()
  const { openPractice } = useMobileUI()
  const coins = useXPStore(s => s.balance)
  const boot = useHomeBootstrap(token)
  const [ringOn, setRingOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setRingOn(true), 250); return () => clearTimeout(t) }, [])

  const data = boot.data
  const score = data?.score?.total_score ?? 0
  const tier = tierForScore(score)
  const dates = data?.practice_activity?.dates ?? []
  const streak = currentStreak(dates)
  const sessions = dates.length
  const skillsN = data?.score?.skills_assessed ?? 0
  const domainsN = data?.score ? Object.keys(data.score.domain_scores).length : 0
  const apps = data?.applications ?? []
  const matchesN = data?.matches?.jobs?.length ?? 0

  const missions = [
    { id: "browse", label: "Browse today's matches", done: matchesN > 0 },
    { id: "save", label: "Save a role", done: apps.length > 0 },
    { id: "practice", label: "Practice one set", done: dates.includes(todayISO()) },
    { id: "tailor", label: "Tailor a CV", done: apps.some(a => a.cv_badge) },
    { id: "log", label: "Log one piece of evidence", done: (data?.evidence?.evidence_count ?? 0) > 0 },
  ]
  const missionsDone = missions.filter(m => m.done).length

  const rows: { label: string; meta?: string; danger?: boolean; onTap: () => void }[] = [
    { label: "Skills & Score", meta: skillsN ? `${skillsN} skills · ${domainsN} domains` : undefined, onTap: () => router.push("/skills") },
    { label: "Practice", meta: "Level up", onTap: openPractice },
    { label: "Intel", meta: "Market mirror", onTap: () => router.push("/intel") },
    { label: "Newsletter", meta: "Weekly signals", onTap: () => router.push("/newsletter") },
    { label: "Myrology ✦", onTap: () => router.push("/myrology") },
    { label: "About us", meta: "How Myro works", onTap: () => router.push("/") },
    { label: "Myro Coins guide", onTap: () => router.push("/tokens") },
    { label: "Settings", onTap: () => document.dispatchEvent(new CustomEvent("tm:open-settings")) },
    { label: "Sign out", danger: true, onTap: signOut },
  ]

  return (
    <div data-screen-label="Profile" className="mm-root" style={{ background: "var(--mm-bg)", minHeight: "100%", animation: "mm-screenIn 240ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "10px 16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: "-0.03em" }}>Profile</h1>

        {/* score card */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16, padding: 14 }}>
          <div style={{ position: "relative", width: 64, height: 64, flex: "none" }} role="img" aria-label={`Myro Score ${score}`}>
            <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27.5" fill="none" stroke="var(--mm-border)" strokeWidth="4" />
              <circle cx="32" cy="32" r="27.5" fill="none" stroke="var(--mm-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={ringOn ? CIRC * (1 - score / 100) : CIRC} transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, color: "var(--mm-text)" }}>{score}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{tier.label}</div>
            {tier.next != null && <div style={{ fontSize: 12, color: "var(--mm-faint)", marginTop: 2 }}>{Math.max(0, tier.next - score)} points to {tier.nextLabel}</div>}
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11.5, color: "var(--mm-muted)", fontVariantNumeric: "tabular-nums" }}>
              <span><b style={{ color: "var(--mm-text)" }}>{sessions}</b> sessions</span>
              <span><b style={{ color: "var(--mm-text)" }}>{streak}d</b> streak</span>
              <span><b style={{ color: "var(--mm-text)" }}>{coins}</b> coins</span>
            </div>
          </div>
        </div>

        {/* missions */}
        <div style={{ background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 650 }}>Today&apos;s missions</span>
            <span style={{ fontSize: 12, color: "var(--mm-accent)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{missionsDone}/5</span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: "var(--mm-border)", marginTop: 9, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 99, background: "var(--mm-accent)", width: `${(missionsDone / 5) * 100}%`, transition: "width 500ms cubic-bezier(0.16,1,0.3,1)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 9 }}>
            {missions.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5.5px 0" }}>
                <span style={{ width: 17, height: 17, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, background: m.done ? "var(--mm-accent-wash)" : "transparent", color: m.done ? "var(--mm-accent)" : "var(--mm-dim)", border: `1px solid ${m.done ? "rgba(0,245,212,0.3)" : "rgba(255,255,255,0.14)"}` }}>{m.done ? "✓" : ""}</span>
                <span style={{ fontSize: 13, color: m.done ? "var(--mm-faint)" : "var(--mm-text)" }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* hub list */}
        <div style={{ background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <button key={r.label} onClick={r.onTap} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "13px 14px", border: "none", background: "transparent", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--mm-hair)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: r.danger ? "var(--mm-bad)" : "var(--mm-text)" }}>{r.label}</span>
              <span style={{ flex: 1 }} />
              {r.meta && <span style={{ fontSize: 11.5, color: "var(--mm-dim)" }}>{r.meta}</span>}
              <span style={{ color: "var(--mm-dim)", fontSize: 15 }}>›</span>
            </button>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 10.5, color: "var(--mm-stroke)", paddingTop: 2 }}>Myro beta · himyro.com</div>
      </div>
    </div>
  )
}
