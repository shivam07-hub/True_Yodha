import React from "react"

interface CareerCard {
  badge: string
  text: string
}

interface CareerCardsProps {
  cards: CareerCard[]
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} style={{ color: "var(--tm-text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>
      : part
  )
}

export function CareerCards({ cards }: CareerCardsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "20px 0 40px" }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius)",
          padding: "20px 24px",
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-border)",
            color: "var(--tm-text-muted)",
            padding: "4px 10px",
            borderRadius: "var(--tm-radius-pill)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginTop: 2,
          }}>
            {card.badge}
          </span>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
            {parseBold(card.text)}
          </div>
        </div>
      ))}
    </div>
  )
}
