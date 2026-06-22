"use client"

import type { OutcomeKey } from "./useTrackerBoard"

interface Props {
  outcome: OutcomeKey
  inline?: boolean
}

const STAMP_LABEL: Record<OutcomeKey, string> = {
  offer: "OFFER",
  rejected: "DECLINED",
  ghosted: "—",
}

const STAMP_COLOR: Record<OutcomeKey, string> = {
  offer: "#D4AF37",                        // gold leaf
  rejected: "var(--tm-text-faint)",
  ghosted: "var(--tm-text-faint)",
}

export function OutcomeSeal({ outcome, inline }: Props) {
  const color = STAMP_COLOR[outcome]
  const isOffer = outcome === "offer"
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "4px 10px",
    border: `1px solid ${color}`,
    borderRadius: 4,
    fontFamily: "var(--tm-font-serif, var(--tm-font-mono))",
    fontSize: 11, letterSpacing: "0.18em",
    textTransform: "uppercase",
    color, background: isOffer ? "rgba(212,175,55,0.08)" : "transparent",
  }
  const positioned: React.CSSProperties = inline
    ? base
    : { ...base, position: "absolute", top: 12, right: 12 }
  return (
    <div aria-label={`Sealed ${outcome}`} style={positioned}>
      {STAMP_LABEL[outcome]}
    </div>
  )
}
