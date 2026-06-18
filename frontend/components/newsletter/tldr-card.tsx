interface TldrItem {
  text: string
}

interface TldrCardProps {
  items: TldrItem[]
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

export function TldrCard({ items }: TldrCardProps) {
  return (
    <div className="nl-fig nl-callout">
      <div className="nl-eyebrow nl-eyebrow--accent">TL;DR</div>
      <ul className="nl-points">
        {items.map((item, i) => (
          <li key={i}>
            <span aria-hidden="true" className="nl-dot" />
            <span>{parseBold(item.text)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
