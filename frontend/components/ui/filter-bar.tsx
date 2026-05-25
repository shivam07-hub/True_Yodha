"use client"

import type { ReactNode } from "react"

export interface FilterOption<T extends string = string> {
  id: T
  icon: ReactNode
  label: string
}

export interface FilterGroup<T extends string = string> {
  key: string
  value: T
  options: FilterOption<T>[]
  onChange: (next: T) => void
  ariaLabel?: string
}

export interface FilterToggle {
  key: string
  icon: ReactNode
  label: string
  value: boolean
  onChange: (next: boolean) => void
}

interface Props {
  groups?: FilterGroup[]
  toggles?: FilterToggle[]
  trailing?: ReactNode
}

/**
 * Compact icon-only filter row. Reused across Top Movers, Skills sort,
 * Tracker filters, etc.
 *
 * Layout: [group1 icons] | [group2 icons] | [toggle icons] [trailing slot]
 *
 * Each group renders as a connected segmented control. Active option =
 * accent wash + accent text. Toggles render as standalone pill buttons.
 *
 * The trailing slot is for inline controls that aren't filters — e.g.
 * a search input or result count.
 */
export function FilterBar({ groups = [], toggles = [], trailing }: Props) {
  return (
    <div className="tm-filter-bar" style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    }}>
      {groups.map((g, gi) => (
        <span key={g.key} role="group" aria-label={g.ariaLabel ?? g.key} style={{
          display: "inline-flex",
          background: "var(--tm-surface-2)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-pill)",
          padding: 2,
          gap: 2,
        }}>
          {g.options.map(opt => {
            const active = g.value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                aria-label={opt.label}
                title={opt.label}
                onClick={() => g.onChange(opt.id)}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 26, borderRadius: 999,
                  border: "none",
                  background: active ? "var(--tm-int-bg-wash)" : "transparent",
                  color: active ? "var(--tm-interactive)" : "var(--tm-text-faint)",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background 120ms var(--tm-ease), color 120ms var(--tm-ease)",
                }}
              >
                {opt.icon}
              </button>
            )
          })}
          {/* invisible spacer to keep group spacing predictable */}
          {gi < groups.length - 1 && null}
        </span>
      ))}

      {toggles.map(t => (
        <button
          key={t.key}
          type="button"
          aria-pressed={t.value}
          aria-label={t.label}
          title={t.label}
          onClick={() => t.onChange(!t.value)}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 30, borderRadius: 999,
            background: t.value ? "var(--tm-int-bg-wash)" : "var(--tm-surface-2)",
            border: `1px solid ${t.value ? "var(--tm-int-border)" : "var(--tm-border-soft)"}`,
            color: t.value ? "var(--tm-interactive)" : "var(--tm-text-faint)",
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 120ms var(--tm-ease), color 120ms var(--tm-ease), border-color 120ms var(--tm-ease)",
          }}
        >
          {t.icon}
        </button>
      ))}

      {trailing && (
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {trailing}
        </span>
      )}
    </div>
  )
}
