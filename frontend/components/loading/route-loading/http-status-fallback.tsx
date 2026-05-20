"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/\bHTTP (\d{3})\b/)
  if (match) return parseInt(match[1], 10)
  if (error.message.includes("Session expired")) return 401
  return null
}

interface HttpStatusFallbackProps {
  status: number
  onRetry?: () => void
}

export function HttpStatusFallback({ status, onRetry }: HttpStatusFallbackProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    if (status === 401) {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 429) return
    if (countdown <= 0) { onRetry?.(); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [status, countdown, onRetry])

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

  if (status === 401) return null

  if (status === 403) return (
    <div style={base}>
      <span style={{ fontSize: 13 }}>Access restricted</span>
    </div>
  )

  if (status === 404) return (
    <div style={base}>
      <span style={{ fontSize: 13 }}>Not found</span>
    </div>
  )

  if (status === 429) return (
    <div style={base}>
      <span style={{ fontSize: 13 }}>Too many requests</span>
      <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
        Retry in {countdown}s
      </span>
    </div>
  )

  // 5xx
  return (
    <div style={base}>
      <span style={{ fontSize: 13 }}>Something went wrong on our end</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: "6px 16px",
            borderRadius: 8,
            border: "1px solid var(--tm-border)",
            background: "var(--tm-surface)",
            color: "var(--tm-accent)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "var(--tm-font-sans)",
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
