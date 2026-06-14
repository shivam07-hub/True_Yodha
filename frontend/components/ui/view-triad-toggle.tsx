"use client"

import { useEffect, useState } from "react"
import {
  TRIAD,
  TRIAD_DEFAULTS,
  TRIAD_ORDER,
  TRIAD_STICKY,
  triadLabel,
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
  /** Pulse a live dot on this view's segment (e.g. a running Practice session). */
  live?: TriadView
  /** Subset + order of views to render. Defaults to the full canonical triad.
   *  A page passes a subset when one view lives elsewhere (e.g. Skills moved its
   *  Map radar to the home rail → renders only Skills + Audit). */
  views?: TriadView[]
}

/**
 * Single segmented control rendering the canonical triad. Labels resolve
 * per-page via triadLabel() (ADR-0019) — same semantic, surface-true wording.
 * Re-used wherever a page exposes the triad.
 */
export function ViewTriadToggle({ page, value, onChange, compact = false, ariaLabel, live, views = TRIAD_ORDER }: ToggleProps) {
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
      {views.map((v) => {
        const semantics = TRIAD[v]
        const label = triadLabel(page, v)
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={`${label} — ${semantics.meaning}`}
            title={`${label} — ${semantics.meaning}`}
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
            {!compact && <span>{label}</span>}
            {live === v && (
              <span
                aria-hidden
                style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: "var(--tm-interactive)",
                  boxShadow: "0 0 7px var(--tm-int-bg-hover)",
                  animation: "tm-pv-pulse 1.6s ease-in-out infinite",
                }}
              />
            )}
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
  const sticky = TRIAD_STICKY[page]
  const [view, setView] = useState<TriadView>(TRIAD_DEFAULTS[page])

  useEffect(() => {
    if (!sticky || typeof window === "undefined") return
    const stored = localStorage.getItem(triadStorageKey(page))
    if (stored === "intel" || stored === "map" || stored === "audit") {
      setView(stored)
    }
  }, [page, sticky])

  const set = (next: TriadView) => {
    setView(next)
    if (sticky && typeof window !== "undefined") {
      try { localStorage.setItem(triadStorageKey(page), next) } catch { /* quota */ }
    }
  }

  return [view, set]
}
