import type { FeedbackStatus } from "@/lib/api"
import { STATUS_META } from "./feedback-types"

export function StatusPill({ status }: { status: FeedbackStatus }) {
  const s = STATUS_META[status]
  const animate = status === "in_progress"
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: s.color,
        background: "transparent",
        border: `1px solid ${s.color}66`,
        fontFamily: "var(--tm-font-mono)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: s.dot,
          boxShadow: animate ? `0 0 6px ${s.dot}` : "none",
          animation: animate ? "pulse-dot 1.6s ease-in-out infinite" : "none",
        }}
      />
      {s.label}
    </span>
  )
}
