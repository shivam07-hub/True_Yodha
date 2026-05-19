"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Skeleton, { SkeletonTheme } from "react-loading-skeleton"
import "react-loading-skeleton/dist/skeleton.css"
import { MyroLogo } from "@/components/myro-logo"
import { SettingsModal } from "@/components/settings-modal"
import { FEEDBACK_ACTIONS, FeedbackModal } from "@/components/app-shell"
import type { SidebarProfile } from "@/components/app-shell"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const SKELETON_BASE = "var(--tm-surface-2)"
const SKELETON_HIGHLIGHT = "rgba(255,255,255,0.06)"

export function AppShellSkeleton() {
  return (
    <SkeletonTheme baseColor={SKELETON_BASE} highlightColor={SKELETON_HIGHLIGHT} duration={1.6} borderRadius={6}>
      <div
        className="tm-shell-skeleton"
        style={{ display: "flex", height: "100dvh", width: "100vw", overflow: "hidden", background: "var(--tm-bg)" }}
      >

        {/* Desktop: sidebar skeleton */}
        <div className="tm-sidebar-wrap" style={{
          width: 220, flexShrink: 0,
          background: "var(--tm-surface)",
          borderRight: "1px solid var(--tm-border-soft)",
          padding: 16, display: "flex", flexDirection: "column", gap: 12,
        }}>
          <Skeleton height={44} />
          <Skeleton height={52} />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ opacity: 1 - i * 0.15 }}>
              <Skeleton height={40} />
            </div>
          ))}
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

const MOBILE_NAV: Array<{ href: string; label: string; icon: string | null; stalePill?: boolean }> = [
  { href: "/home",    label: "Dashboard", icon: null },
  { href: "/market",  label: "Intel",     icon: "◉" },
  { href: "/skills",  label: "Skills",    icon: "⬡" },
  { href: "/cv",      label: "CV",        icon: "◈" },
  { href: "/tracker", label: "Tracker",   icon: "▤", stalePill: true },
]

export function MobileTopBar({ xpBalance, profile, onAvatarClick, onXPOpen }: {
  xpBalance: number
  profile: SidebarProfile | null
  onAvatarClick: () => void
  onXPOpen?: () => void
}) {
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "HM"

  return (
    <header className="tm-mobile-topbar">
      <Link href="/myro" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ filter: "drop-shadow(0 0 6px var(--tm-accent-glow))" }}>
          <MyroLogo size={24} />
        </div>
        <span style={{ fontFamily: "var(--tm-font-display)", fontSize: 17, fontWeight: 600, color: "var(--tm-text)" }}>
          Myro
        </span>
      </Link>

      <button
        type="button"
        onClick={onXPOpen}
        aria-label="Open XP guide"
        style={{
          padding: "5px 11px", borderRadius: 99,
          background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
          fontFamily: "var(--tm-font-mono)", fontSize: 13, fontWeight: 700,
          color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 5,
          cursor: "pointer",
        }}>
        <span style={{ filter: "drop-shadow(0 0 4px var(--tm-accent-glow))" }}>◆</span>
        {xpBalance}
        <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontWeight: 400 }}>XP</span>
      </button>

      <button
        onClick={onAvatarClick}
        style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, var(--tm-border), var(--tm-accent-wash))",
          border: "1px solid var(--tm-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "var(--tm-text)", cursor: "pointer",
        }}
      >
        {initials}
      </button>
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

  return (
    <nav className="tm-mobile-bottomnav">
      {MOBILE_NAV.map(item => {
        const active = pathname.startsWith(item.href)
        const color = active ? "var(--tm-accent)" : "var(--tm-text-faint)"

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, textDecoration: "none",
              color,
            }}
          >
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {item.icon === null ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  style={{ filter: active ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none" }}>
                  <path
                    d="M12 2.5C12 2.5 13.1 9.1 15.5 11.5C17.9 13.9 21.5 12 21.5 12C21.5 12 17.9 10.1 15.5 12.5C13.1 14.9 12 21.5 12 21.5C12 21.5 10.9 14.9 8.5 12.5C6.1 10.1 2.5 12 2.5 12C2.5 12 6.1 13.9 8.5 11.5C10.9 9.1 12 2.5 12 2.5Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <span style={{
                  fontSize: 18, lineHeight: 1,
                  filter: active ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none",
                }}>
                  {item.icon}
                </span>
              )}
              {item.stalePill && <MobileStaleBadge />}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: "0.01em" }}>
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
  const [activeModal, setActiveModal] = useState<typeof FEEDBACK_ACTIONS[0] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  const fullName = profile?.full_name ?? "My Account"
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "HM"

  const handleSignOut = () => { signOut(); onClose() }

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
        borderRadius: "16px 16px 0 0",
        padding: "16px 20px 20px",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--tm-border)", margin: "0 auto 20px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--tm-border-soft)" }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, var(--tm-accent-wash), var(--tm-accent-ring))",
            border: "1.5px solid var(--tm-accent-ring)",
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

        {[
          { label: "My Profile",     icon: "⚙",  action: () => setShowSettings(true),                     danger: false },
          { label: "Send Feedback",  icon: "◎",  action: () => setActiveModal(FEEDBACK_ACTIONS[2]),        danger: false },
          { label: "Sign out",       icon: "→",  action: () => setSignOutConfirm(true),                    danger: true  },
        ].map((item, i, arr) => (
          <button
            key={item.label}
            onClick={item.action}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "14px 4px",
              background: "transparent", border: "none",
              borderBottom: i < arr.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              color: item.danger ? "rgba(255,130,130,0.9)" : "var(--tm-text-muted)",
            }}
          >
            <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>{item.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}
      </div>

      {activeModal && (
        <FeedbackModal action={activeModal} onClose={() => { setActiveModal(null); onClose() }} />
      )}
      {showSettings && (
        <SettingsModal open={showSettings} onClose={() => { setShowSettings(false); onClose() }} profile={profile} />
      )}
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
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
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
