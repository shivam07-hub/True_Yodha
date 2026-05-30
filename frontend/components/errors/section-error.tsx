"use client"

import type { CSSProperties } from "react"
import { describeFailure } from "@/lib/api-error"
import { traceRefLine } from "@/lib/failure-copy"

/**
 * Inline failure tile for a single dashboard region. When one section's query
 * fails, the rest of the page stays live — this renders in that region's slot
 * with the compact copy + a Retry, never taking down the whole screen.
 *
 * Matches the inline-style + --tm-* token idiom used by HttpStatusFallback.
 */

const wrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "20px 16px",
  minHeight: 96,
  border: "1px solid var(--tm-border-soft)",
  borderRadius: 12,
  background: "var(--tm-surface)",
  textAlign: "center",
}

const btn: CSSProperties = {
  padding: "6px 16px",
  borderRadius: 8,
  border: "1px solid var(--tm-border)",
  background: "var(--tm-surface)",
  color: "var(--tm-interactive)",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "var(--tm-font-sans)",
}

export function SectionError({
  error,
  onRetry,
  label,
}: {
  error: unknown
  onRetry?: () => void
  /** Optional region name, e.g. "matches", for a more specific line. */
  label?: string
}) {
  const { copy, traceId, retryable } = describeFailure(error)
  const ref = traceRefLine(traceId)

  return (
    <div role="alert" style={wrap}>
      <span style={{ fontSize: 13, color: "var(--tm-text-muted)", fontFamily: "var(--tm-font-sans)" }}>
        {label ? `Couldn't load ${label}.` : copy.short}
      </span>
      {ref && (
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", userSelect: "all" }}>
          {ref}
        </span>
      )}
      {retryable && onRetry && (
        <button type="button" onClick={onRetry} style={btn}>
          {copy.action?.label ?? "Retry"}
        </button>
      )}
    </div>
  )
}
