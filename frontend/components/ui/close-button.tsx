"use client"

import { Button } from "@/components/ui/button"

interface CloseButtonProps {
  onClick: () => void
  /** Icon edge length in px. The accessible hit area remains 32px. */
  size?: number
  ariaLabel?: string
  className?: string
}

/**
 * Universal close (X). Closing a surface is navigation, not rejection, so it
 * uses the neutral utility treatment. Content rejection uses `dismiss`; an
 * irreversible operation uses `danger`.
 */
export function CloseButton({ onClick, size = 16, ariaLabel = "Close", className }: CloseButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={className}
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
    </Button>
  )
}
