"use client"

import type { ApplyCapture } from "@/components/jobs/use-apply-capture"

/**
 * Apply Transport (presentation half, mobile) — the same headless capture the
 * web drawers use, rendered in the mobile design system's `.mm-*` palette. Keeps
 * the ghost signal flowing from the mobile Jobs/Collections sheets, not just web.
 */
export function ApplyCapturePromptMobile({ capture }: { capture: ApplyCapture }) {
  if (capture.state === "asking") {
    return (
      <div style={row}>
        <span style={{ color: "var(--mm-text)", fontWeight: 650 }}>Was this still live?</span>
        <button type="button" onClick={() => capture.answer(true)} style={pill(false)}>Yes</button>
        <button type="button" onClick={() => capture.answer(false)} style={pill(true)}>No, it&rsquo;s gone</button>
      </div>
    )
  }
  if (capture.state === "gone") {
    return (
      <div style={{ ...row, justifyContent: "space-between" }}>
        <span style={{ color: "var(--mm-muted)" }}>Flagged as a ghost job — thanks.</span>
        <button
          type="button"
          onClick={capture.findSimilar}
          style={{ background: "none", border: "none", padding: 0, color: "var(--mm-accent)", fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit" }}
        >
          Find similar roles →
        </button>
      </div>
    )
  }
  return null
}

const row: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  padding: "12px 4px", borderTop: "1px solid var(--mm-hair)",
  fontSize: 12.5, fontFamily: "inherit",
}

function pill(danger: boolean): React.CSSProperties {
  return {
    padding: "6px 13px", borderRadius: 999,
    border: `1px solid ${danger ? "var(--mm-bad)" : "var(--mm-border)"}`,
    background: "transparent", color: danger ? "var(--mm-bad)" : "var(--mm-text)",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  }
}
