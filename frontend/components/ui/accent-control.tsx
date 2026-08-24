"use client"

/**
 * AccentControl — the Signal/Bone accent switcher (backlog ND15).
 *
 * Mirrors ThemeControl's shape exactly: one primitive, rides the same
 * `.tm-segment-toggle` chrome so idle segments inherit the interactive-rest
 * brightness contract for free. Icon-only — a signal-dot / ember-flame glyph
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
    // Stored value stays "forge". It is the persisted `accent_pref` /
    // `data-accent` identifier, not copy, and it has now outlived two renames:
    // "Forge" until 2026-08-06 (when Forge-the-surface became Practice and an
    // accent sharing that name read as a link to it), then "Ember" until
    // 2026-08-23. Changing the key would strand every existing preference row.
    value: "forge",
    label: "Bone",
    icon: (
      // Half-filled circle — the standard monochrome glyph. Bone has no hue:
      // it is an inverted ivory fill, so status colours are the only colour
      // left on the screen. A flame would promise a warmth that is gone.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
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
