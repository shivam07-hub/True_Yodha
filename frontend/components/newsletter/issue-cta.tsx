"use client"

import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

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
        background: "rgba(0, 245, 212, 0.04)",
        border: "1px solid rgba(0, 245, 212, 0.15)",
        borderTop: "2px solid #22d3a8",
        boxShadow: "0 0 32px rgba(0, 245, 212, 0.06)",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#22d3a8" }}>
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
        onClick={() => trackEvent("newsletter_cta_click", { role, issue_slug: issueSlug })}
        style={{
          alignSelf: "flex-start",
          padding: "10px 20px",
          borderRadius: "var(--tm-radius-pill)",
          background: "#22d3a8",
          color: "var(--tm-interactive-fg)",
          fontSize: 13, fontWeight: 600,
          textDecoration: "none",
          boxShadow: "0 0 8px rgba(0, 245, 212, 0.18)",
          transition: "background var(--tm-dur-fast) var(--tm-ease), box-shadow var(--tm-dur-fast) var(--tm-ease)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--tm-interactive-hover)"
          e.currentTarget.style.boxShadow = "0 0 16px rgba(0, 245, 212, 0.32)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#22d3a8"
          e.currentTarget.style.boxShadow = "0 0 8px rgba(0, 245, 212, 0.18)"
        }}
      >
        Get my free Myro Score →
      </Link>
    </div>
  )
}
