"use client"

import Link from "next/link"
import type { Issue } from "@/lib/newsletter"

interface IssueCardProps {
  issue: Issue
}

// Substack-style archive row — no box, hairline-divided, whole row clickable.
// Density over decoration: eyebrow · title · one-line dek.
export function IssueCard({ issue }: IssueCardProps) {
  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })

  return (
    <Link
      href={`/newsletter/${issue.slug}`}
      style={{
        display: "block", textDecoration: "none",
        padding: "16px 12px",
        borderBottom: "1px solid var(--tm-border-soft)",
        borderLeft: "2px solid transparent",
        transition: "background var(--tm-dur) var(--tm-ease), border-left-color var(--tm-dur) var(--tm-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--tm-hover)"
        e.currentTarget.style.borderLeftColor = "var(--tm-interactive)"
        const t = e.currentTarget.querySelector("h2")
        if (t) (t as HTMLElement).style.color = "var(--tm-interactive)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        e.currentTarget.style.borderLeftColor = "transparent"
        const t = e.currentTarget.querySelector("h2")
        if (t) (t as HTMLElement).style.color = "var(--tm-text)"
      }}
    >
      <div style={{ fontSize: 11, color: "var(--tm-interactive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 500 }}>
        {issue.theme} · {date}
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", lineHeight: 1.3, margin: 0, transition: "color var(--tm-dur) var(--tm-ease)" }}>
        {issue.title}
      </h2>
      <p style={{
        fontSize: 13.5, color: "var(--tm-text-muted)", lineHeight: 1.55, marginTop: 5,
        display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {issue.summary}
      </p>
    </Link>
  )
}
