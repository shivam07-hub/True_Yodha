interface LocationRow {
  name: string
  count: number
}

interface LocationChartProps {
  rows: LocationRow[]
}

export function LocationChart({ rows }: LocationChartProps) {
  const max = Math.max(...rows.map((r) => r.count), 1)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "20px 0 40px" }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, color: "var(--tm-text)", width: 200, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
          </div>
          <div style={{ flex: 1, height: 6, background: "var(--tm-border-soft)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999,
              background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-hover))",
              width: `${(row.count / max) * 100}%`,
              opacity: 0.7,
            }} />
          </div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: "var(--tm-text-muted)", width: 28, textAlign: "right", flexShrink: 0 }}>
            {row.count}
          </div>
        </div>
      ))}
    </div>
  )
}
