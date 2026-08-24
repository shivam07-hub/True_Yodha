"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { deriveRefreshNotice, type RefreshNoticeKind } from "@/lib/job-refresh-notice"
import { refreshIsLive, type RevealedJob, type UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"
import { openRefreshGate } from "@/store/refreshGateStore"

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

const NOTICE_STYLES: Record<RefreshNoticeKind, { color: string; bg: string; border: string }> = {
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
    color: "var(--tm-interactive)",
    bg:    "var(--tm-int-bg-wash)",
    border:"var(--tm-int-border)",
  },
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
  const isWorking = refreshIsLive(vm.state)
  const workLabel =
    vm.progressTotal != null
      ? `Ranked ${vm.progressDone ?? 0}/${vm.progressTotal}`
      : (vm.progressLabel ?? "Refreshing…")
  const latest = vm.revealed.length > 0 ? vm.revealed[vm.revealed.length - 1] : null
  const notice = deriveRefreshNotice({
    state: vm.state,
    progressLabel: vm.progressLabel,
    matchesWritten: vm.matchesWritten,
    errorMessage: vm.errorMessage,
    outcomeKind: vm.outcomeKind,
  })
  const styles = notice ? NOTICE_STYLES[notice.kind] : null
  // Broke users can still OPEN the gate (editing targeting is free); the gate
  // shows the shortfall + /xp path. Only true work/disable blocks the click.
  const cannotClick = disabled || isWorking

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

  if (variant === "compact") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <button
          onClick={() => openRefreshGate("review")}
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
              e.currentTarget.style.borderColor = "var(--tm-int-border)"
              e.currentTarget.style.color = "var(--tm-interactive)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
            e.currentTarget.style.color = "var(--tm-text-muted)"
          }}
        >
          {isWorking ? <IconScan /> : <IconRefresh />}
          {isWorking ? workLabel : "Refresh matches"}
        </button>

        {isWorking && latest?.title && <RevealLine job={latest} />}

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
          onClick={() => openRefreshGate("review")}
          disabled={cannotClick}
          loading={isWorking}
        >
          {isWorking ? <IconScan /> : <IconRefresh />}
          <span>{isWorking ? workLabel : "Refresh matches"}</span>
        </Button>
      </div>

      {isWorking && latest?.title && <RevealLine job={latest} />}

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

/* ─── Per-job reveal (ADR-0009) ───────────────────────────────────── */

/** One-line live reveal of the role the ranker just finished — re-fades each
 *  time a new job lands, so the user sees roles stream in one-by-one. */
function RevealLine({ job }: { job: RevealedJob }) {
  const label = [job.title, job.company].filter(Boolean).join(" · ")
  return (
    <div
      key={label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        maxWidth: 320, fontSize: 11, fontFamily: "var(--tm-font-mono)",
        color: "var(--tm-text-muted)", letterSpacing: "0.02em",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        animation: "tm-notice-in 200ms ease both",
      }}
    >
      <span aria-hidden style={{ color: "var(--tm-interactive)" }}>→</span>
      {label}
    </div>
  )
}
