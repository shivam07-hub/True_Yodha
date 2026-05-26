interface StatCard {
  value: string
  label: string
  accent?: boolean
}

interface StatCardsProps {
  cards: StatCard[]
}

export function StatCards({ cards }: StatCardsProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 12,
      margin: "28px 0 40px",
    }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius)",
          padding: 20,
        }}>
          <div
            className="tabular-nums"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: card.accent ? "var(--tm-interactive)" : "var(--tm-text)",
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {card.value}
          </div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.4 }}>
            {card.label}
          </div>
        </div>
      ))}
    </div>
  )
}
