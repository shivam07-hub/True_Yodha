"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Skeleton, { SkeletonTheme } from "react-loading-skeleton"
import "react-loading-skeleton/dist/skeleton.css"
import { MyroLogo } from "@/components/myro-logo"
import { SettingsModal, type Tab as SettingsTab } from "@/components/settings-modal"
import { MyrologyOptInPrompt, useMyrologyInterest } from "@/components/myrology-optin-prompt"
import { ThemeControl } from "@/components/ui/theme-control"
import { AccountLegalLinks } from "@/components/shell/account-legal-links"
import { openFeedbackHub } from "@/components/feedback"
import type { SidebarProfile } from "@/lib/shell/contract"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { CONTENT_NAV } from "@/lib/nav-items"

const SKELETON_BASE = "var(--tm-surface-2)"
const SKELETON_HIGHLIGHT = "rgba(255,255,255,0.06)"

export function AppShellSkeleton() {
  return (
    <SkeletonTheme baseColor={SKELETON_BASE} highlightColor={SKELETON_HIGHLIGHT} duration={1.6} borderRadius={6}>
      <div
        className="tm-shell-skeleton"
        style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100vw", overflow: "hidden", background: "var(--tm-bg)" }}
      >
        {/* Desktop: top bar skeleton */}
        <div className="tm-app-topbar" style={{ gap: 16 }}>
          <Skeleton width={120} height={28} />
          <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 8 }}>
            {[72, 64, 96, 56, 80, 64].map((w, i) => <Skeleton key={i} width={w} height={32} borderRadius={99} />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton width={80} height={32} borderRadius={99} />
            <Skeleton width={34} height={34} circle />
          </div>
        </div>

        {/* Mobile: top bar skeleton */}
        <header className="tm-mobile-topbar" style={{ background: "var(--tm-surface)" }}>
          <Skeleton width={72} height={24} />
          <Skeleton width={68} height={28} borderRadius={99} />
          <Skeleton width={32} height={32} circle />
        </header>

        {/* Content shimmer */}
        <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="tm-main-scroll" style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {[80, 48, 48, 48, 32].map((h, i) => (
              <div key={i} style={{ opacity: 1 - i * 0.1 }}>
                <Skeleton height={h} />
              </div>
            ))}
          </div>
        </main>

        {/* Mobile: bottom nav skeleton */}
        <nav className="tm-mobile-bottomnav" style={{ background: "var(--tm-surface)" }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <Skeleton width={20} height={20} />
              <Skeleton width={32} height={8} />
            </div>
          ))}
        </nav>
      </div>
    </SkeletonTheme>
  )
}

// Practice stays in task nav/page surfaces, never as a top chrome timer or
// balance counter. The bottom bar is driven by shared progressive-disclosure nav so
// gating matches the desktop topbar: first-run = Mission + Intel, growing to
// +CV (1st tailor) → +Tracker (2nd company). Skills is deep-link only.
type MobileNavIconName = "mission" | "intel" | "skills" | "cv" | "tracker"

function MobileNavIcon({ name, active }: { name: MobileNavIconName; active: boolean }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { opacity: active ? 1 : 0.82 },
  }

  if (name === "mission") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M5 20V9.6L12 4l7 5.6V20" />
        <path d="M8.5 20v-6.5h7V20" />
        <path d="M9 11.5v3M12 9.5v5M15 12.5v2" />
      </svg>
    )
  }

  if (name === "intel") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  if (name === "skills") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 3.2 19.7 7.6v8.8L12 20.8l-7.7-4.4V7.6L12 3.2Z" />
      </svg>
    )
  }

  if (name === "cv") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 3.5 18.5 12 12 20.5 5.5 12 12 3.5Z" />
      </svg>
    )
  }

  return (
    <svg {...common} aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h10" />
    </svg>
  )
}

export function MobileTopBar({ profile, onAvatarClick }: {
  xpBalance: number
  profile: SidebarProfile | null
  onAvatarClick: () => void
  onXPOpen?: () => void
}) {
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "HM"

  // Canonical "open settings" trigger — any surface (e.g. the market location
  // chip) dispatches `tm:open-settings`; the desktop chrome listens too.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("Account")
  useEffect(() => {
    const h = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      if (tab) setSettingsTab(tab as SettingsTab)
      setSettingsOpen(true)
    }
    document.addEventListener("tm:open-settings", h)
    return () => document.removeEventListener("tm:open-settings", h)
  }, [])

  return (
    <header className="tm-mobile-topbar">
      <Link href="/home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", minWidth: 0 }}>
        <MyroLogo size={30} />
      </Link>
      <button
        onClick={onAvatarClick}
        style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "var(--tm-surface-2)",
          border: "1px solid var(--tm-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "var(--tm-text)", cursor: "pointer",
        }}
      >
        {initials}
      </button>
      {settingsOpen && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={profile} initialTab={settingsTab} />}
    </header>
  )
}

function MobileStaleBadge() {
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
      style={{
        position: "absolute", top: -4, right: -8,
        minWidth: 13, height: 13, borderRadius: 99,
        background: "var(--tm-danger)", color: "white",
        fontSize: 9, fontFamily: "var(--tm-font-mono)",
        display: "grid", placeItems: "center", padding: "0 3px",
      }}
    >
      {n > 9 ? "9+" : n}
    </span>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const nav = useNavUnlocks()

  return (
    <nav className="tm-mobile-bottomnav">
      {nav.visibleMobile.map(item => {
        const active = pathname.startsWith(item.href)
        const color = active ? "var(--tm-interactive)" : "var(--tm-interactive-rest)"
        const isNew = nav.newItems.has(item.id)

        return (
          <Link
            key={item.id}
            href={item.href}
            className="tm-mobile-nav-item"
            data-active={active}
            onClick={() => { if (isNew) nav.clearNew(item.id) }}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4, textDecoration: "none",
              color,
            }}
          >
            <span className="tm-mobile-nav-icon" style={{ position: "relative" }}>
              <MobileNavIcon name={item.mobileIcon ?? "mission"} active={active} />
              {item.stalePill && <MobileStaleBadge />}
              {isNew && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute", top: -3, right: -7, width: 7, height: 7,
                    borderRadius: "50%", background: "var(--tm-accent)",
                  }}
                />
              )}
            </span>
            <span className="tm-mobile-nav-label" style={{ fontWeight: active ? 650 : 450 }}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileProfileSheet({ profile, onClose, signOut }: {
  profile: SidebarProfile | null
  onClose: () => void
  signOut: () => void
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const [myroPromptOpen, setMyroPromptOpen] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStart = useRef<number | null>(null)
  const router = useRouter()
  const { interested: myrologyInterested } = useMyrologyInterest()

  const fullName = profile?.full_name ?? "My Account"
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "HM"

  const handleSignOut = () => { signOut(); onClose() }

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const delta = e.touches[0].clientY - dragStart.current
    if (delta > 0) setDragOffset(delta)
  }
  const onTouchEnd = () => {
    if (dragOffset > 80) onClose()
    setDragOffset(0)
    dragStart.current = null
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)" }}
      />

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
        background: "var(--tm-surface)",
        borderTop: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-panel-radius-lg) var(--tm-panel-radius-lg) 0 0",
        padding: "16px 20px 20px",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset > 0 ? "none" : "transform 200ms var(--tm-ease)",
      }}>
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          role="button"
          aria-label="Swipe down to close"
          style={{ padding: "4px 0 16px", margin: "-4px auto 4px", display: "flex", justifyContent: "center", touchAction: "none", cursor: "grab" }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--tm-border)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--tm-border-soft)" }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: "var(--tm-text)",
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)" }}>{fullName}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>{profile?.email ?? ""}</div>
          </div>
        </div>

        {/* Shared content — Intel / Newsletter (intel-authed grill Q13). The
            5-slot bottom bar has no room, so the mobile home for these is the
            account sheet; on desktop they sit in the topbar cluster instead. */}
        {CONTENT_NAV.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "14px 4px",
              borderBottom: "1px solid var(--tm-border-soft)",
              textDecoration: "none", color: "var(--tm-interactive-rest)",
            }}
          >
            <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>↗</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
          </Link>
        ))}

        {[
          { label: "My Profile",        icon: "⚙",  action: () => setShowSettings(true) },
          { label: "Myrology",          icon: "✦",  action: () => { if (myrologyInterested) { onClose(); router.push("/myrology") } else setMyroPromptOpen(true) } },
          { label: "Feedback and ideas", icon: "◎",  action: () => { openFeedbackHub({ category: "idea" }); onClose() } },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "14px 4px",
              background: "transparent", border: "none",
              borderBottom: "1px solid var(--tm-border-soft)",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              color: "var(--tm-interactive-rest)",
            }}
          >
            <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>{item.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}

        <div style={{ padding: "16px 4px", borderBottom: "1px solid var(--tm-border-soft)" }}>
          <ThemeControl fluid />
        </div>

        <button
          onClick={() => setSignOutConfirm(true)}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            width: "100%", padding: "14px 4px",
            background: "transparent", border: "none",
            cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            color: "rgba(255,130,130,0.9)",
          }}
        >
          <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>→</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Sign out</span>
        </button>

        <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--tm-border-soft)" }}>
          <AccountLegalLinks />
        </div>

      </div>

      {showSettings && (
        <SettingsModal open={showSettings} onClose={() => { setShowSettings(false); onClose() }} profile={profile} />
      )}
      <MyrologyOptInPrompt
        open={myroPromptOpen}
        onClose={() => setMyroPromptOpen(false)}
        onConfirmed={() => { onClose(); router.push("/myrology") }}
      />
      {signOutConfirm && (
        <div
          onClick={() => setSignOutConfirm(false)}
          style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative", background: "var(--tm-surface)",
              border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)",
              padding: "28px", width: 320, zIndex: 1, textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 8 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Your progress is saved. Sign back in anytime.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSignOutConfirm(false)}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-interactive-rest)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >Cancel</button>
              <button
                onClick={handleSignOut}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
