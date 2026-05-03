import React from "react"

export interface ColDef {
  label: string
  right?: boolean
}

export interface CellDef {
  val: string | number
  muted?: boolean
  heat?: number
}

export type CellVal = string | number | CellDef

export interface RowDef {
  cells: CellVal[]
  variant?: "bold" | "muted"
}

interface DataTableProps {
  cols: ColDef[]
  rows: RowDef[]
}

function isCell(v: CellVal): v is CellDef {
  return typeof v === "object" && v !== null && "val" in v
}

function HeatCell({ val, heat }: { val: string | number; heat: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
      <div style={{ width: 72, height: 4, background: "var(--tm-border-soft)", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
        <div style={{
          height: "100%", borderRadius: 999,
          background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-hover))",
          width: `${heat}%`,
        }} />
      </div>
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 13, color: heat === 0 ? "var(--tm-text-faint)" : "var(--tm-text)", width: 28, textAlign: "right" }}>
        {val}
      </span>
    </div>
  )
}

export function DataTable({ cols, rows }: DataTableProps) {
  return (
    <div style={{
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)",
      overflow: "hidden",
      margin: "24px 0 40px",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--tm-surface-2)" }}>
            {cols.map((col, i) => (
              <th
                key={i}
                style={{
                  padding: "11px 16px",
                  textAlign: col.right ? "right" : "left",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "var(--tm-text-faint)",
                  borderBottom: "1px solid var(--tm-border-soft)",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isLast = ri === rows.length - 1
            const isBold = row.variant === "bold"
            const isMuted = row.variant === "muted"
            return (
              <tr
                key={ri}
                style={{ transition: "background var(--tm-dur-fast) var(--tm-ease)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-hover-soft)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                {row.cells.map((cell, ci) => {
                  const raw = isCell(cell) ? cell : { val: cell, muted: false, heat: undefined }
                  const hasHeat = raw.heat !== undefined
                  const isLastCol = ci === cols.length - 1
                  const isFirstCol = ci === 0

                  let cellColor = "var(--tm-text-muted)"
                  if (isMuted) cellColor = "var(--tm-text-faint)"
                  if (isBold && isFirstCol) cellColor = "var(--tm-accent)"
                  if (isBold && !isFirstCol) cellColor = "var(--tm-text)"
                  if (raw.muted) cellColor = "var(--tm-text-faint)"

                  return (
                    <td
                      key={ci}
                      style={{
                        padding: "12px 16px",
                        borderBottom: isLast ? "none" : "1px solid var(--tm-border-soft)",
                        color: hasHeat ? undefined : cellColor,
                        fontFamily: (!hasHeat && isLastCol && cols[ci]?.right) ? "var(--tm-font-mono)" : undefined,
                        fontSize: (!hasHeat && isLastCol && cols[ci]?.right) ? 13 : 14,
                        textAlign: cols[ci]?.right ? "right" : "left",
                        fontWeight: (isBold && isFirstCol) ? 500 : undefined,
                      }}
                    >
                      {hasHeat
                        ? <HeatCell val={raw.val} heat={raw.heat!} />
                        : String(raw.val)
                      }
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
