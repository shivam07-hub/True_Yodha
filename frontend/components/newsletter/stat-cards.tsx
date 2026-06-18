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
    <div className="nl-fig nl-stats">
      {cards.map((card, i) => (
        <div key={i} className="nl-stat">
          <div className={card.accent ? "nl-stat-num nl-accent" : "nl-stat-num"}>
            {card.value}
          </div>
          <div className="nl-stat-lbl">{card.label}</div>
        </div>
      ))}
    </div>
  )
}
