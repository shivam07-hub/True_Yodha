"use client"

import * as React from "react"

/**
 * The single affordance that turns any company name into a portal to its page.
 *
 * Product principle (grill-locked 2026-06-21): a company name is ALWAYS a link
 * to `/companies/{name}` — the page listing every job at that company. Defined
 * once here so the destination, the new-tab behaviour, the accent link-signal,
 * and the card-click guard can never drift between the ~10 render sites.
 *
 * - Opens in a NEW TAB (target=_blank) so the feed/scroll position is never lost
 *   — resolves the dashboard's no-navigation (D5) tension.
 * - stopPropagation by default: on a card the wrapping click opens the job
 *   detail panel; the company name must escape that and go to the company page.
 * - Keeps whatever class the call site already used (size/weight) and adds
 *   `tm-company-link` for the cursor + hover-underline link signal. The accent
 *   colour now MEANS "clickable company", so it stays (no longer over-ration).
 */
export function companyHref(name: string): string {
  return `/companies/${encodeURIComponent(name)}`
}

export function CompanyLink({
  company,
  className,
  children,
  stopPropagation = true,
}: {
  company: string | null | undefined
  className?: string
  /** Defaults to the company name. Pass children to wrap a richer cluster (e.g. monogram + name). */
  children?: React.ReactNode
  stopPropagation?: boolean
}) {
  // No company → render the fallback text inert (never a dead link).
  if (!company) return <>{children ?? "—"}</>
  return (
    <a
      href={companyHref(company)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `tm-company-link ${className}` : "tm-company-link"}
      title={`See all jobs at ${company}`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
      }}
    >
      {children ?? company}
    </a>
  )
}
