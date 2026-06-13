"use client"

import * as React from "react"
import { ChevronDown, ArrowDownUp, Check } from "lucide-react"
import { SORTS, type SortKey } from "@/lib/dashboard/feed-model"

/**
 * Feed sort control — orthogonal to the source-segment tabs (LinkedIn Jobs
 * pattern: segment = which pile, sort = order within pile). One component, two
 * geometries: a labelled dropdown on desktop, an icon button that opens a
 * bottom sheet on mobile. State + options are shared; only the chrome differs.
 */
export function SortMenu({
  sort,
  onChange,
  mobile,
}: {
  sort: SortKey
  onChange: (s: SortKey) => void
  mobile?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const current = SORTS.find((s) => s.key === sort) ?? SORTS[0]

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const pick = (k: SortKey) => {
    onChange(k)
    setOpen(false)
  }

  return (
    <div className="db-sort" ref={rootRef}>
      <button
        type="button"
        className="db-sort-trigger tm-control-focus"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        {mobile ? (
          <ArrowDownUp size={15} aria-hidden />
        ) : (
          <>
            <span className="db-sort-lead">Sort</span>
            <span className="db-sort-val">{current.label}</span>
            <ChevronDown size={14} aria-hidden />
          </>
        )}
      </button>

      {open ? (
        <>
          {mobile ? <div className="db-sort-scrim" aria-hidden onClick={() => setOpen(false)} /> : null}
          <div className={`db-sort-menu${mobile ? " sheet" : ""}`} role="menu">
            {mobile ? <div className="db-sort-sheet-title">Sort by</div> : null}
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="menuitemradio"
                aria-checked={s.key === sort}
                className={`db-sort-opt${s.key === sort ? " active" : ""}`}
                onClick={() => pick(s.key)}
              >
                <span>{s.label}</span>
                {s.key === sort ? <Check size={15} aria-hidden /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
