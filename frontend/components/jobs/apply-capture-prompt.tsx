"use client"

import * as React from "react"
import type { ApplyCapture } from "./use-apply-capture"

/**
 * Apply Transport (presentation half, web) — renders the capture band off the
 * headless `ApplyCapture.state`. Styled with `--tm-*`; the mobile design system
 * has its own `.mm-*` adapter. Render it near a drawer/card footer.
 *
 * asking → "Was this still live?" (Yes / No, it's gone)
 * gone   → "Flagged as a ghost job" + "Find similar roles →" recovery
 */
export function ApplyCapturePrompt({ capture }: { capture: ApplyCapture }) {
  if (capture.state === "asking") {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 24px",
          borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-int-bg-wash)",
          fontSize: 12.5, flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--tm-text)", fontWeight: 600 }}>Was this still live?</span>
        <button type="button" onClick={() => capture.answer(true)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontSize: 12, cursor: "pointer" }}>
          Yes
        </button>
        <button type="button" onClick={() => capture.answer(false)} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid var(--tm-danger)", background: "transparent", color: "var(--tm-danger)", fontSize: 12, cursor: "pointer" }}>
          No, it&rsquo;s gone
        </button>
      </div>
    )
  }
  if (capture.state === "gone") {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "10px 24px", borderTop: "1px solid var(--tm-border-soft)",
          background: "var(--tm-int-bg-wash)", fontSize: 12.5, flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--tm-text-muted)" }}>Flagged as a ghost job — thanks.</span>
        <button
          type="button"
          onClick={capture.findSimilar}
          style={{ background: "none", border: "none", padding: 0, color: "var(--tm-interactive)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Find similar roles →
        </button>
      </div>
    )
  }
  return null
}
