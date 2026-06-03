"use client"

/**
 * ThemeControl — the canonical surface (light/dark) switcher.
 *
 * One primitive, three homes: the account dropdown (web + mobile drawer) and
 * Settings → Appearance. Rendering the same control everywhere is the
 * conceptual-integrity play — there is a single place that knows how a user
 * changes theme, so the three surfaces can never drift.
 *
 * Owns the `useSurface()` wiring and proper `radiogroup` semantics. Visually
 * it rides `.tm-segment-toggle`, so idle segments inherit the interactive-rest
 * brightness contract (a clickable control is never dull at rest) for free —
 * see CONTEXT.md §Interactive-rest.
 */

import { useSurface, type SurfacePref } from "@/lib/hooks/use-surface"

const OPTIONS: { value: SurfacePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

type Props = {
  /** Static caption rendered above the control (dropdown / drawer contexts). */
  label?: string
  /** Stretch the pill to fill its row. Off = auto width (Settings row). */
  fluid?: boolean
  className?: string
}

export function ThemeControl({ label, fluid = false, className }: Props) {
  const { pref, setPref } = useSurface()

  return (
    <div className={className}>
      {label && <div className="tm-theme-control-label">{label}</div>}
      <div
        role="radiogroup"
        aria-label="Theme"
        className={`tm-segment-toggle tm-theme-control${fluid ? " tm-theme-control--fluid" : ""}`}
      >
        {OPTIONS.map((o) => {
          const active = pref === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPref(o.value)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
