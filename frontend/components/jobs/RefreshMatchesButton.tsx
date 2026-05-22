"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  REFRESH_XP_COST,
  type RefreshState,
  type UseJobRefreshResult,
} from "@/lib/hooks/use-job-refresh"

/* ─── Icons ──────────────────────────────────────────────────────── */

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 0 1 10.5-3.9" />
    <path d="M14 2v3h-3" />
    <path d="M14 8a6 6 0 0 1-10.5 3.9" />
    <path d="M2 14v-3h3" />
  </svg>
)

const IconScan = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="1.5" />
    <path d="M8 8L14 4" strokeWidth="1" opacity="0.6" />
    <circle cx="8" cy="8" r="5" strokeDasharray="2 3" opacity="0.4">
      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1.8s" repeatCount="indefinite" />
    </circle>
  </svg>
)

/* ─── Notice derivation ───────────────────────────────────────────── */

type NoticeKind = "success" | "error" | "info"

const NOTICE_STYLES: Record<NoticeKind, { color: string; bg: string; border: string }> = {
  success: {
    color: "var(--tm-success)",
    bg:    "rgba(74,222,128,0.06)",
    border:"rgba(74,222,128,0.2)",
  },
  error: {
    color: "var(--tm-danger)",
    bg:    "rgba(251,113,133,0.06)",
    border:"rgba(251,113,133,0.25)",
  },
  info: {
    color: "var(--tm-accent)",
    bg:    "var(--tm-accent-wash)",
    border:"var(--tm-accent-ring)",
  },
}

function deriveNotice(state: RefreshState, progressLabel: string | null, matches: number | null, error: string | null): { msg: string; kind: NoticeKind } | null {
  if (state === "computing" || state === "charging") {
    return { msg: progressLabel ?? "Refreshing…", kind: "info" }
  }
  if (state === "done") {
    if (matches != null && matches > 0) {
      return { msg: `+${matches} new matches · -${REFRESH_XP_COST} XP`, kind: "success" }
    }
    return { msg: "No new matches · XP refunded", kind: "info" }
  }
  if (state === "error_insufficient_xp" || state === "error_failed") {
    return { msg: error ?? "Refresh failed. Please try again.", kind: "error" }
  }
  return null
}

/* ─── Component ───────────────────────────────────────────────────── */

interface RefreshMatchesButtonProps {
  vm: UseJobRefreshResult
  disabled?: boolean
  variant?: "header" | "compact"
}

export function RefreshMatchesButton({
  vm,
  disabled,
  variant = "header",
}: RefreshMatchesButtonProps) {
  const isWorking = vm.state === "charging" || vm.state === "computing"
  const notice = deriveNotice(vm.state, vm.progressLabel, vm.matchesWritten, vm.errorMessage)
  const styles = notice ? NOTICE_STYLES[notice.kind] : null
  const cannotClick = disabled || isWorking || !vm.canAfford

  /* Fade-in key resets the animation every time notice text changes */
  const [fadeKey, setFadeKey] = useState(0)
  const prevNotice = useRef(notice?.msg ?? null)
  useEffect(() => {
    const msg = notice?.msg ?? null
    if (msg !== prevNotice.current) {
      prevNotice.current = msg
      setFadeKey((k) => k + 1)
    }
  }, [notice])

  const costLabel = !isWorking && (
    <span style={{
      paddingLeft: 7,
      borderLeft: "1px solid rgba(255,255,255,0.1)",
      fontFamily: "var(--tm-font-mono)",
      fontSize: 10,
      letterSpacing: "0.07em",
      color: vm.canAfford ? "rgba(0,245,212,0.5)" : "var(--tm-danger)",
      fontWeight: 400,
    }}>
      -{vm.cost} XP{vm.canAfford ? " if new" : " (need more)"}
    </span>
  )

  if (variant === "compact") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <button
          onClick={vm.refresh}
          disabled={cannotClick}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            height: 34, padding: "0 14px",
            borderRadius: 999,
            background: "transparent",
            border: "1px solid var(--tm-border-soft)",
            color: "var(--tm-text-muted)",
            fontSize: 13, fontWeight: 500,
            cursor: cannotClick ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: cannotClick ? 0.6 : 1,
            transition: "border-color 200ms, color 200ms",
          }}
          onMouseEnter={(e) => {
            if (!cannotClick) {
              e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
              e.currentTarget.style.color = "var(--tm-accent)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
            e.currentTarget.style.color = "var(--tm-text-muted)"
          }}
        >
          {isWorking ? <IconScan /> : <IconRefresh />}
          {isWorking ? (vm.progressLabel ?? "Refreshing…") : "Refresh matches"}
          {costLabel}
        </button>

        {notice && styles && (
          <div
            key={fadeKey}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 10px",
              borderRadius: 99,
              background: styles.bg,
              border: `1px solid ${styles.border}`,
              fontSize: 11,
              fontFamily: "var(--tm-font-mono)",
              color: styles.color,
              letterSpacing: "0.04em",
              animation: "tm-notice-in 200ms ease both",
              maxWidth: 320,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {notice.msg}
          </div>
        )}
      </div>
    )
  }

  /* ── header variant ─────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Button
          variant="outline"
          size="md"
          onClick={vm.refresh}
          disabled={cannotClick}
          loading={isWorking}
        >
          {isWorking ? <IconScan /> : <IconRefresh />}
          <span>{isWorking ? (vm.progressLabel ?? "Refreshing…") : "Refresh matches"}</span>
          {!isWorking && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              marginLeft: 2,
              paddingLeft: 8,
              borderLeft: "1px solid var(--tm-accent-ring)",
              fontFamily: "var(--tm-font-mono)",
              fontSize: 11,
              letterSpacing: "0.07em",
              color: vm.canAfford ? "rgba(0,245,212,0.55)" : "var(--tm-danger)",
              fontWeight: 400,
              lineHeight: 1,
            }}>
              -{vm.cost}&thinsp;XP{vm.canAfford ? " if new" : " (need more)"}
            </span>
          )}
        </Button>
      </div>

      {notice && styles ? (
        <div
          key={fadeKey}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px",
            borderRadius: "var(--tm-radius-sm)",
            background: styles.bg,
            border: `1px solid ${styles.border}`,
            fontSize: 12,
            fontFamily: "var(--tm-font-mono)",
            color: styles.color,
            letterSpacing: "0.03em",
            animation: "tm-notice-in 220ms var(--tm-ease) both",
            maxWidth: 360,
          }}
        >
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: styles.color,
            flexShrink: 0,
            boxShadow: notice.kind === "success" ? "0 0 6px var(--tm-success)" : notice.kind === "error" ? "0 0 6px var(--tm-danger)" : "none",
          }} />
          {notice.msg}
        </div>
      ) : null}
    </div>
  )
}
