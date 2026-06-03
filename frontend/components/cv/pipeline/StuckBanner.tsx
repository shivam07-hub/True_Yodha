"use client"

import type { StaleApplication } from "@/lib/api"

interface Props {
  stale: StaleApplication[]
  onMarkGhosted: (jobId: string) => void
  onUpdate: (jobId: string) => void
  onDismiss: (jobId: string) => void
}

export function StuckBanner({ stale, onMarkGhosted, onUpdate, onDismiss }: Props) {
  if (stale.length === 0) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {stale.map(a => (
        <div
          key={a.job_id}
          style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 8, padding: "8px 14px",
          }}
        >
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "rgba(251,191,36,0.9)", marginRight: 4 }}>⏱</span>
          <span style={{ fontSize: 13, color: "var(--tm-text-muted)", flex: 1 }}>
            Been 7 days since we last heard from{" "}
            <strong style={{ color: "var(--tm-text)" }}>{a.company ?? a.title}</strong>
          </span>
          <button
            onClick={() => onMarkGhosted(a.job_id)}
            style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 99,
              background: "rgba(251,113,133,0.1)",
              border: "1px solid rgba(251,113,133,0.3)",
              color: "var(--tm-danger)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            They went silent
          </button>
          <button
            onClick={() => onUpdate(a.job_id)}
            style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 99,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--tm-border)",
              color: "var(--tm-interactive-rest)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            I have an update
          </button>
          <button
            onClick={() => onDismiss(a.job_id)}
            title="Snooze 7 days"
            style={{
              display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: "50%",
              background: "transparent", border: "none",
              color: "var(--tm-interactive-rest)", cursor: "pointer", fontSize: 11, padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
