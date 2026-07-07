"use client"

import { useState } from "react"

interface ApplyRowProps {
  company: string | null | undefined
  title: string | null | undefined
  jobId: string | number | null | undefined
  /** Visual density. "compact" = single-line meta; "block" = larger stacked buttons. */
  variant?: "compact" | "block"
  /** Skip the "Open careers" link when the host already surfaces it (e.g. the
   *  export toolbar) — leaves only the copy-ID / copy-title helpers. */
  hideCareers?: boolean
  /** Arm the dead-link capture when the user leaves to apply (careers search).
   *  No-URL listings are the likeliest ghosts, so this path must ask too. */
  onApply?: () => void
}

/**
 * Three-affordance apply row. Replaces the scraped `source_url` "Open JD" link.
 *
 * 1. Open {company} careers → Google search "{company} careers".
 *    Zero backfill; lands on the right careers page in ~95% of cases.
 * 2. Copy Job ID → user pastes in the careers-page search box.
 * 3. Copy title → fallback when the careers page does not support ID search.
 *
 * Defensible posture: we do not host or surface scraped JD URLs.
 */
export function ApplyRow({ company, title, jobId, variant = "compact", hideCareers = false, onApply }: ApplyRowProps) {
  const careersHref = company && !hideCareers
    ? `https://www.google.com/search?q=${encodeURIComponent(`${company} careers`)}`
    : null

  const isBlock = variant === "block"
  const baseBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: isBlock ? 32 : 26,
    padding: isBlock ? "0 12px" : "0 10px",
    borderRadius: 6,
    fontSize: isBlock ? 12 : 11,
    fontFamily: "var(--tm-font-mono)",
    border: "1px solid var(--tm-border-soft)",
    background: "rgba(255,255,255,0.02)",
    color: "var(--tm-text-muted)",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    }}>
      {careersHref && (
        <a
          href={careersHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onApply}
          style={{ ...baseBtn, color: "var(--tm-interactive)", borderColor: "var(--tm-int-border)" }}
          title={`Open ${company} careers in a new tab`}
        >
          ↗ Open {company} careers
        </a>
      )}
      {jobId != null && jobId !== "" && (
        <CopyButton
          label={`Job ID · ${String(jobId).slice(0, 10)}${String(jobId).length > 10 ? "…" : ""}`}
          value={String(jobId)}
          ariaLabel={`Copy job ID ${jobId}`}
          baseStyle={baseBtn}
        />
      )}
      {title && (
        <CopyButton
          label="Copy title"
          value={title}
          ariaLabel={`Copy job title ${title}`}
          baseStyle={baseBtn}
        />
      )}
    </div>
  )
}

function CopyButton({ label, value, ariaLabel, baseStyle }: {
  label: string
  value: string
  ariaLabel: string
  baseStyle: React.CSSProperties
}) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="tm-control-focus"
      style={{
        ...baseStyle,
        ...(copied ? { color: "var(--tm-success)", borderColor: "var(--tm-success)" } : {}),
      }}
    >
      {copied ? "✓ Copied" : `📋 ${label}`}
    </button>
  )
}
