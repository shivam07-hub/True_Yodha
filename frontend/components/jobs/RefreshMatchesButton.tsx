"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { REFRESH_XP_COST } from "@/lib/hooks/use-match-refresh"

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

/* ─── Notice type ─────────────────────────────────────────────────── */

type NoticeKind = "success" | "cached" | "error" | "info"

function classifyNotice(msg: string): NoticeKind {
  if (msg.includes("Not enough XP") || msg.includes("Insufficient") || msg.includes("failed") || msg.includes("unavailable")) return "error"
  if (msg.includes("cached") || msg.includes("Cached")) return "cached"
  if (msg.includes("Updated") || msg.includes("matched roles") || msg.includes("updated")) return "success"
  return "info"
}

const NOTICE_STYLES: Record<NoticeKind, { color: string; bg: string; border: string }> = {
  success: {
    color: "var(--tm-success)",
    bg:    "rgba(74,222,128,0.06)",
    border:"rgba(74,222,128,0.2)",
  },
  cached: {
    color: "var(--tm-accent)",
    bg:    "var(--tm-accent-wash)",
    border:"var(--tm-accent-ring)",
  },
  error: {
    color: "var(--tm-danger)",
    bg:    "rgba(251,113,133,0.06)",
    border:"rgba(251,113,133,0.25)",
  },
  info: {
    color: "var(--tm-text-faint)",
    bg:    "transparent",
    border:"transparent",
  },
}

/* ─── Component ───────────────────────────────────────────────────── */

interface RefreshMatchesButtonProps {
  isRefreshing: boolean
  notice: string | null
  onRefresh: () => void
  disabled?: boolean
  hidden?: boolean
  variant?: "header" | "compact"
}

export function RefreshMatchesButton({
  isRefreshing,
  notice,
  onRefresh,
  disabled,
  hidden,
  variant = "header",
}: RefreshMatchesButtonProps) {
  const kind = notice ? classifyNotice(notice) : null
  const styles = kind ? NOTICE_STYLES[kind] : null

  /* Fade-in key resets the animation every time notice changes */
  const [fadeKey, setFadeKey] = useState(0)
  const prevNotice = useRef(notice)
  useEffect(() => {
    if (notice !== prevNotice.current) {
      prevNotice.current = notice
      setFadeKey(k => k + 1)
    }
  }, [notice])

  if (hidden) return null

  if (variant === "compact") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <button
          onClick={onRefresh}
          disabled={disabled || isRefreshing}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            height: 34, padding: "0 14px",
            borderRadius: 999,
            background: "transparent",
            border: "1px solid var(--tm-border-soft)",
            color: "var(--tm-text-muted)",
            fontSize: 13, fontWeight: 500,
            cursor: disabled || isRefreshing ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: disabled || isRefreshing ? 0.6 : 1,
            transition: "border-color 200ms, color 200ms",
          }}
          onMouseEnter={e => {
            if (!disabled && !isRefreshing) {
              e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
              e.currentTarget.style.color = "var(--tm-accent)"
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
            e.currentTarget.style.color = "var(--tm-text-muted)"
          }}
        >
          {isRefreshing ? <IconScan /> : <IconRefresh />}
          {isRefreshing ? "Refreshing…" : "Refresh matches"}
          {!isRefreshing && (
            <span style={{
              paddingLeft: 7,
              borderLeft: "1px solid rgba(255,255,255,0.1)",
              fontFamily: "var(--tm-font-mono)",
              fontSize: 10,
              letterSpacing: "0.07em",
              color: "rgba(0,245,212,0.5)",
              fontWeight: 400,
            }}>
              -{REFRESH_XP_COST} if new
            </span>
          )}
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
            {notice}
          </div>
        )}
      </div>
    )
  }

  /* ── header variant ─────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>

      {/* Button row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Button
          variant="outline"
          size="md"
          onClick={onRefresh}
          disabled={disabled || isRefreshing}
          loading={isRefreshing}
        >
          {isRefreshing ? <IconScan /> : <IconRefresh />}
          <span>{isRefreshing ? "Refreshing…" : "Refresh matches"}</span>
          {!isRefreshing && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              marginLeft: 2,
              paddingLeft: 8,
              borderLeft: "1px solid var(--tm-accent-ring)",
              fontFamily: "var(--tm-font-mono)",
              fontSize: 11,
              letterSpacing: "0.07em",
              color: "rgba(0,245,212,0.55)",
              fontWeight: 400,
              lineHeight: 1,
            }}>
              -{REFRESH_XP_COST}&thinsp;XP if new
            </span>
          )}
        </Button>
      </div>

      {/* Notice */}
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
            boxShadow: kind === "success" ? "0 0 6px var(--tm-success)" : kind === "error" ? "0 0 6px var(--tm-danger)" : "none",
          }} />
          {notice}
        </div>
      ) : null}

    </div>
  )
}
