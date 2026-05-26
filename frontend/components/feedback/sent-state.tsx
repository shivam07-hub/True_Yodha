"use client"

import { CATEGORIES, type FeedbackCategory } from "./feedback-types"

export function SentState({
  category,
  onClose,
  onNew,
}: {
  category: FeedbackCategory
  onClose: () => void
  onNew: () => void
}) {
  const c = CATEGORIES[category]
  return (
    <div
      className="fade-up"
      style={{
        padding: "60px 40px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: `2px solid ${c.color}`,
          background: c.wash,
          display: "grid",
          placeItems: "center",
          color: c.color,
          filter: `drop-shadow(0 0 16px ${c.color}66)`,
          animation: "glow-pulse 2.4s ease-in-out infinite",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, color: "var(--tm-text)" }}>Signal received.</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--tm-text-muted)" }}>
          A human reads every dispatch. {c.triageHint}.
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--tm-radius-sm)",
            background: "transparent",
            border: "1px solid var(--tm-border)",
            color: "var(--tm-text-muted)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Send another
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "9px 18px",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            border: "none",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Back to mission ↗
        </button>
      </div>
    </div>
  )
}
