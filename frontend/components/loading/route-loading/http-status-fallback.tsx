"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ApiError, describeFailure } from "@/lib/api-error"
import { traceRefLine } from "@/lib/failure-copy"

/**
 * Extract an HTTP status from any error. Prefers the structured ApiError.status;
 * falls back to the legacy `HTTP {n}` / "Session expired" message conventions so
 * older throw sites still classify. Returns null for non-HTTP failures
 * (timeout, offline, network) — those carry no status and are handled by kind.
 */
export function extractHttpStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (!(error instanceof Error)) return null
  const match = error.message.match(/\bHTTP (\d{3})\b/)
  if (match) return parseInt(match[1], 10)
  if (error.message.includes("Session expired")) return 401
  return null
}

const base: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 240,
  gap: 12,
  color: "var(--tm-text-muted)",
  fontFamily: "var(--tm-font-sans)",
  textAlign: "center",
  padding: "32px 24px",
}

const retryBtn: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 16px",
  borderRadius: 8,
  border: "1px solid var(--tm-border)",
  background: "var(--tm-surface)",
  color: "var(--tm-interactive)",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "var(--tm-font-sans)",
}

/**
 * Full-area failure surface driven by the shared copy SSOT. Handles the two
 * recoveries that aren't a plain retry — 401 redirects to /login, 429 counts
 * down then auto-retries — and surfaces the trace ref on our-fault (5xx).
 */
export function FailureFallback({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const router = useRouter()
  const { kind, copy, traceId, retryable } = describeFailure(error)
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    if (kind === "session") router.push("/login")
  }, [kind, router])

  useEffect(() => {
    if (kind !== "rateLimited") return
    if (countdown <= 0) {
      onRetry?.()
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [kind, countdown, onRetry])

  if (kind === "session") return null // redirecting

  const ref = traceRefLine(traceId)

  return (
    <div role="alert" style={base}>
      <span style={{ fontSize: 13 }}>{copy.title}</span>
      {kind === "rateLimited" && (
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>Retry in {countdown}s</span>
      )}
      {ref && (
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", userSelect: "all" }}>
          {ref}
        </span>
      )}
      {retryable && kind !== "rateLimited" && onRetry && (
        <button type="button" onClick={onRetry} style={retryBtn}>
          {copy.action?.label ?? "Retry"}
        </button>
      )}
    </div>
  )
}

/**
 * Back-compat wrapper: callers that only have a status code. Synthesizes an
 * ApiError so the same copy-driven surface renders.
 */
export function HttpStatusFallback({ status, onRetry }: { status: number; onRetry?: () => void }) {
  return <FailureFallback error={new ApiError(`HTTP ${status}`, { status, kind: "http" })} onRetry={onRetry} />
}
