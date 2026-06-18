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
    <div className="nl-fig" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row, i) => (
        <div key={i} className="nl-bar">
          <div className="nl-bar-name" style={{ width: 200, fontSize: 14 }}>{row.name}</div>
          <div className="nl-bar-track">
            <div className="nl-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <div className="nl-num" style={{ width: 28, fontSize: 13 }}>{row.count}</div>
        </div>
      ))}
    </div>
  )
}
