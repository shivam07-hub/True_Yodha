"use client"

import type { JobOverlapRow } from "@/lib/api"

export interface JobOverlapRowsProps {
  rows: JobOverlapRow[]
}

function pct(v: number | null | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—"
  return `${Math.round(v)}%`
}

/**
 * Logged-in-only co-tracking surface. Hides silently when no overlap.
 * Max 3 rows; sort + cap happen server-side.
 */
export function JobOverlapRows({ rows }: JobOverlapRowsProps) {
  if (!rows.length) return null
  return (
    <section
      aria-label="Jobs you're both tracking"
      style={{
        marginTop: 32,
        padding: "16px 18px",
        border: "1px solid var(--tm-border)",
        borderRadius: 12,
        background: "var(--tm-surface-2)",
      }}
    >
      <h3
        style={{
          margin: 0,
          marginBottom: 12,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--tm-text-faint)",
        }}
      >
        Jobs you&apos;re both tracking
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <li
            key={row.job_id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 16,
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid var(--tm-border-soft)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--tm-text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.role ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                {row.company_name ?? ""}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tm-accent)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 56,
                textAlign: "right",
              }}
              title="Your match %"
            >
              you {pct(row.viewer_match_pct)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tm-text-faint)",
                fontVariantNumeric: "tabular-nums",
                minWidth: 56,
                textAlign: "right",
              }}
              title="Owner's match %"
            >
              them {pct(row.owner_match_pct)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
