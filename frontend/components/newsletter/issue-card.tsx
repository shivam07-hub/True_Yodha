"use client"

import Link from "next/link"
import type { Issue } from "@/lib/newsletter"

interface IssueCardProps {
  issue: Issue
}

export function IssueCard({ issue }: IssueCardProps) {
  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })

  return (
    <Link
      href={`/newsletter/${issue.slug}`}
      style={{
        display: "block", textDecoration: "none",
        padding: "20px 24px",
        borderRadius: "var(--tm-radius)",
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderLeft: "3px solid var(--tm-accent)",
        transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
        e.currentTarget.style.borderLeftColor = "var(--tm-accent)"
        e.currentTarget.style.boxShadow = "var(--tm-shadow-glow)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.borderLeftColor = "var(--tm-accent)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <div style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        {issue.theme} · {date}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 8 }}>
        {issue.title}
      </h2>
      <p style={{ fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
        {issue.summary}
      </p>
      <div style={{ marginTop: 14, fontSize: 13, color: "var(--tm-accent)", fontWeight: 500 }}>
        Read issue →
      </div>
    </Link>
  )
}
