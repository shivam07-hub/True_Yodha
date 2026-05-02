"use client"

import Link from "next/link"

const linkStyle = { fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", transition: "color var(--tm-dur-fast) var(--tm-ease)" }

export function PublicFooter() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 12,
        padding: "10px 16px",
        borderTop: "1px solid var(--tm-border-soft)",
        flexShrink: 0,
      }}
    >
      <Link
        href="/privacy"
        style={linkStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
      >
        Privacy
      </Link>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.4 }}>·</span>
      <Link
        href="/newsletter"
        style={linkStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
      >
        Newsletter
      </Link>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.4 }}>·</span>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>© Myro 2026</span>
    </div>
  )
}
