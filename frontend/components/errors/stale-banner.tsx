"use client"

import type { CSSProperties } from "react"
import { RefreshCw } from "lucide-react"
import { FAILURE_COPY } from "@/lib/failure-copy"
import { formatRelativeAge } from "@/lib/format"

/**
 * Calm, non-alarming banner shown when a background refresh failed but we still
 * have persisted/cached data to display. Stale data is usually fine — so this
 * is muted, not red — but the user deserves to know it isn't live, plus a way
 * to retry. Pairs with the query-cache persistence (lib/query-persist.ts).
 */

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
  const message = FAILURE_COPY.stale.title.replace("{age}", formatRelativeAge(lastViewAt))
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
