"use client"

import * as React from "react"

/* Shared visual helpers for the Matching Brain fields that are NOT a reading of
   how good a match is. The grade badge, the Apply/Negotiate pill, the 5-axis
   bars and the detail modal that held them were deleted when the drawer stopped
   restating the ring: nothing rendered them afterwards, and the ring is the one
   answer to "how good" (CONTEXT.md Match Verdict). */


export function LegitimacyBadge({ tier, reason }: { tier?: string | null; reason?: string | null }) {
  if (tier !== "caution" && tier !== "suspicious") return null
  const suspicious = tier === "suspicious"
  const tone = suspicious ? "var(--tm-danger)" : "var(--tm-warning)"
  return (
    <span
      title={reason || undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10,
        border: `1px solid ${tone}`, background: "transparent", color: tone,
        fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}
    >
      ⚠ {suspicious ? "Possible ghost job" : "Check details"}
    </span>
  )
}

export function ArchetypeChip({ archetype }: { archetype?: string | null }) {
  if (!archetype) return null
  return (
    <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", color: "var(--tm-text-muted)", padding: "3px 8px", borderRadius: 6, background: "var(--tm-int-bg-wash)" }}>
      {archetype}
    </span>
  )
}

// ── 5-axis breakdown ─────────────────────────────────────────────────────────
