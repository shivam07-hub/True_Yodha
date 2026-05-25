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
      ? <strong key={i} style={{ color: "var(--tm-text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>
      : part
  )
}

export function TldrCard({ items }: TldrCardProps) {
  return (
    <div style={{
      background: "var(--tm-surface)",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)",
      padding: "24px 28px",
      margin: "0 0 40px",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 16,
      }}>
        TL;DR
      </div>
      <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 15, lineHeight: 1.55, color: "var(--tm-text-muted)" }}>
            <div aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-interactive)", marginTop: 7, flexShrink: 0 }} />
            <span>{parseBold(item.text)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
