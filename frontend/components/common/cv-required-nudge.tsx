"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

type CVRequiredNudgeProps = {
  variant?: "banner" | "block"
  feature?: string
  hasCv: boolean
  className?: string
}

export function CVRequiredNudge({ variant = "banner", feature = "personalised insights", hasCv, className }: CVRequiredNudgeProps) {
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
        <Button
          variant="solid"
          size="sm"
          render={<Link href="/cv" />}
          className="flex-shrink-0"
        >
          Upload CV →
        </Button>
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
      <Button variant="solid" size="md" render={<Link href="/cv" />}>
        Upload CV →
      </Button>
    </div>
  )
}
