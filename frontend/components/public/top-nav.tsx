"use client"

import Link from "next/link"

export type PublicNavPage = "intel" | "newsletter" | "privacy" | "signup" | "login"

interface PublicTopNavProps {
  active?: PublicNavPage
  showSignIn?: boolean
}

const NAV_ITEMS: { label: string; href: string; id: PublicNavPage }[] = [
  { label: "Intel", href: "/", id: "intel" },
  { label: "Newsletter", href: "/newsletter", id: "newsletter" },
  { label: "Privacy", href: "/privacy", id: "privacy" },
  { label: "Sign up", href: "/signup", id: "signup" },
]

export function PublicTopNav({ active, showSignIn }: PublicTopNavProps) {
  return (
    <nav
      aria-label="Public navigation"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "0 12px",
        height: 44,
        minHeight: 44,
        background: "var(--tm-surface)",
        borderBottom: "1px solid var(--tm-border-soft)",
        overflowX: "auto",
        scrollbarWidth: "none",
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active
        const isCTA = item.id === "signup"
        return (
          <Link
            key={item.id}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "4px 10px",
              height: 28,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 12,
              fontWeight: isActive || isCTA ? 600 : 400,
              color: isCTA
                ? "var(--tm-accent-fg)"
                : isActive
                ? "var(--tm-accent)"
                : "var(--tm-text-muted)",
              background: isCTA
                ? "var(--tm-accent)"
                : isActive
                ? "var(--tm-accent-wash)"
                : "transparent",
              border: `1px solid ${isCTA ? "var(--tm-accent)" : isActive ? "var(--tm-accent-ring)" : "transparent"}`,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color var(--tm-dur-fast) var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
            }}
            onMouseEnter={(e) => {
              if (isCTA) {
                e.currentTarget.style.background = "var(--tm-accent-hover)"
                e.currentTarget.style.borderColor = "var(--tm-accent-hover)"
              } else if (!isActive) {
                e.currentTarget.style.color = "var(--tm-text)"
                e.currentTarget.style.background = "rgba(255,255,255,0.04)"
              }
            }}
            onMouseLeave={(e) => {
              if (isCTA) {
                e.currentTarget.style.background = "var(--tm-accent)"
                e.currentTarget.style.borderColor = "var(--tm-accent)"
              } else if (!isActive) {
                e.currentTarget.style.color = "var(--tm-text-muted)"
                e.currentTarget.style.background = "transparent"
              }
            }}
          >
            {item.label}
          </Link>
        )
      })}
      {showSignIn && (
        <Link
          href="/login"
          style={{
            marginLeft: "auto",
            display: "flex", alignItems: "center",
            padding: "4px 12px", height: 28,
            borderRadius: "var(--tm-radius-pill)",
            fontSize: 12, fontWeight: 500,
            color: "var(--tm-text-muted)",
            background: "transparent",
            border: "1px solid var(--tm-border-soft)",
            textDecoration: "none", whiteSpace: "nowrap",
            transition: "color var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--tm-accent)"
            e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--tm-text-muted)"
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
          }}
        >
          Sign in →
        </Link>
      )}
    </nav>
  )
}
