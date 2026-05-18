"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { users, jobs as jobsApi } from "@/lib/api"
import type { UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { claimableForgeMinutes, claimableForgeXP, forgeProgressRatio } from "@/lib/forge-progress"
import { ParticleBg } from "@/components/particle-bg"
import { SurfaceToggle } from "@/components/surface-toggle"
import { SettingsModal } from "@/components/settings-modal"
import { XpExplainerModal } from "@/components/xp/xp-explainer-modal"
import { MyroLogo } from "@/components/myro-logo"
import { useXPStore } from "@/store/xpStore"
import { useForgeTimerStore, FORGE_AMBIENT_DURATION, FORGE_AMBIENT_RATE } from "@/store/forgeTimerStore"
import { xp } from "@/lib/api"
import type { ForgeSessionResult } from "@/types/xp"
import {
  AppShellSkeleton,
  MobileBottomNav,
  MobileProfileSheet,
  MobileTopBar,
  useViewport,
} from "@/mobile"

const NAV_ITEMS = [
  { href: "/home",    label: "Dashboard",  desc: "Mission control",        icon: null, hideLabel: true,  nudge: true  },
  { href: "/xp",      label: "XP Guide",    desc: "Earn & spend XP",        icon: "◆",  hideLabel: false, nudge: false },
  { href: "/market",  label: "Intel",      desc: "Market intelligence",    icon: "◉",  hideLabel: false, nudge: false },
  { href: "/skills",  label: "Skills",     desc: "Score, gaps & graph",    icon: "⬡",  hideLabel: false, nudge: false },
  { href: "/cv",      label: "CV Builder", desc: "Your skill profile",     icon: "◈",  hideLabel: false, nudge: false },
  { href: "/tracker", label: "Tracker",    desc: "Application pipeline",   icon: "▤",  hideLabel: false, nudge: false, stalePill: true },
]

export const FEEDBACK_ACTIONS = [
  { id: "bug",       icon: "⚠",  label: "Report a bug",       color: "var(--tm-warning)", bg: "var(--tm-warning-wash)", placeholder: "Describe what went wrong…"          },
  { id: "companies", icon: "＋", label: "Add more companies", color: "var(--tm-accent)",  bg: "var(--tm-accent-wash)",  placeholder: "Which companies should we track?"    },
  { id: "feedback",  icon: "◎",  label: "Leave feedback",     color: "var(--tm-success)", bg: "var(--tm-success-wash)", placeholder: "What can we improve?"                },
]

export type SidebarProfile = Pick<UserProfile, "full_name" | "target_roles" | "target_location" | "linkedin_url" | "email">

export function FeedbackModal({ action, onClose }: { action: typeof FEEDBACK_ACTIONS[0]; onClose: () => void }) {
  const [text, setText] = useState("")
  const [sent, setSent] = useState(false)
  const submit = () => {
    if (text.trim()) { setSent(true); setTimeout(onClose, 1400) }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "0 0 80px 72px" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--tm-overlay-soft)", backdropFilter: "blur(6px)" }} />
      <div
        style={{
          position: "relative",
          background: "var(--tm-surface)",
          border: `1px solid ${action.bg}`,
          borderRadius: "var(--tm-radius-lg)",
          padding: 20, width: 300, zIndex: 1,
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 29, marginBottom: 8, filter: `drop-shadow(0 0 8px ${action.color})`, color: action.color }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>Thanks — received!</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 17, color: action.color, filter: `drop-shadow(0 0 4px ${action.color})` }}>{action.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{action.label}</span>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--tm-text-faint)", fontSize: 19, cursor: "pointer", lineHeight: 1 }}
              >×</button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={action.placeholder}
              style={{
                width: "100%", padding: "10px 12px",
                borderRadius: "var(--tm-radius-sm)",
                background: "var(--tm-surface-2)",
                border: `1px solid ${action.bg}`,
                color: "var(--tm-text)", fontSize: 13, lineHeight: 1.6,
                resize: "none", minHeight: 80, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button
              onClick={submit}
              style={{
                marginTop: 10, width: "100%", padding: "9px",
                borderRadius: "var(--tm-radius-sm)",
                background: action.bg,
                border: `1px solid ${action.color}`,
                color: action.color, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Send →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function UserFooter({
  expanded,
  profile,
  onMenuOpenChange,
  signOut,
}: {
  expanded: boolean
  profile: SidebarProfile | null
  onMenuOpenChange?: (open: boolean) => void
  signOut: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<typeof FEEDBACK_ACTIONS[0] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const fullName = profile?.full_name ?? null

  useEffect(() => {
    onMenuOpenChange?.(menuOpen)
  }, [menuOpen, onMenuOpenChange])

  useEffect(() => {
    const handler = () => setShowSettings(true)
    document.addEventListener("tm:open-settings", handler)
    return () => document.removeEventListener("tm:open-settings", handler)
  }, [])

  const extraActions = [
    { id: "settings", icon: "⚙", label: "Settings",  color: "var(--tm-text-muted)",   hoverBg: "rgba(255,255,255,0.04)" },
    { id: "signout",  icon: "→", label: "Sign out",   color: "rgba(255,145,145,0.95)", hoverBg: "rgba(255,80,80,0.08)" },
  ]

  const handleExtra = (id: string) => {
    setMenuOpen(false)
    onMenuOpenChange?.(false)
    if (id === "settings") setShowSettings(true)
    if (id === "signout") setSignOutConfirm(true)
  }

  return (
    <>
      <div style={{ borderTop: "1px solid var(--tm-border-soft)", position: "relative" }}>
        {expanded && menuOpen && (
          <div style={{ padding: "8px 8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
            {FEEDBACK_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => { setActiveModal(a); setMenuOpen(false) }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-hover-soft)", border: "1px solid var(--tm-border-soft)",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)", width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = a.bg; e.currentTarget.style.borderColor = a.color }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--tm-hover-soft)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
              >
                <span style={{ fontSize: 14, color: a.color, minWidth: 18, textAlign: "center", filter: `drop-shadow(0 0 3px ${a.color})` }}>{a.icon}</span>
                <span style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0" }} />
            {extraActions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleExtra(a.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "transparent", border: "1px solid transparent",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)", width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = a.hoverBg }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ fontSize: 14, color: a.color, minWidth: 18, textAlign: "center" }}>{a.icon}</span>
                <span style={{ fontSize: 14, color: a.color }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0 0" }} />
          </div>
        )}

        {/* Avatar row */}
        <div
          onClick={() => expanded && setMenuOpen((o) => !o)}
          style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: 10, cursor: expanded ? "pointer" : "default" }}
          onMouseEnter={(e) => { if (expanded) e.currentTarget.style.background = "var(--tm-hover-soft)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          <div style={{
            width: 32, height: 32, minWidth: 32, borderRadius: "50%",
            background: menuOpen
              ? "linear-gradient(135deg, var(--tm-accent-wash), var(--tm-accent-ring))"
              : "linear-gradient(135deg, var(--tm-border), var(--tm-accent-wash))",
            border: `1px solid ${menuOpen ? "var(--tm-accent-ring)" : "var(--tm-border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "var(--tm-text)",
            transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
            boxShadow: menuOpen ? "0 0 12px var(--tm-accent-glow)" : "none",
          }}>{fullName ? fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "HM"}</div>
          <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{fullName ?? "My Account"}</div>
          </div>
          {expanded && (
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)", transition: `transform var(--tm-dur)`, transform: menuOpen ? "rotate(180deg)" : "none", marginRight: 4 }}>▴</div>
          )}
        </div>
      </div>

      {activeModal && <FeedbackModal action={activeModal} onClose={() => setActiveModal(null)} />}
      {showSettings && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} profile={profile} />}

      {signOutConfirm && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSignOutConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(10px)" }} />
          <div
            style={{
              position: "relative", background: "var(--tm-surface)",
              border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)",
              padding: "28px", width: 340, zIndex: 1, textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 29, marginBottom: 12, color: "var(--tm-text-muted)" }}>→</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Your progress is saved. You can sign back in anytime to resume your journey.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSignOutConfirm(false)}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StaleBadge() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.staleApplications(),
    queryFn: () => jobsApi.staleApplications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const n = data?.length ?? 0
  if (n === 0) return null
  return (
    <span
      title={`${n} application${n > 1 ? "s" : ""} stuck for 7+ days`}
      style={{
        position: "absolute", top: -3, right: -3,
        minWidth: 14, height: 14, borderRadius: 99,
        background: "var(--tm-danger)", color: "white",
        fontSize: 9, fontFamily: "var(--tm-font-mono)",
        display: "grid", placeItems: "center", padding: "0 4px",
      }}
    >
      {n > 9 ? "9+" : n}
    </span>
  )
}

const SIDEBAR_FORGE_CAP_XP = (FORGE_AMBIENT_DURATION / 60) * FORGE_AMBIENT_RATE

function SidebarForgeTimer({
  onXPEarned,
  onCompleteSession,
}: {
  onXPEarned: (amount: number, newBalance: number) => void
  onCompleteSession: (payload: { skill_name: string; duration_minutes: number }) => Promise<ForgeSessionResult>
}) {
  const { sessionActive, skillName, dismissed, running, remaining, setRunning, tick, restartSession, dismiss } = useForgeTimerStore()
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running, tick])

  if (!sessionActive || dismissed) return null

  const isComplete = remaining === 0 && !running
  const progress = forgeProgressRatio(FORGE_AMBIENT_DURATION, remaining)
  const readyXP = claimableForgeXP(FORGE_AMBIENT_DURATION, remaining, FORGE_AMBIENT_RATE)
  const claimMinutes = claimableForgeMinutes(FORGE_AMBIENT_DURATION, remaining)
  const canClaim = readyXP > 0
  const accent = isComplete ? "var(--tm-success, #4ade80)" : "var(--tm-accent)"

  async function handleClaim() {
    if (!skillName || !canClaim || claiming) return
    try {
      setClaiming(true)
      setClaimError(null)
      const result = await onCompleteSession({ skill_name: skillName, duration_minutes: claimMinutes })
      onXPEarned(result.xp_earned, result.new_xp_balance)
      restartSession()
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Could not claim XP")
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div style={{
      margin: "0 8px 8px",
      borderRadius: "var(--tm-radius)",
      background: isComplete ? "rgba(74,222,128,0.05)" : "rgba(0,245,212,0.05)",
      border: `1px solid ${isComplete ? "rgba(74,222,128,0.35)" : "var(--tm-accent-ring)"}`,
      boxShadow: isComplete ? "0 0 12px rgba(74,222,128,0.12)" : running ? "0 0 10px rgba(0,245,212,0.1)" : "none",
      transition: "box-shadow 400ms ease, border-color 400ms ease",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>◆ Forge</span>
          {running && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 4px rgba(0,245,212,0.8)", animation: "loop-pulse 1.4s ease infinite" }} />}
        </div>
        <button onClick={dismiss} style={{ background: "transparent", border: "none", color: "var(--tm-text-faint)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "2px 4px", fontFamily: "inherit" }}>✕</button>
      </div>

      {/* Countdown + controls */}
      <div style={{ padding: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 24, fontWeight: 700, letterSpacing: 0, fontVariantNumeric: "tabular-nums", color: accent, lineHeight: 1 }}>
              +{readyXP}
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 3 }}>
              XP ready
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setRunning(!running)}
              style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: running ? "rgba(255,255,255,0.06)" : "var(--tm-accent)",
                border: running ? "1px solid rgba(255,255,255,0.12)" : "none",
                color: running ? "var(--tm-text-muted)" : "var(--tm-accent-fg, #070711)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 10, transition: "all 150ms ease",
              }}
            >{running ? "⏸" : "▶"}</button>
            <button
              onClick={handleClaim}
              disabled={!canClaim || claiming}
              style={{
                height: 28, padding: "0 10px", borderRadius: "var(--tm-radius-pill, 999px)",
                background: canClaim && !claiming ? "var(--tm-accent)" : "rgba(255,255,255,0.05)",
                border: canClaim && !claiming ? "none" : "1px solid rgba(255,255,255,0.08)",
                color: canClaim && !claiming ? "var(--tm-accent-fg, #070711)" : "var(--tm-text-faint)",
                fontSize: 10, fontWeight: 700,
                cursor: canClaim && !claiming ? "pointer" : "default",
                fontFamily: "inherit", transition: "all 200ms ease",
              }}
            >{claiming ? "…" : "Claim"}</button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.06)", marginBottom: 7, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: accent, width: `${progress * 100}%`, transition: running ? "width 1s linear" : "none", boxShadow: `0 0 6px ${isComplete ? "rgba(74,222,128,0.5)" : "rgba(0,245,212,0.4)"}` }} />
        </div>
        <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 2 }}>
          {running ? "Building" : "Paused"} · cap +{SIDEBAR_FORGE_CAP_XP} XP
        </div>
        {claimError && <div style={{ fontSize: 10, color: "var(--tm-danger, #f87171)", marginTop: 6 }}>{claimError}</div>}
      </div>
    </div>
  )
}

function Sidebar({ xpBalance, profile, signOut, onForgeComplete, onForgeXPEarned, onXPOpen }: { xpBalance: number; profile: SidebarProfile | null; signOut: () => void; onForgeComplete: (payload: { skill_name: string; duration_minutes: number }) => Promise<ForgeSessionResult>; onForgeXPEarned: (amount: number, newBalance: number) => void; onXPOpen: () => void }) {
  const expanded = true
  const pathname = usePathname()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const forgeRunning = useForgeTimerStore((s) => s.running)

  return (
    <nav
      style={{
        width: 220,
        height: "100dvh",
        flexShrink: 0,
        background: "var(--tm-surface)",
        borderRight: "1px solid var(--tm-border-soft)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <Link
        href="/home"
        style={{
          padding: "22px 16px 20px",
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--tm-border-soft)",
          minHeight: 76, cursor: "pointer",
          transition: "background var(--tm-dur) var(--tm-ease)",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
      >
        <div style={{ minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 8px var(--tm-accent-glow))" }}>
          <MyroLogo size={32} />
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, whiteSpace: "nowrap", overflow: "hidden" }}>
          <div style={{ fontFamily: "var(--tm-font-display)", fontSize: 24, lineHeight: 1, fontWeight: 600, color: "var(--tm-text)", letterSpacing: 0 }}>Myro</div>
          <div className="tm-label-caps" style={{ marginTop: 4, fontSize: 11, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis" }}>Career Intelligence</div>
        </div>
      </Link>

      {/* XP pill — glows when forge session is running */}
      <button
        type="button"
        onClick={onXPOpen}
        aria-label="Open XP guide"
        style={{
        margin: "10px 8px", padding: "10px 12px",
        borderRadius: "var(--tm-radius)",
        background: forgeRunning ? "rgba(0,245,212,0.08)" : "var(--tm-accent-wash)",
        border: `1px solid ${forgeRunning ? "var(--tm-accent)" : "var(--tm-accent-ring)"}`,
        boxShadow: forgeRunning ? "0 0 14px rgba(0,245,212,0.2), inset 0 0 8px rgba(0,245,212,0.04)" : "none",
        display: "flex", alignItems: "center", gap: 10,
        transition: "background 400ms ease, border-color 400ms ease, box-shadow 400ms ease",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}>
        <div style={{
          minWidth: 32, textAlign: "center",
          fontFamily: "var(--tm-font-mono)",
          fontSize: 22, fontWeight: 700,
          color: "var(--tm-text)", lineHeight: 1,
          filter: "drop-shadow(0 0 6px var(--tm-accent-glow))",
        }}>
          ◆ {xpBalance}
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, whiteSpace: "nowrap" }}>
          <div className="tm-label-caps" style={{ fontSize: 13, letterSpacing: 0 }}>XP</div>
        </div>
      </button>

      {/* Inline forge timer — shows when session active */}
      <SidebarForgeTimer
        onCompleteSession={onForgeComplete}
        onXPEarned={onForgeXPEarned}
      />

      {/* Nav items */}
      <div style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)

          if (item.hideLabel) {
            // Icon-only home/dashboard entry — Claude-style anchor
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.desc}
                aria-label={item.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-start",
                  gap: 12, padding: "10px 8px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: active ? "var(--tm-accent-wash)" : "transparent",
                  boxShadow: active ? "inset 3px 0 0 var(--tm-accent)" : "none",
                  transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
                  textDecoration: "none", position: "relative",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--tm-hover)" }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ position: "relative", minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg
                    width="22" height="22" viewBox="0 0 24 24" fill="none"
                    style={{
                      color: active ? "var(--tm-accent)" : "var(--tm-icon-muted)",
                      filter: active ? "drop-shadow(0 0 6px var(--tm-accent-glow))" : "none",
                      transition: "color var(--tm-dur) var(--tm-ease), filter var(--tm-dur) var(--tm-ease)",
                    }}
                  >
                    {/* 4-point sparkle — matches Claude/Anthropic's mark aesthetic */}
                    <path
                      d="M12 2.5C12 2.5 13.1 9.1 15.5 11.5C17.9 13.9 21.5 12 21.5 12C21.5 12 17.9 10.1 15.5 12.5C13.1 14.9 12 21.5 12 21.5C12 21.5 10.9 14.9 8.5 12.5C6.1 10.1 2.5 12 2.5 12C2.5 12 6.1 13.9 8.5 11.5C10.9 9.1 12 2.5 12 2.5Z"
                      fill="currentColor"
                    />
                  </svg>
                  {item.nudge && !active && (
                    <span
                      className="animate-pulse"
                      style={{
                        position: "absolute", top: -3, right: -3,
                        width: 7, height: 7, borderRadius: "50%",
                        background: "var(--tm-accent)",
                        boxShadow: "0 0 6px var(--tm-accent-glow)",
                      }}
                    />
                  )}
                </span>
                <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, overflow: "hidden", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>
                    {item.nudge && !active ? <span style={{ color: "var(--tm-accent)" }}>Log today →</span> : item.desc}
                  </div>
                </div>
              </Link>
            )
          }

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "9px 8px", borderRadius: "var(--tm-radius-sm)",
                  background: active ? "var(--tm-accent-wash)" : "transparent",
                  boxShadow: active ? "inset 3px 0 0 var(--tm-accent)" : "none",
                  transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
                  textDecoration: "none",
                  position: "relative",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--tm-hover)" }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ position: "relative", minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{
                    fontSize: 18,
                    color: active ? "var(--tm-accent)" : "var(--tm-icon-muted)",
                    filter: active ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none",
                    transition: "color var(--tm-dur) var(--tm-ease)",
                  }}>
                    {item.icon}
                  </span>
                  {item.stalePill && <StaleBadge />}
                </span>

                <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, overflow: "hidden", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: active ? "var(--tm-accent)" : "var(--tm-text)" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 1, color: "var(--tm-text-faint)" }}>
                    {item.desc}
                  </div>
                </div>
              </Link>
            </div>
          )
        })}
      </div>

      {/* Background + Accent utilities collapse when user menu opens */}
      {expanded && (
        <div style={{
          height: isUserMenuOpen ? 0 : "auto",
          opacity: isUserMenuOpen ? 0 : 1,
          transform: isUserMenuOpen ? "translateY(-6px)" : "translateY(0)",
          pointerEvents: isUserMenuOpen ? "none" : "auto",
          overflow: "hidden",
          transition: "opacity 150ms var(--tm-ease), transform 150ms var(--tm-ease)",
        }}>
          <div style={{
            padding: "8px 12px 12px",
            borderTop: "1px solid var(--tm-border-soft)",
            display: "flex", alignItems: "center",
          }}>
            <SurfaceToggle />
          </div>
        </div>
      )}

      <UserFooter expanded={expanded} profile={profile} onMenuOpenChange={setIsUserMenuOpen} signOut={signOut} />
    </nav>
  )
}

const SUPPRESS_PARTICLE_PATHS = ["/market", "/cv", "/skills", "/jobs", "/home", "/xp"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, ready, signOut } = useAuth()
  const { balance: xpBalance, addBalance, setBalance: setXPBalance } = useXPStore()
  const pathname = usePathname()

  async function handleAmbientForgeComplete(payload: { skill_name: string; duration_minutes: number }) {
    if (!token) throw new Error("Not authenticated")
    return xp.completeForge(token, { ...payload, session_type: "ambient" })
  }

  function handleAmbientXPEarned(amount: number, newBalance: number) {
    addBalance(amount)
    setXPBalance(newBalance)
  }

  const { data: profileData } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const { isDesktop } = useViewport()
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [xpModalOpen, setXPModalOpen] = useState(false)

  if (!ready) return <AppShellSkeleton />

  const showParticle = isDesktop && !SUPPRESS_PARTICLE_PATHS.some(p => pathname.startsWith(p))

  const profile = {
    full_name: profileData?.full_name ?? null,
    email: profileData?.email ?? "",
    target_roles: profileData?.target_roles ?? [],
    target_location: profileData?.target_location ?? null,
    linkedin_url: profileData?.linkedin_url ?? null,
  }

  return (
    <div className="tm-shell-enter" style={{ display: "flex", height: "100dvh", width: "100vw", overflow: "hidden", position: "relative" }}>
      {showParticle && <ParticleBg />}

      <div className="tm-sidebar-wrap">
        <Sidebar
          xpBalance={xpBalance}
          profile={profile}
          signOut={signOut}
          onForgeComplete={handleAmbientForgeComplete}
          onForgeXPEarned={handleAmbientXPEarned}
          onXPOpen={() => setXPModalOpen(true)}
        />
      </div>

      <MobileTopBar
        xpBalance={xpBalance}
        profile={profile}
        onAvatarClick={() => setMobileSheetOpen(true)}
        onXPOpen={() => setXPModalOpen(true)}
      />

      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="tm-page-enter tm-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>

      <MobileBottomNav />

      {mobileSheetOpen && (
        <MobileProfileSheet
          profile={profile}
          onClose={() => setMobileSheetOpen(false)}
          signOut={signOut}
        />
      )}

      <XpExplainerModal
        open={xpModalOpen}
        onClose={() => setXPModalOpen(false)}
        balance={xpBalance}
      />
    </div>
  )
}
