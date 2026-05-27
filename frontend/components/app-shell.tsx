"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { users, jobs as jobsApi } from "@/lib/api"
import type { UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { ParticleBg } from "@/components/particle-bg"
import { ForgeClockDriver } from "@/components/forge/ForgeClockDriver"
import { useForgeSession } from "@/lib/hooks/use-forge-session"
import { SurfaceToggle } from "@/components/surface-toggle"
import { SettingsModal } from "@/components/settings-modal"
import { XpExplainerModal } from "@/components/xp/xp-explainer-modal"
import { XPGateModal } from "@/components/xp/XPGateModal"
import { MyroLogo } from "@/components/myro-logo"
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
  AppShellSkeleton,
  MobileBottomNav,
  MobileProfileSheet,
  MobileTopBar,
  useViewport,
} from "@/mobile"

const NAV_ITEMS = [
  { href: "/home",    label: "Dashboard",     desc: "Tackle Today",            nudge: true,  stalePill: false },
  { href: "/forge",   label: "Practice",      desc: "Timer + diary",           nudge: false, stalePill: false },
  { href: "/market",  label: "Live Job Data", desc: "Market intelligence",     nudge: false, stalePill: false },
  { href: "/skills",  label: "Skills",        desc: "Score, gaps & graph",     nudge: false, stalePill: false },
  { href: "/cv",      label: "CV Library",    desc: "Hub for every CV version",nudge: false, stalePill: false },
  { href: "/tracker", label: "Tracker",       desc: "Application pipeline",    nudge: false, stalePill: true  },
]

export const FEEDBACK_QUICK_ACTIONS: {
  id: string; category: FeedbackCategory; icon: string; label: string; color: string; bg: string
}[] = [
  { id: "bug",    category: "bug",    icon: "⚠",  label: "Report a bug",    color: "var(--tm-warning)", bg: "var(--tm-warning-wash)" },
  { id: "idea",   category: "idea",   icon: "✦",  label: "Suggest an idea", color: "var(--tm-interactive)", bg: "var(--tm-int-bg-wash)" },
  { id: "praise", category: "praise", icon: "◎",  label: "Leave feedback",  color: "var(--tm-success)",  bg: "var(--tm-success-wash)" },
]

export const openFeedbackHub = openFeedbackHubEvent

export type SidebarProfile = Pick<UserProfile, "full_name" | "target_roles" | "target_location" | "linkedin_url" | "email">

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
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 14, height: 14, borderRadius: 99, padding: "0 4px",
      background: "var(--tm-danger)", color: "white",
      fontSize: 9, fontFamily: "var(--tm-font-mono)",
      marginLeft: 4,
    }}>
      {n > 9 ? "9+" : n}
    </span>
  )
}

function AppTopBar({ xpBalance, profile, signOut, onForgeXPEarned, onXPOpen }: {
  xpBalance: number
  profile: SidebarProfile | null
  signOut: () => void
  onForgeXPEarned: (amount: number, newBalance: number) => void
  onXPOpen: () => void
}) {
  const pathname = usePathname()
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
      <header className="tm-app-topbar" aria-label="App navigation">
        {/* Brand */}
        <Link href="/myro" className="tm-topbar-brand">
          <MyroLogo size={26} />
          <span className="tm-topbar-wordmark">Myro</span>
        </Link>

        {/* Nav links */}
        <nav className="tm-topbar-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.desc}
                className="tm-topbar-link"
                data-active={active}
                data-nudge={item.nudge && !active}
              >
                {item.href === "/home" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>
                    <path d="M12 2.5C12 2.5 13.1 9.1 15.5 11.5C17.9 13.9 21.5 12 21.5 12C21.5 12 17.9 10.1 15.5 12.5C13.1 14.9 12 21.5 12 21.5C12 21.5 10.9 14.9 8.5 12.5C6.1 10.1 2.5 12 2.5 12C2.5 12 6.1 13.9 8.5 11.5C10.9 9.1 12 2.5 12 2.5Z" />
                  </svg>
                )}
                {item.label}
                {item.stalePill && <StaleBadge />}
                {item.nudge && !active && <span className="tm-topbar-nudge" aria-hidden />}
              </Link>
            )
          })}
          <Link
            href="/myrology"
            className="tm-topbar-link tm-topbar-link-myrology"
            data-active={pathname.startsWith("/myrology")}
            title="Myrology — cosmic career intelligence"
          >
            ✦ Myrology
          </Link>
        </nav>

        {/* Right cluster */}
        <div className="tm-topbar-right">
          {/* Forge chip */}
          {forgeActive && (
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
                  <div style={{ padding: "4px 10px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Theme</span>
                    <SurfaceToggle />
                  </div>
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

  useEffect(() => {
    if (!token || xpBalance <= 0) return
    try {
      if (window.localStorage.getItem("myro_xp_modal_seen_v1")) return
      window.localStorage.setItem("myro_xp_modal_seen_v1", String(Date.now()))
      setXPModalOpen(true)
    } catch {}
  }, [token, xpBalance])

  if (!ready) return <AppShellSkeleton />

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
