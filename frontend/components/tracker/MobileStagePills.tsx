"use client"

import { APPLICATION_STAGES } from "@/lib/api"
import { STAGE_LABEL } from "./useTrackerBoard"
import type { StageKey } from "./useTrackerBoard"

interface Props {
  active: StageKey
  counts: Record<StageKey, number>
  onChange: (stage: StageKey) => void
}

export function MobileStagePills({ active, counts, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex", gap: 8, overflowX: "auto", padding: "4px 2px 10px",
        scrollbarWidth: "none",
      }}
    >
      {(APPLICATION_STAGES as readonly StageKey[]).map(s => {
        const isActive = s === active
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 99,
              fontSize: 12, fontFamily: "inherit",
              border: `1px solid ${isActive ? "var(--tm-accent)" : "var(--tm-border)"}`,
              background: isActive ? "var(--tm-accent)" : "rgba(255,255,255,0.025)",
              color: isActive ? "var(--tm-accent-fg)" : "var(--tm-text-muted)",
              cursor: "pointer",
            }}
          >
            <span>{STAGE_LABEL[s]}</span>
            <span style={{
              fontFamily: "var(--tm-font-mono)", fontSize: 10,
              opacity: 0.85,
            }}>
              {counts[s]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
