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
      {/* Left group: informational nav links */}
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active
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
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--tm-accent)" : "var(--tm-text-muted)",
              background: isActive ? "var(--tm-accent-wash)" : "transparent",
              border: `1px solid ${isActive ? "var(--tm-accent-ring)" : "transparent"}`,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color var(--tm-dur-fast) var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--tm-text)"
                e.currentTarget.style.background = "rgba(255,255,255,0.04)"
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "var(--tm-text-muted)"
                e.currentTarget.style.background = "transparent"
              }
            }}
          >
            {item.label}
          </Link>
        )
      })}

      {/* Right group: auth entry points */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <Link
          href="/signup"
          style={{
            display: "flex", alignItems: "center",
            padding: "4px 12px", height: 28,
            borderRadius: "var(--tm-radius-pill)",
            fontSize: 12, fontWeight: 600,
            color: "var(--tm-accent-fg)",
            background: "var(--tm-accent)",
            border: "1px solid var(--tm-accent)",
            textDecoration: "none", whiteSpace: "nowrap",
            transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--tm-accent-hover)"
            e.currentTarget.style.borderColor = "var(--tm-accent-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--tm-accent)"
            e.currentTarget.style.borderColor = "var(--tm-accent)"
          }}
        >
          Sign up
        </Link>
        {showSignIn && (
          <Link
            href="/login"
            style={{
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
      </div>
    </nav>
  )
}
