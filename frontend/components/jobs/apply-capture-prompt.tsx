"use client"

import * as React from "react"
import type { ApplyCapture } from "./use-apply-capture"

/**
 * Apply Transport (presentation half, web) — renders the capture band off the
 * headless `ApplyCapture.state`. Styled with `--tm-*`; the mobile design system
 * has its own `.mm-*` adapter. Render it near a drawer/card footer.
 *
 * The user, not an outbound click, owns the application truth.
 */
export function ApplyCapturePrompt({ capture }: { capture: ApplyCapture }) {
  if (capture.state === "checking") {
    return (
      <div style={bandStyle} role="status">
        <span style={{ color: "var(--tm-text-muted)" }}>
          Checking whether this listing is still open…
        </span>
      </div>
    )
  }
  if (capture.state === "closed") {
    return (
      <div style={{ ...bandStyle, justifyContent: "space-between" }} role="status">
        <span style={{ color: "var(--tm-danger)", fontWeight: 600 }}>
          This listing is closed — Myro stopped the handoff.
        </span>
        <button type="button" onClick={capture.findSimilar} style={linkStyle}>
          Find live alternatives →
        </button>
      </div>
    )
  }
  if (capture.state === "asking") {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 24px",
          borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-int-bg-wash)",
          fontSize: 12.5, flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--tm-text)", fontWeight: 600 }}>Did you submit?</span>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("submitted")} style={pillStyle()}>
          Yes
        </button>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("not_yet")} style={pillStyle()}>
          Not yet
        </button>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("couldnt")} style={pillStyle(true)}>
          Couldn&rsquo;t apply
        </button>
      </div>
    )
  }
  if (capture.state === "issue") {
    return (
      <div style={bandStyle}>
        <span style={{ color: "var(--tm-text)", fontWeight: 600 }}>What blocked you?</span>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("link_gone")} style={pillStyle(true)}>Link gone</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("wrong_page")} style={pillStyle(true)}>Wrong page</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("wrong_role")} style={pillStyle(true)}>Wrong role</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("technical")} style={pillStyle(true)}>Technical issue</button>
      </div>
    )
  }
  const message = capture.state === "saved"
    ? "Kept in Collections"
    : capture.state === "submitted"
      ? "Marked applied"
      : capture.state === "reported"
        ? "Thanks — kept in Collections"
        : null
  if (message) {
    return (
      <div style={{ ...bandStyle, justifyContent: "space-between" }}>
        <span style={{ color: "var(--tm-text-muted)" }}>{message}</span>
        {capture.state === "reported" ? (
          <button type="button" onClick={capture.findSimilar} style={linkStyle}>Find similar roles →</button>
        ) : null}
      </div>
    )
  }
  if (capture.state === "error") {
    return (
      <div style={{ ...bandStyle, justifyContent: "space-between" }} role="alert">
        <span style={{ color: "var(--tm-danger)" }}>Couldn&rsquo;t save that update</span>
        <button type="button" disabled={capture.pending} onClick={capture.retry} style={linkStyle}>
          {capture.pending ? "Saving…" : "Retry"}
        </button>
      </div>
    )
  }
  return null
}

const bandStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "10px 24px",
  borderTop: "1px solid var(--tm-border-soft)", background: "var(--tm-int-bg-wash)",
  fontSize: 12.5, flexWrap: "wrap",
}

const linkStyle: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "var(--tm-interactive)",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
}

function pillStyle(danger = false): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 999,
    border: `1px solid ${danger ? "var(--tm-danger)" : "var(--tm-border-soft)"}`,
    background: "transparent", color: danger ? "var(--tm-danger)" : "var(--tm-text)",
    fontSize: 12, cursor: "pointer",
  }
}
