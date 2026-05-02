"use client"

import Link from "next/link"

interface NewsletterCTAProps {
  role: string
  issueSlug: string
}

export function NewsletterCTA({ role, issueSlug }: NewsletterCTAProps) {
  const href = `/signup?role=${encodeURIComponent(role)}&utm_source=newsletter&utm_campaign=${encodeURIComponent(issueSlug)}`

  return (
    <div
      style={{
        margin: "32px 0",
        padding: "24px 28px",
        borderRadius: "var(--tm-radius-lg)",
        background: "var(--tm-accent-wash)",
        border: "1px solid var(--tm-accent-ring)",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)" }}>
        Free · No credit card
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)" }}>
        See how you compare as a {role}
      </div>
      <p style={{ fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
        Upload your CV and get your Myro Score in 60 seconds. See exactly which skills from this market data you already have.
      </p>
      <Link
        href={href}
        style={{
          alignSelf: "flex-start",
          padding: "10px 20px",
          borderRadius: "var(--tm-radius-pill)",
          background: "var(--tm-accent)",
          color: "var(--tm-accent-fg)",
          fontSize: 13, fontWeight: 600,
          textDecoration: "none",
          transition: "background var(--tm-dur-fast) var(--tm-ease), box-shadow var(--tm-dur-fast) var(--tm-ease)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--tm-accent-hover)"
          e.currentTarget.style.boxShadow = "var(--tm-shadow-glow)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--tm-accent)"
          e.currentTarget.style.boxShadow = "none"
        }}
      >
        Get my free Myro Score →
      </Link>
    </div>
  )
}
