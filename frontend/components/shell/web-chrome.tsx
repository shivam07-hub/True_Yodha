"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useForgeSession } from "@/lib/hooks/use-forge-session"
import { useForgeTimerStore } from "@/store/forgeTimerStore"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { MyroLogo } from "@/components/myro-logo"
import { TopbarNav } from "@/components/nav/topbar-nav"
import { CvPromisePill } from "@/components/nav/cv-promise-pill"
import { SettingsModal, type Tab as SettingsTab } from "@/components/settings-modal"
import { MyrologyOptInPrompt } from "@/components/myrology-optin-prompt"
import { ThemeControl } from "@/components/ui/theme-control"
import { openFeedbackHub, type FeedbackCategory } from "@/components/feedback"
import { XpDeltaNudge } from "@/components/xp/xp-delta-nudge"
import type { SidebarProfile } from "@/lib/shell/contract"
import type { ForgeSessionResult } from "@/types/xp"

/**
 * WEB-only chrome adapter (ADR-0010). The desktop top bar: brand, progressive
 * nav, forge chip + popover, XP pill, account menu, settings/sign-out/myrology
 * surfaces. Mounted by AppShell only when `isDesktop`. The mobile shell
 * (mobile/shell.tsx) is the parallel adapter; neither imports the other.
 */

export const FEEDBACK_QUICK_ACTIONS: {
  id: string; category: FeedbackCategory; icon: string; label: string; color: string; bg: string
}[] = [
  { id: "bug",    category: "bug",    icon: "⚠",  label: "Report a bug",       color: "var(--tm-warning)", bg: "var(--tm-warning-wash)" },
  { id: "praise", category: "idea",   icon: "◎",  label: "Feedback and ideas", color: "var(--tm-success)",  bg: "var(--tm-success-wash)" },
]

export function WebChrome({ xpBalance, profile, signOut, onForgeXPEarned, onXPOpen }: {
  xpBalance: number
  profile: SidebarProfile | null
  signOut: () => void
  onForgeXPEarned: (amount: number, newBalance: number) => void
  onXPOpen: () => void
}) {
  const router = useRouter()
  const nav = useNavUnlocks()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("Account")
  const [myroPromptOpen, setMyroPromptOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const [forgeOpen, setForgeOpen] = useState(false)
  const forgeRunning = useForgeTimerStore((s) => s.running)
  const dismissed = useForgeTimerStore((s) => s.dismissed)
  const fullName = profile?.full_name ?? null

  const { state, remaining, pendingXp, canClaim, claiming, claimError, pause, resume, dismiss, claim } = useForgeSession()
  const forgeActive = state !== "idle" && !dismissed
  const isComplete = state === "complete"
  const forgeAccent = isComplete ? "var(--tm-success)" : "var(--tm-interactive)"
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const clock = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`

  useEffect(() => {
    const h = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      if (tab) setSettingsTab(tab as SettingsTab)
      setShowSettings(true)
    }
    document.addEventListener("tm:open-settings", h)
    return () => document.removeEventListener("tm:open-settings", h)
  }, [])

  async function handleClaim() {
    if (!canClaim) return
    try {
      await claim({ onClaimed: (r: ForgeSessionResult) => { onForgeXPEarned(r.xp_earned, r.new_xp_balance); setForgeOpen(false) } })
    } catch {}
  }

  return (
    <>
      <header className="tm-app-topbar" aria-label="App navigation" data-coaching={!!nav.activeCoach}>
        {/* Brand — aperture + beta badge (wordmark dropped) */}
        <Link href="/myro" className="tm-topbar-brand" aria-label="Myro — home">
          <MyroLogo size={26} />
          <span className="tm-nav-beta" title="Early access — Myro is still evolving">beta</span>
        </Link>

        {/* Progressive-disclosure nav (grows as surfaces are earned) */}
        <TopbarNav nav={nav} />

        {/* Right cluster */}
        <div className="tm-topbar-right">
          {/* 10-min CV-promise countdown — first-run only */}
          {nav.firstRun && (
            <CvPromisePill firstRun={nav.firstRun} hasCv={nav.hasCv} onClick={() => router.push("/cv")} />
          )}

          {/* Forge chip — returning operators */}
          {forgeActive && !nav.firstRun && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setForgeOpen((o) => !o)}
                className="tm-topbar-forge-chip"
                data-complete={isComplete}
                aria-label="Forge session timer"
              >
                <span className="tm-topbar-forge-dot" data-running={state === "running"} style={{ background: forgeAccent }} aria-hidden />
                <span style={{ fontFamily: "var(--tm-font-mono)", fontVariantNumeric: "tabular-nums" }}>{clock}</span>
                <span style={{ color: forgeAccent, fontFamily: "var(--tm-font-mono)", fontSize: 11 }}>+{pendingXp} XP</span>
                {canClaim && <span className="tm-topbar-forge-claim">CLAIM</span>}
              </button>
              {forgeOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setForgeOpen(false)} />
                  <div className="tm-topbar-forge-popover" style={{ borderColor: isComplete ? "rgba(74,222,128,0.3)" : "var(--tm-int-border)" }}>
                    <div style={{ textAlign: "center", padding: "12px 0 10px" }}>
                      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 26, fontWeight: 700, color: forgeAccent }}>+{pendingXp} XP</div>
                      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 18, color: "var(--tm-text)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{clock}</div>
                      <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 4 }}>
                        {isComplete ? "Ready to claim" : state === "running" ? "Practicing" : "Paused"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <button
                        onClick={() => state === "running" ? pause() : resume()}
                        style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${forgeAccent}`, background: "transparent", color: forgeAccent, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                      >
                        {state === "running" ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => { dismiss(); setForgeOpen(false) }}
                        style={{ height: 32, width: 32, borderRadius: 8, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-interactive-rest)", cursor: "pointer", fontFamily: "inherit" }}
                      >×</button>
                    </div>
                    <button
                      onClick={handleClaim}
                      disabled={!canClaim || claiming}
                      style={{
                        width: "100%", height: 38, borderRadius: 10,
                        background: canClaim && !claiming ? forgeAccent : "var(--tm-surface-2)",
                        border: "none",
                        color: canClaim && !claiming ? "#050a18" : "var(--tm-text-muted)",
                        fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        cursor: canClaim && !claiming ? "pointer" : "not-allowed",
                        fontFamily: "inherit",
                      }}
                    >
                      {claiming ? "···" : canClaim ? `Claim +${pendingXp} XP` : "Building…"}
                    </button>
                    {claimError && <div style={{ marginTop: 8, fontSize: 10, color: "var(--tm-danger)" }}>{claimError}</div>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* XP pill */}
          <button
            onClick={onXPOpen}
            className="tm-topbar-xp"
            data-forge={forgeRunning}
            aria-label="Open XP guide"
            style={{ position: "relative" }}
          >
            <span style={{ color: "var(--tm-interactive)", fontSize: 11 }}>◆</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{xpBalance.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: "var(--tm-text-muted)", fontWeight: 400 }}>XP</span>
            <XpDeltaNudge />
          </button>

          {/* Avatar */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="tm-topbar-avatar"
              data-open={menuOpen}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {fullName ? fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "HM"}
            </button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setMenuOpen(false)} />
                <div className="tm-topbar-menu">
                  <div className="tm-topbar-menu-user">
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{fullName ?? "My Account"}</div>
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>{profile?.email ?? ""}</div>
                  </div>
                  {FEEDBACK_QUICK_ACTIONS.map((a) => (
                    <Fragment key={a.id}>
                      <button
                        onClick={() => { openFeedbackHub({ category: a.category }); setMenuOpen(false) }}
                        className="tm-topbar-menu-item"
                        onMouseEnter={(e) => { e.currentTarget.style.background = a.bg; e.currentTarget.style.borderColor = a.color }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
                      >
                        <span style={{ fontSize: 13, color: a.color, minWidth: 18, textAlign: "center" }}>{a.icon}</span>
                        <span style={{ fontSize: 13, color: "var(--tm-interactive-rest)" }}>{a.label}</span>
                      </button>
                      {/* Myrology sits in the old "Suggest an idea" slot (after Report a bug). */}
                      {a.id === "bug" && (
                        <button
                          onClick={() => {
                            setMenuOpen(false)
                            if (nav.ctx.myrologyInterested) router.push("/myrology")
                            else setMyroPromptOpen(true)
                          }}
                          className="tm-topbar-menu-item"
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.borderColor = "var(--tm-interactive)" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
                        >
                          <span style={{ fontSize: 13, color: "var(--tm-interactive)", minWidth: 18, textAlign: "center" }}>✦</span>
                          <span style={{ fontSize: 13, color: "var(--tm-interactive-rest)" }}>Myrology</span>
                        </button>
                      )}
                    </Fragment>
                  ))}
                  <div className="tm-topbar-menu-divider" />
                  <div style={{ padding: "6px 10px 8px" }}>
                    <ThemeControl label="Appearance" fluid />
                  </div>
                  <div className="tm-topbar-menu-divider" />
                  {[
                    { id: "settings", icon: "⚙", label: "Settings",  color: "var(--tm-interactive-rest)", hoverBg: "rgba(255,255,255,0.04)" },
                    { id: "signout",  icon: "→", label: "Sign out",   color: "rgba(255,145,145,0.95)", hoverBg: "rgba(255,80,80,0.08)"   },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setMenuOpen(false); if (a.id === "settings") { setSettingsTab("Account"); setShowSettings(true) } if (a.id === "signout") setSignOutConfirm(true) }}
                      className="tm-topbar-menu-item"
                      onMouseEnter={(e) => { e.currentTarget.style.background = a.hoverBg }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                      <span style={{ fontSize: 13, color: a.color, minWidth: 18 }}>{a.icon}</span>
                      <span style={{ fontSize: 13, color: a.color }}>{a.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {showSettings && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} profile={profile} initialTab={settingsTab} />}
      <MyrologyOptInPrompt
        open={myroPromptOpen}
        onClose={() => setMyroPromptOpen(false)}
        onConfirmed={() => router.push("/myrology")}
      />

      {signOutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSignOutConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(10px)" }} />
          <div style={{ position: "relative", background: "var(--tm-surface)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)", padding: "28px", width: 340, zIndex: 1, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 29, marginBottom: 12, color: "var(--tm-text-muted)" }}>→</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>Your progress is saved. You can sign back in anytime.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSignOutConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-interactive-rest)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={signOut} style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
