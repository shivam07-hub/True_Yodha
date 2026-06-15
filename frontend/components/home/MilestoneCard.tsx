"use client"

import type { JobPathMilestone } from "@/lib/api"

interface MilestoneCardProps {
  milestone: JobPathMilestone
  proofText: string
  saving: boolean
  onProofChange: (v: string) => void
  onSave: () => void
}

export function MilestoneCard({ milestone, proofText, saving, onProofChange, onSave }: MilestoneCardProps) {
  const isDone = !!milestone.completed_at

  if (isDone) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          padding: "4px 12px", borderRadius: 99,
          background: "var(--tm-success-wash)", border: "1px solid var(--tm-success-border)",
          color: "var(--tm-success)", fontSize: 12, fontWeight: 700,
        }}>
          ✓ Done
        </span>
      </div>
    )
  }

  return (
    <div style={{
      background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
      borderRadius: 6, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tm-text)" }}>
        {milestone.title}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--tm-text-muted)", lineHeight: 1.55 }}>
        {milestone.action}
      </div>
      <textarea
        value={proofText}
        onChange={(e) => onProofChange(e.target.value)}
        placeholder={milestone.proof_prompt ?? "Describe what you did…"}
        style={{
          width: "100%", boxSizing: "border-box",
          minHeight: 50, resize: "vertical",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--tm-border)",
          borderRadius: 6, padding: "8px 10px",
          fontSize: 12, color: "var(--tm-text)", fontFamily: "inherit",
          outline: "none", transition: "border-color 150ms var(--tm-ease)",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tm-int-border)" }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>Save proof to claim Myro Coins</span>
        <button
          onClick={onSave}
          disabled={!proofText.trim() || saving}
          style={{
            padding: "7px 14px", borderRadius: 99,
            background: proofText.trim() ? "var(--tm-interactive)" : "rgba(255,255,255,0.04)",
            border: "none",
            color: proofText.trim() ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)",
            fontSize: 12, fontWeight: 700,
            cursor: proofText.trim() ? "pointer" : "default",
            fontFamily: "inherit", transition: "all 150ms var(--tm-ease)",
          }}
        >
          {saving ? "Saving…" : "Save proof"}
        </button>
      </div>
    </div>
  )
}
