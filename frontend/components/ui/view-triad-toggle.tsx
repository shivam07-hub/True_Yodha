"use client"

import { useEffect, useState } from "react"
import {
  TRIAD,
  TRIAD_DEFAULTS,
  TRIAD_ORDER,
  triadStorageKey,
  type TriadPage,
  type TriadView,
} from "@/lib/views/triad"

interface ToggleProps {
  page: TriadPage
  value: TriadView
  onChange: (next: TriadView) => void
  /** Hide text labels — leaves only glyphs. */
  compact?: boolean
  ariaLabel?: string
}

/**
 * Single segmented control rendering the Intel / Map / Audit triad.
 * Re-used wherever a page exposes the triad.
 *
 * Sticky pref lives in localStorage at `tm.view.{page}`. Pages should
 * read it once on mount via useTriadView() and pass the value/setter
 * back in.
 */
export function ViewTriadToggle({ page, value, onChange, compact = false, ariaLabel }: ToggleProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${page} view`}
      className="tm-view-triad"
      style={{
        display: "inline-flex",
        background: "var(--tm-surface-2)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {TRIAD_ORDER.map((v) => {
        const semantics = TRIAD[v]
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={`${semantics.label} — ${semantics.meaning}`}
            title={`${semantics.label} — ${semantics.meaning}`}
            onClick={() => onChange(v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: compact ? "5px 9px" : "5px 12px",
              borderRadius: 999,
              border: "none",
              background: active ? "var(--tm-int-bg-wash)" : "transparent",
              color: active ? "var(--tm-interactive)" : "var(--tm-text-faint)",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              cursor: "pointer",
              transition: "background 120ms var(--tm-ease), color 120ms var(--tm-ease)",
            }}
          >
            <span aria-hidden style={{ fontSize: 11 }}>{semantics.glyph}</span>
            {!compact && <span>{semantics.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Hook: sticky triad view preference, persisted to localStorage per page.
 * Returns [view, setView] tuple. Hydrates from storage on mount; first
 * render uses TRIAD_DEFAULTS[page] so SSR stays deterministic.
 */
export function useTriadView(page: TriadPage): [TriadView, (next: TriadView) => void] {
  const [view, setView] = useState<TriadView>(TRIAD_DEFAULTS[page])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(triadStorageKey(page))
    if (stored === "intel" || stored === "map" || stored === "audit") {
      setView(stored)
    }
  }, [page])

  const set = (next: TriadView) => {
    setView(next)
    if (typeof window !== "undefined") {
      try { localStorage.setItem(triadStorageKey(page), next) } catch { /* quota */ }
    }
  }

  return [view, set]
}
