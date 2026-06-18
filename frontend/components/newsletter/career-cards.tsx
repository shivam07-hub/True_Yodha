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
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

export function CareerCards({ cards }: CareerCardsProps) {
  return (
    <div className="nl-fig nl-data nl-rows">
      {cards.map((card, i) => (
        <div key={i} className="nl-row">
          <span className="nl-badge">{card.badge}</span>
          <div className="nl-row-body">{parseBold(card.text)}</div>
        </div>
      ))}
    </div>
  )
}
