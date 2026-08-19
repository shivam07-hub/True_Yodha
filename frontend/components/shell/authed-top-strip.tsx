"use client"

import { Fragment, Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { useShellModel, type ShellModel } from "@/lib/shell/use-shell-model"
import { MyroLogo } from "@/components/myro-logo"
import { TopbarNav, NavContentCluster } from "@/components/nav/topbar-nav"
import { NotificationBell } from "@/components/nav/notification-bell"
import { ScoreChip } from "@/components/nav/score-chip"
import { NextChip } from "@/components/nav/next-chip"
import { SettingsModal, type Tab as SettingsTab } from "@/components/settings-modal"
import { MyrologyOptInPrompt } from "@/components/myrology-optin-prompt"
import { ThemeControl } from "@/components/ui/theme-control"
import { Button } from "@/components/ui/button"
import { AccountLegalLinks } from "@/components/shell/account-legal-links"
import { FeedbackHub, openFeedbackHub, type FeedbackCategory } from "@/components/feedback"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * AuthedTopStrip — the ONE logged-in top strip (ADR-0010). The app shell AND the
 * public bar's authed branch mount this SAME component, so a signed-in user sees
 * the identical strip on every surface (marketing + app) — one app, no drift.
 * The old split (app shell had score/bell/avatar; the public authed bar had a
 * bare "Go to app →") is retired here.
 *
 * Self-contained: the tabs (NavContentCluster + TopbarNav) self-derive active +
 * the CV→Prep split + journey counts from the route, so the two navs cannot
 * diverge again. The account-menu flows (settings, myrology, sign-out) mount
 * their own dialogs. The one cross-cutting overlay is the FeedbackHub: the app
 * shell already mounts it, so it passes `mountFeedbackHub={false}`; the public
 * standalone passes it true (no AppShell to host it).
 *
 * `model` is threaded in on app routes (AppShell already holds it — no double
 * useShellModel); AuthedTopStripStandalone sources its own for public routes.
 */

const FEEDBACK_QUICK_ACTIONS: {
  id: string; category: FeedbackCategory; icon: string; label: string; color: string; bg: string
}[] = [
  { id: "bug",    category: "bug",  icon: "⚠",  label: "Report a bug",       color: "var(--tm-warning)", bg: "var(--tm-warning-wash)" },
  { id: "praise", category: "idea", icon: "◎",  label: "Feedback and ideas", color: "var(--tm-success)",  bg: "var(--tm-success-wash)" },
]

// The old /myro "Welcome to Myro" hub is retired as the logo target (logo now
// drops the user in their feed). Its "About us" card lives here now, pointed at
// /tokens — the single page carrying everything about Myro (product + coins).
// Newsletter keeps its first-class home (a tab desktop / Profile mobile), so
// it is not re-listed here.
const LEARN_LINKS = [
  { href: "/tokens", label: "About us" },
] as const

interface AuthedTopStripProps {
  model: ShellModel
  /** Mount the shared FeedbackHub. False on app routes (AppShell hosts it);
   *  true on public routes where nothing else does. */
  mountFeedbackHub?: boolean
}

export function AuthedTopStrip({ model, mountFeedbackHub = false }: AuthedTopStripProps) {
  const router = useRouter()
  const nav = useNavUnlocks()
  const { profile, profileLoading, signOut } = model
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("Account")
  const [myroPromptOpen, setMyroPromptOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const fullName = profile?.full_name ?? null

  useEffect(() => {
    const h = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      if (tab) setSettingsTab(tab as SettingsTab)
      setShowSettings(true)
    }
    document.addEventListener("tm:open-settings", h)
    return () => document.removeEventListener("tm:open-settings", h)
  }, [])

  return (
    <>
      <header className="tm-app-topbar" aria-label="App navigation">
        {/* Brand — aperture + Myro wordmark. Logo → the feed (the one home;
            LinkedIn/X pattern). The old "beta" pill is gone. */}
        <Link href="/market" className="tm-topbar-brand" aria-label="Myro — home">
          <MyroLogo size={26} />
          <span className="tm-topbar-wordmark">Myro</span>
        </Link>

        {/* Browse cluster (Intel / Newsletter) — hugs the logo, left of the tabs */}
        <NavContentCluster nav={nav} />

        {/* Progressive-disclosure nav (grows as surfaces are earned) */}
        <TopbarNav nav={nav} />

        {/* Right cluster */}
        <div className="tm-topbar-right">
          {/* The one durable answer to "what now". It reads the same saved-job
              and application state as Collections and the reminder bell, so a
              finished Main CV never masquerades as unfinished. Suspense because
              it reads the query string (the open job) and this same strip renders
              on statically-generated public routes. */}
          <Suspense fallback={null}>
            <NextChip cvPresence={nav.cvPresence} />
          </Suspense>

          {/* Myro Score — status carried through every stage (unified-structure lock #9) */}
          <ScoreChip />

          {/* Fresh-match notifications (Backlog #36) */}
          <NotificationBell />

          {/* Avatar */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="tm-topbar-avatar"
              data-open={menuOpen}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {fullName
                ? fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                : profileLoading
                  ? <Skeleton style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
                  : "?"}
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
                    <ThemeControl fluid />
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
                  {/* Learn — the retired /myro hub's reference cards find their home
                      here, with the other secondary/reference links. */}
                  <div className="tm-topbar-menu-divider" />
                  {LEARN_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMenuOpen(false)}
                      className="tm-topbar-menu-item"
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                      <span style={{ fontSize: 13, color: "var(--tm-text-faint)", minWidth: 18 }}>·</span>
                      <span style={{ fontSize: 13, color: "var(--tm-interactive-rest)" }}>{l.label}</span>
                    </Link>
                  ))}
                  <div className="tm-topbar-menu-divider" />
                  <AccountLegalLinks />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {showSettings && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} profile={profile} profileLoading={profileLoading} initialTab={settingsTab} />}
      <MyrologyOptInPrompt
        open={myroPromptOpen}
        onClose={() => setMyroPromptOpen(false)}
        onConfirmed={() => router.push("/myrology")}
      />

      {mountFeedbackHub && (
        <FeedbackHub
          open={model.feedbackHubOpen}
          onClose={() => model.setFeedbackHubOpen(false)}
          defaultCategory={model.feedbackHubCategory}
          defaultTab={model.feedbackHubTab}
          showHistory={!!model.token}
          showContext
          userName={profile.full_name}
          userEmail={profile.email}
        />
      )}

      {signOutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSignOutConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(10px)" }} />
          <div style={{ position: "relative", background: "var(--tm-surface)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)", padding: "28px", width: 340, zIndex: 1, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 29, marginBottom: 12, color: "var(--tm-text-muted)" }}>→</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>Your progress is saved. You can sign back in anytime.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="neutral" size="md" onClick={() => setSignOutConfirm(false)} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="danger" size="md" onClick={signOut} style={{ flex: 1 }}>Sign out</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Public-route wrapper: sources its own shell model. ONLY mount when a session
 * exists — useShellModel → useAuth redirects to /login on no token, so a
 * logged-out visitor must never reach this (PublicTopNav gates on useSession).
 */
export function AuthedTopStripStandalone() {
  const model = useShellModel()
  return <AuthedTopStrip model={model} mountFeedbackHub />
}
