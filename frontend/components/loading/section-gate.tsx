"use client"

import type { ReactNode } from "react"
import { SectionError } from "@/components/errors/section-error"
import { useIsSlow } from "@/components/loading/use-is-slow"

/**
 * Section-readiness wrapper: the dashboard is a set of independent regions, each
 * painting the instant its own query resolves rather than the whole page
 * blocking on the slowest one (dashboard-loading grill Q1).
 *
 * Three states, in order:
 *  - error    → the region's `SectionError` (rest of the page stays live)
 *  - loading  → `fallback` (a real-SHAPE, co-located skeleton so content lands
 *               in place with no reflow), plus one inline, section-scoped slow
 *               line once the wait crosses the threshold — never a global
 *               floating banner, never a guessed time (grill Q5).
 *  - ready    → children
 *
 * The fallback is passed in by the page so each section owns its own loading
 * shape next to the component it mirrors (grill Q13) — there is no central
 * skeleton to drift out of sync.
 */
export function SectionGate({
  loading,
  error,
  onRetry,
  errorLabel,
  fallback,
  slowText,
  slowAfterMs = 6000,
  children,
}: {
  loading: boolean
  error?: unknown
  onRetry?: () => void
  errorLabel?: string
  fallback: ReactNode
  /** Inline reassurance shown only once the load is genuinely slow. */
  slowText?: string
  slowAfterMs?: number
  children: ReactNode
}) {
  const slow = useIsSlow(loading, slowAfterMs)

  if (error) {
    return <SectionError error={error} onRetry={onRetry} label={errorLabel} />
  }

  if (loading) {
    return (
      <>
        {fallback}
        {slowText && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--tm-text-muted)",
              fontFamily: "var(--tm-font-sans)",
              opacity: slow ? 1 : 0,
              transition: "opacity 200ms ease",
              pointerEvents: "none",
            }}
          >
            {slowText}
          </div>
        )}
      </>
    )
  }

  return <>{children}</>
}
