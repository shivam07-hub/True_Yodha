"use client"

/**
 * AccentControl — the Signal/Forge accent switcher (backlog ND15).
 *
 * Mirrors ThemeControl's shape exactly: one primitive, rides the same
 * `.tm-segment-toggle` chrome so idle segments inherit the interactive-rest
 * brightness contract for free. Icon-only — a signal-dot / forge-flame glyph
 * carries the meaning, accessible names live in `aria-label` for assistive
 * tech. Unlike theme (client-only), the choice also persists to
 * `user_profiles.accent_pref` — the caller supplies `onPersist` so this stays
 * a pure UI primitive with zero knowledge of the mutation/token plumbing.
 */

import { useAccent, type Accent } from "@/lib/hooks/use-accent"

type Option = { value: Accent; label: string; icon: JSX.Element }

const OPTIONS: Option[] = [
  {
    value: "signal",
    label: "Signal",
    icon: (
      // Signal dot — the analytical/default accent.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
      </svg>
    ),
  },
  {
    value: "forge",
    label: "Forge",
    icon: (
      // Flame — the warmer opt-in accent.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22c-4 0-6.5-2.5-6.5-6 0-2.5 1.5-4 2.5-5.5C8.5 9 8 7 9 5c1 2 2.5 2.5 3 4 .5-1.5 0-3-1-4.5 3 1 5.5 4 5.5 7.5 0 1-.3 2-.8 3 .3-.6.5-1.2.5-2 0-1.5-1-2.5-1.5-3 .2 2-.7 3-1.7 4-.5.5-1 1.3-1 2.5 0 2 1.5 3 1.5 3S16 22 12 22Z" />
      </svg>
    ),
  },
]

type Props = {
  /** Static caption rendered above the control (dropdown / drawer contexts). */
  label?: string
  /** Called after the local pref applies, so the caller can persist it
   *  server-side (e.g. Settings' existing profile-update mutation). */
  onPersist?: (next: Accent) => void
  className?: string
}

export function AccentControl({ label, onPersist, className }: Props) {
  const { pref, setPref } = useAccent()

  function choose(next: Accent) {
    setPref(next)
    onPersist?.(next)
  }

  return (
    <div className={className}>
      {label && <div className="tm-theme-control-label">{label}</div>}
      <div
        role="radiogroup"
        aria-label="Accent"
        className="tm-segment-toggle tm-theme-control tm-theme-control--icon"
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
              onClick={() => choose(o.value)}
            >
              {o.icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}
