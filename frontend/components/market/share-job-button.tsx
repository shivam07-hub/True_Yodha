"use client"

import * as React from "react"
import type { JobFeedItem } from "@/lib/api"
import { shareJobRole } from "@/lib/job-share"

type ShareJob = Pick<JobFeedItem, "job_title" | "company_name" | "source_url">

/**
 * Share affordance that sits beside Save across the feed surfaces (web card,
 * mobile swipe deck, detail drawer). Web Share API on mobile / Safari → native
 * sheet (WhatsApp first on India mobile); elsewhere → clipboard with a
 * transient "Copied". Shares the role title + the direct apply link so the
 * recipient lands on the exact job (the internal job_id is not company-searchable).
 *
 * variant "triage" matches the Save/Skip pill chrome; "drawer" matches the
 * detail-drawer secondary buttons.
 */
export function ShareJobButton({ job, variant = "triage" }: { job: ShareJob; variant?: "triage" | "drawer" }) {
  const [copied, setCopied] = React.useState(false)

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if ((await shareJobRole(job)) === "copied") {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  const label = copied ? "Copied" : "Share"
  const glyph = copied ? "✓" : "↪"

  if (variant === "drawer") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={copied ? "Link copied" : "Share this job"}
        title="Share this job"
        style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
      >
        <span aria-hidden>{glyph}</span> {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Link copied" : "Share this job"}
      title="Share this job"
      className="tm-triage-btn tm-triage-share"
    >
      <span aria-hidden>{glyph}</span> {label}
    </button>
  )
}
