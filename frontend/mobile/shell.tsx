"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Skeleton, { SkeletonTheme } from "react-loading-skeleton"
import "react-loading-skeleton/dist/skeleton.css"
import { SettingsModal, type Tab as SettingsTab } from "@/components/settings-modal"
import { MyroLogo } from "@/components/myro-logo"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useMobileUI } from "./redesign/mobile-ui"

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
          <Skeleton width={34} height={34} borderRadius={10} />
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
              <Skeleton width={22} height={22} />
              <Skeleton width={34} height={9} />
            </div>
          ))}
        </nav>
      </div>
    </SkeletonTheme>
  )
}

/* ── Bottom-nav icons (ported to the dot from the handoff) ─────────────────── */
type TabIcon = "jobs" | "collections" | "cv" | "profile"

function NavIcon({ name }: { name: TabIcon }) {
  const c = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  }
  if (name === "jobs") {
    return <svg {...c} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" /></svg>
  }
  if (name === "collections") {
    return <svg {...c} aria-hidden="true"><path d="M20 7.5 12 3 4 7.5v9L12 21l8-4.5v-9Z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg>
  }
  if (name === "cv") {
    return <svg {...c} aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
  }
  return <svg {...c} aria-hidden="true"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" /></svg>
}

const TABS: { key: TabIcon; label: string; href: string; match: (p: string) => boolean }[] = [
  { key: "jobs", label: "Jobs", href: "/market", match: p => p.startsWith("/market") },
  { key: "collections", label: "Collections", href: "/collections", match: p => p.startsWith("/collections") },
  { key: "cv", label: "CV", href: "/cv", match: p => p.startsWith("/cv") },
  { key: "profile", label: "Profile", href: "/me", match: p => p.startsWith("/me") },
]

function CollectionsBadge() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const n = (data ?? []).filter(a => a.status === "saved").length
  if (n === 0) return null
  return (
    <span
      style={{
        position: "absolute", top: -3, right: -9, minWidth: 15, height: 15, borderRadius: 99,
        background: "var(--mm-accent, #00f5d4)", color: "var(--mm-accent-fg, #04211b)",
        fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 4px", fontVariantNumeric: "tabular-nums",
      }}
    >
      {n > 9 ? "9+" : n}
    </span>
  )
}

/**
 * MobileTopBar — the handoff top bar: Myro wordmark (left) + Practice bolt
 * (right, opens the Practice sheet). No avatar; Profile lives in the 4th tab.
 */
export function MobileTopBar() {
  const { openPractice } = useMobileUI()

  // Canonical "open settings" trigger — any surface dispatches `tm:open-settings`.
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
    <header className="tm-mobile-topbar mm-root" style={{ alignItems: "center", background: "var(--mm-bg)", borderBottom: "1px solid rgba(255,255,255,0.045)" }}>
      <Link href="/market" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", minWidth: 0 }}>
        <MyroLogo size={24} decorative />
        <span style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mm-text)" }}>Myro</span>
      </Link>
      <button
        onClick={openPractice}
        aria-label="Practice"
        className="mm-press-sm"
        style={{
          position: "relative", width: 34, height: 34, borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.07)", background: "#212120", color: "#c9c9c2",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 4.5 13.5H11L9.8 22 19 10h-6.5L13 2Z" />
        </svg>
        <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: 99, background: "var(--mm-accent)" }} />
      </button>
      {settingsOpen && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={null} initialTab={settingsTab} />}
    </header>
  )
}

/**
 * MobileBottomNav — the fixed 4-tab bar (Jobs · Collections · CV · Profile).
 * Handoff: active = accent colour only, no pill; labels are sentence-case.
 * Replaces the old progressive-disclosure nav (full IA swap, mobile only).
 */
export function MobileBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="tm-mobile-bottomnav mm-root"
      style={{ background: "rgba(23,23,22,0.94)", borderTop: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", gap: 0 }}
    >
      {TABS.map(tab => {
        const active = tab.match(pathname)
        const color = active ? "var(--mm-accent)" : "#71716a"
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="mm-press"
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 3, textDecoration: "none", color, position: "relative", minHeight: 44,
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <NavIcon name={tab.key} />
              {tab.key === "collections" && <CollectionsBadge />}
            </span>
            <span style={{ fontSize: 10, fontWeight: 650, letterSpacing: "0.01em" }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
