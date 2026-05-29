"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { users } from "@/lib/api"
import type { UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { ParticleBg } from "@/components/particle-bg"
import { ForgeClockDriver } from "@/components/forge/ForgeClockDriver"
import { useForgeSession } from "@/lib/hooks/use-forge-session"
import { SettingsModal } from "@/components/settings-modal"
import { XpExplainerModal } from "@/components/xp/xp-explainer-modal"
import { XPGateModal } from "@/components/xp/XPGateModal"
import { MyroLogo } from "@/components/myro-logo"
import { TopbarNav } from "@/components/nav/topbar-nav"
import { CvPromisePill } from "@/components/nav/cv-promise-pill"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import "@/components/nav/nav.css"
import {
  FeedbackHub, FeedbackFAB, OPEN_FEEDBACK_EVENT,
  openFeedbackHub as openFeedbackHubEvent,
  type FeedbackCategory, type OpenFeedbackDetail,
} from "@/components/feedback"
import { useXPStore } from "@/store/xpStore"
import { useForgeTimerStore } from "@/store/forgeTimerStore"
import { xp } from "@/lib/api"
import type { ForgeSessionResult } from "@/types/xp"
import {
  MobileBottomNav,
  MobileProfileSheet,
  MobileTopBar,
  useViewport,
} from "@/mobile"
import { skeletonForPath } from "@/components/loading/page-skeletons"

export const FEEDBACK_QUICK_ACTIONS: {
  id: string; category: FeedbackCategory; icon: string; label: string; color: string; bg: string
}[] = [
  { id: "bug",    category: "bug",    icon: "⚠",  label: "Report a bug",    color: "var(--tm-warning)", bg: "var(--tm-warning-wash)" },
  { id: "idea",   category: "idea",   icon: "✦",  label: "Suggest an idea", color: "var(--tm-interactive)", bg: "var(--tm-int-bg-wash)" },
  { id: "praise", category: "praise", icon: "◎",  label: "Leave feedback",  color: "var(--tm-success)",  bg: "var(--tm-success-wash)" },
]

export const openFeedbackHub = openFeedbackHubEvent

export type SidebarProfile = Pick<UserProfile, "full_name" | "target_roles" | "target_location" | "linkedin_url" | "email">

function AppTopBar({ xpBalance, profile, signOut, onForgeXPEarned, onXPOpen }: {
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
    const h = () => setShowSettings(true)
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
                        style={{ height: 32, width: 32, borderRadius: 8, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text-faint)", cursor: "pointer", fontFamily: "inherit" }}
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
          >
            <span style={{ color: "var(--tm-interactive)", fontSize: 11 }}>◆</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontWeight: 700 }}>{xpBalance}</span>
            <span style={{ fontSize: 11, color: "var(--tm-text-muted)", fontWeight: 400 }}>XP</span>
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
                    <button
                      key={a.id}
                      onClick={() => { openFeedbackHub({ category: a.category }); setMenuOpen(false) }}
                      className="tm-topbar-menu-item"
                      onMouseEnter={(e) => { e.currentTarget.style.background = a.bg; e.currentTarget.style.borderColor = a.color }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
                    >
                      <span style={{ fontSize: 13, color: a.color, minWidth: 18, textAlign: "center" }}>{a.icon}</span>
                      <span style={{ fontSize: 13, color: "var(--tm-text-muted)" }}>{a.label}</span>
                    </button>
                  ))}
                  <div className="tm-topbar-menu-divider" />
                  {[
                    { id: "settings", icon: "⚙", label: "Settings",  color: "var(--tm-text-muted)",   hoverBg: "rgba(255,255,255,0.04)" },
                    { id: "signout",  icon: "→", label: "Sign out",   color: "rgba(255,145,145,0.95)", hoverBg: "rgba(255,80,80,0.08)"   },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setMenuOpen(false); if (a.id === "settings") setShowSettings(true); if (a.id === "signout") setSignOutConfirm(true) }}
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

      {showSettings && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} profile={profile} />}

      {signOutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSignOutConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(10px)" }} />
          <div style={{ position: "relative", background: "var(--tm-surface)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)", padding: "28px", width: 340, zIndex: 1, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 29, marginBottom: 12, color: "var(--tm-text-muted)" }}>→</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>Your progress is saved. You can sign back in anytime.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSignOutConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={signOut} style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const SUPPRESS_PARTICLE_PATHS = ["/market", "/cv", "/skills", "/jobs", "/home", "/forge", "/xp"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, ready, signOut } = useAuth()
  const { balance: xpBalance, addBalance, setBalance: setXPBalance } = useXPStore()
  const pathname = usePathname()

  useEffect(() => {
    if (!token) return
    xp.balance(token).then((r) => setXPBalance(r.balance)).catch(() => {})
  }, [token, setXPBalance])

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
  const [feedbackHubOpen, setFeedbackHubOpen] = useState(false)
  const [feedbackHubCategory, setFeedbackHubCategory] = useState<FeedbackCategory>("bug")
  const [feedbackHubTab, setFeedbackHubTab] = useState<"new" | "reports" | "shipped">("new")

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<OpenFeedbackDetail>).detail ?? {}
      if (detail.category) setFeedbackHubCategory(detail.category)
      if (detail.tab) setFeedbackHubTab(detail.tab)
      setFeedbackHubOpen(true)
    }
    document.addEventListener(OPEN_FEEDBACK_EVENT, handler)
    return () => document.removeEventListener(OPEN_FEEDBACK_EVENT, handler)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setFeedbackHubOpen((o) => !o) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Auth bootstrap window — before chrome/profile can render. Show the
  // destination page's own skeleton shape rather than a centered logo splash,
  // so the perceived load is continuous: shell-bootstrap skeleton → page
  // skeleton → real content, all in the same layout.
  if (!ready) return <>{skeletonForPath(pathname)}</>

  const showParticle = isDesktop && !SUPPRESS_PARTICLE_PATHS.some((p) => pathname.startsWith(p))

  const profile = {
    full_name: profileData?.full_name ?? null,
    email: profileData?.email ?? "",
    target_roles: profileData?.target_roles ?? [],
    target_location: profileData?.target_location ?? null,
    linkedin_url: profileData?.linkedin_url ?? null,
  }

  return (
    <div className="tm-shell-enter" style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100vw", overflow: "hidden", position: "relative" }}>
      {showParticle && <ParticleBg />}
      <ForgeClockDriver />
      <XPGateModal />

      {isDesktop && (
        <AppTopBar
          xpBalance={xpBalance}
          profile={profile}
          signOut={signOut}
          onForgeXPEarned={handleAmbientXPEarned}
          onXPOpen={() => setXPModalOpen(true)}
        />
      )}

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

      <XpExplainerModal open={xpModalOpen} onClose={() => setXPModalOpen(false)} balance={xpBalance} />

      <FeedbackFAB
        hidden={!isDesktop || feedbackHubOpen}
        onOpen={(category) => {
          if (category) setFeedbackHubCategory(category)
          setFeedbackHubTab("new")
          setFeedbackHubOpen(true)
        }}
      />

      <FeedbackHub
        open={feedbackHubOpen}
        onClose={() => setFeedbackHubOpen(false)}
        defaultCategory={feedbackHubCategory}
        defaultTab={feedbackHubTab}
        showHistory={!!token}
        showContext
        userName={profile.full_name}
        userEmail={profile.email}
      />
    </div>
  )
}
