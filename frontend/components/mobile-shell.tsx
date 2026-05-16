"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { SettingsModal } from "@/components/settings-modal"
import { FEEDBACK_ACTIONS, FeedbackModal } from "@/components/app-shell"
import type { SidebarProfile } from "@/components/app-shell"

const MOBILE_NAV = [
  { href: "/home",   label: "Dashboard", icon: null },
  { href: "/market", label: "Intel",     icon: "◉" },
  { href: "/skills", label: "Skills",    icon: "⬡" },
  { href: "/cv",     label: "CV",        icon: "◈" },
]

export function MobileTopBar({ xpBalance, profile, onAvatarClick }: {
  xpBalance: number
  profile: SidebarProfile | null
  onAvatarClick: () => void
}) {
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "HM"

  return (
    <header className="tm-mobile-topbar">
      <Link href="/home" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{ filter: "drop-shadow(0 0 6px var(--tm-accent-glow))" }}>
          <MyroLogo size={24} />
        </div>
        <span style={{ fontFamily: "var(--tm-font-display)", fontSize: 17, fontWeight: 600, color: "var(--tm-text)" }}>
          Myro
        </span>
      </Link>

      <div style={{
        padding: "5px 11px", borderRadius: 99,
        background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
        fontFamily: "var(--tm-font-mono)", fontSize: 13, fontWeight: 700,
        color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ filter: "drop-shadow(0 0 4px var(--tm-accent-glow))" }}>◆</span>
        {xpBalance}
        <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontWeight: 400 }}>XP</span>
      </div>

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
