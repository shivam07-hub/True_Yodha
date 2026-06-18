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
    <div className="nl-heat">
      <div className="nl-bar-track">
        <div className="nl-bar-fill" style={{ width: `${heat}%` }} />
      </div>
      <span className="nl-num" data-zero={heat === 0}>{val}</span>
    </div>
  )
}

export function DataTable({ cols, rows }: DataTableProps) {
  return (
    <div className="nl-fig nl-data">
      <table className="nl-table">
        <thead>
          <tr>
            {cols.map((col, i) => (
              <th key={i} className={col.right ? "nl-right" : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isBold = row.variant === "bold"
            const isMuted = row.variant === "muted"
            return (
              <tr key={ri}>
                {row.cells.map((cell, ci) => {
                  const raw = isCell(cell) ? cell : { val: cell, muted: false, heat: undefined }
                  const hasHeat = raw.heat !== undefined
                  const isFirstCol = ci === 0
                  const right = cols[ci]?.right

                  // Cell emphasis → semantic class (logic frozen, styling themed).
                  const cls = [right ? "nl-right" : ""]
                  if (!hasHeat) {
                    if (isMuted || raw.muted) cls.push("nl-td-muted")
                    else if (isBold && isFirstCol) cls.push("nl-td-lead")
                    else if (isBold) cls.push("nl-td-bold")
                  }

                  return (
                    <td key={ci} className={cls.join(" ").trim() || undefined}>
                      {hasHeat ? <HeatCell val={raw.val} heat={raw.heat!} /> : String(raw.val)}
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
