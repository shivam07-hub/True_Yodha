"use client"

import { useRouter } from "next/navigation"

type CVRequiredNudgeProps = {
  variant?: "banner" | "block"
  feature?: string
  hasCv: boolean
  className?: string
}

export function CVRequiredNudge({ variant = "banner", feature = "personalised insights", hasCv, className }: CVRequiredNudgeProps) {
  const router = useRouter()

  if (hasCv) return null

  if (variant === "banner") {
    return (
      <div
        className={className}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 14px",
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius)",
          color: "var(--tm-text)",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
          Add your CV to unlock <span style={{ color: "var(--tm-text)", fontWeight: 500 }}>{feature}</span>.
        </span>
        <button
          type="button"
          onClick={() => router.push("/cv")}
          className="tm-btn tm-btn-primary"
          style={{ height: 30, padding: "0 14px", fontSize: 12, flexShrink: 0 }}
        >
          Upload CV →
        </button>
      </div>
    )
  }

  const capitalized = feature.charAt(0).toUpperCase() + feature.slice(1)

  return (
    <div
      className={className}
      style={{
        padding: 24,
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius)",
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", gap: 12,
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: "var(--tm-radius)",
        background: "var(--tm-accent-wash)",
        border: "1px solid var(--tm-accent-ring)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, color: "var(--tm-accent)",
        filter: "drop-shadow(0 0 8px var(--tm-accent-glow))",
      }}>
        ◈
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>
          {capitalized} needs your CV.
        </div>
        <div style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
          Takes about 30 seconds. You can swap or remove it any time.
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push("/cv")}
        className="tm-btn tm-btn-primary"
        style={{ height: 36, padding: "0 20px", fontSize: 13 }}
      >
        Upload CV →
      </button>
    </div>
  )
}
