"use client"

import type { CSSProperties } from "react"
import { RefreshCw } from "lucide-react"
import { FAILURE_COPY } from "@/lib/failure-copy"

/**
 * Calm, non-alarming banner shown when a background refresh failed but we still
 * have persisted/cached data to display. Stale data is usually fine — so this
 * is muted, not red — but the user deserves to know it isn't live, plus a way
 * to retry. Pairs with the query-cache persistence (lib/query-persist.ts).
 */

function relativeAge(ts: number): string {
  const diff = ts - Date.now() // negative = in the past
  const mins = Math.round(diff / 60000)
  if (Math.abs(mins) < 1) return "just now"
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute")
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour")
  return rtf.format(Math.round(hours / 24), "day")
}

const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 14px",
  marginBottom: 16,
  borderRadius: 10,
  border: "1px solid var(--tm-border-soft)",
  background: "var(--tm-surface)",
  color: "var(--tm-text-muted)",
  fontSize: 12,
  fontFamily: "var(--tm-font-sans)",
}

const btn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 8,
  border: "1px solid var(--tm-border)",
  background: "transparent",
  color: "var(--tm-interactive)",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
}

export function StaleBanner({
  lastViewAt,
  onRefresh,
  refreshing = false,
}: {
  lastViewAt: number
  onRefresh: () => void
  refreshing?: boolean
}) {
  const message = FAILURE_COPY.stale.title.replace("{age}", relativeAge(lastViewAt))
  return (
    <div role="status" aria-live="polite" style={bar}>
      <span>{message}</span>
      <button type="button" onClick={onRefresh} disabled={refreshing} style={btn}>
        <RefreshCw size={13} aria-hidden className={refreshing ? "animate-spin" : undefined} />
        {refreshing ? "Refreshing…" : FAILURE_COPY.stale.action?.label ?? "Refresh"}
      </button>
    </div>
  )
}
