"use client"

import type { ApplyCapture } from "@/components/jobs/use-apply-capture"

/**
 * Mobile presentation of the same return-confirmation contract as web.
 */
export function ApplyCapturePromptMobile({ capture }: { capture: ApplyCapture }) {
  if (capture.state === "checking") {
    return (
      <div style={row} role="status">
        <span style={{ color: "var(--mm-muted)" }}>Checking whether this listing is still open…</span>
      </div>
    )
  }
  if (capture.state === "closed") {
    return (
      <div style={{ ...row, justifyContent: "space-between" }} role="status">
        <span style={{ color: "var(--mm-bad)", fontWeight: 650 }}>
          This listing is closed — Myro stopped the handoff.
        </span>
        <button type="button" onClick={capture.findSimilar} style={link}>Find live alternatives →</button>
      </div>
    )
  }
  if (capture.state === "asking") {
    return (
      <div style={row}>
        <span style={{ color: "var(--mm-text)", fontWeight: 650 }}>Did you submit?</span>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("submitted")} style={pill(false)}>Yes</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("not_yet")} style={pill(false)}>Not yet</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.answer("couldnt")} style={pill(true)}>Couldn&rsquo;t apply</button>
      </div>
    )
  }
  if (capture.state === "issue") {
    return (
      <div style={row}>
        <span style={{ color: "var(--mm-text)", fontWeight: 650 }}>What blocked you?</span>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("link_gone")} style={pill(true)}>Link gone</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("wrong_page")} style={pill(true)}>Wrong page</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("wrong_role")} style={pill(true)}>Wrong role</button>
        <button type="button" disabled={capture.pending} onClick={() => capture.reportIssue("technical")} style={pill(true)}>Technical</button>
      </div>
    )
  }
  const message = capture.state === "saved"
    ? "Kept in Collections"
    : capture.state === "submitted"
      ? "Marked applied"
      : capture.state === "reported"
        ? "Thanks — flagged"
        : null
  // See the web prompt: terminal states report and stop; the Next chip owns the
  // onward step.
  if (message) {
    return (
      <div style={row}>
        <span style={{ color: "var(--mm-muted)" }}>{message}</span>
      </div>
    )
  }
  if (capture.state === "error") {
    return (
      <div style={{ ...row, justifyContent: "space-between" }} role="alert">
        <span style={{ color: "var(--mm-bad)" }}>Couldn&rsquo;t save that update</span>
        <button type="button" disabled={capture.pending} onClick={capture.retry} style={link}>{capture.pending ? "Saving…" : "Retry"}</button>
      </div>
    )
  }
  return null
}

const link: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "var(--mm-accent)",
  fontSize: 12.5, fontWeight: 650, cursor: "pointer", fontFamily: "inherit",
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
