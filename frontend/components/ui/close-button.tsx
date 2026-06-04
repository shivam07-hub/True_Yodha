"use client"

import { useState } from "react"

interface CloseButtonProps {
  onClick: () => void
  /** Icon edge length in px. Hit area is size + 12. */
  size?: number
  ariaLabel?: string
  className?: string
}

/**
 * Universal close (X). Neutral (muted) at rest, red on hover/focus — the
 * app-wide dismissal convention. Self-contained (inline SVG + state-driven
 * color) so it drops into any surface without a CSS dependency.
 *
 * Rest is neutral rather than always-red on purpose: a solid-red control at
 * rest reads as "delete". Red on intent (hover/focus) signals dismissal
 * without implying destruction.
 */
export function CloseButton({ onClick, size = 16, ariaLabel = "Close", className }: CloseButtonProps) {
  const [hot, setHot] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={className}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size + 12,
        height: size + 12,
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        color: hot ? "var(--tm-danger, #ef4444)" : "var(--tm-text-muted, #9ca3af)",
        background: hot ? "var(--tm-danger-wash, rgba(239,68,68,0.10))" : "transparent",
        transition: "color 120ms ease, background 120ms ease",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
