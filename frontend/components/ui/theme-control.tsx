"use client"

/**
 * ThemeControl — the canonical surface (light/dark) switcher.
 *
 * One primitive, three homes: the account dropdown (web + mobile drawer) and
 * Settings → Appearance. Rendering the same control everywhere is the
 * conceptual-integrity play — there is a single place that knows how a user
 * changes theme, so the three surfaces can never drift.
 *
 * Icon-only by design: a sun / moon / auto glyph carries the whole meaning, so
 * the control reads at a glance with zero label chrome. Accessible names live
 * on each `role="radio"` button (`aria-label`) — the words are present for
 * assistive tech, absent from the pixels. Rides `.tm-segment-toggle`, so idle
 * segments inherit the interactive-rest brightness contract for free — see
 * CONTEXT.md §Interactive-rest.
 */

import { useSurface, type SurfacePref } from "@/lib/hooks/use-surface"

type Option = { value: SurfacePref; label: string; icon: JSX.Element }

const OPTIONS: Option[] = [
  {
    value: "system",
    label: "System",
    icon: (
      // Monitor → "auto / follow the OS".
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M9 20h6M12 16v4" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      // Sun.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      // Crescent moon.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
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
        className={`tm-segment-toggle tm-theme-control tm-theme-control--icon${fluid ? " tm-theme-control--fluid" : ""}`}
      >
        {OPTIONS.map((o) => {
          const active = pref === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.label}
              title={o.label}
              onClick={() => setPref(o.value)}
            >
              {o.icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}
