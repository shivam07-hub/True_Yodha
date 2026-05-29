"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Issue } from "@/lib/newsletter"

interface IssueCardProps {
  issue: Issue
}

// Substack-style archive row — no box, hairline-divided, whole row clickable.
// Density over decoration: eyebrow · title · one-line dek + an always-on chevron
// at the right edge signalling "click to open". Eager-prefetches the issue on
// mount so every click is an instant fade+rise (no loader) in production.
export function IssueCard({ issue }: IssueCardProps) {
  const router = useRouter()
  const href = `/newsletter/${issue.slug}`

  useEffect(() => {
    router.prefetch(href)
  }, [router, href])

  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })

  return (
    <Link
      href={href}
      prefetch
      style={{
        display: "flex", alignItems: "center", gap: 16, textDecoration: "none",
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
        const c = e.currentTarget.querySelector("[data-nl-chevron]")
        if (c) {
          ;(c as HTMLElement).style.color = "var(--tm-interactive)"
          ;(c as HTMLElement).style.transform = "translateX(3px)"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        e.currentTarget.style.borderLeftColor = "transparent"
        const t = e.currentTarget.querySelector("h2")
        if (t) (t as HTMLElement).style.color = "var(--tm-text)"
        const c = e.currentTarget.querySelector("[data-nl-chevron]")
        if (c) {
          ;(c as HTMLElement).style.color = "var(--tm-text-faint)"
          ;(c as HTMLElement).style.transform = "translateX(0)"
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
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
      </div>

      <span
        data-nl-chevron
        aria-hidden="true"
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--tm-text-faint)",
          transition: "color var(--tm-dur) var(--tm-ease), transform var(--tm-dur) var(--tm-ease)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M6.5 4l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  )
}