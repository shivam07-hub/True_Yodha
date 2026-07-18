/**
 * Apply Transport — the single resolver for "where does applying to this job
 * send the user?". Every apply-out (web drawers, multi-role card, CV playground,
 * CV export, mobile Jobs/Collections) reads its destination from here, so the
 * scraped-URL → careers-search fallback lives in exactly one place.
 *
 * Pairs with `useApplyCapture` (the transport + liveness capture hook). This
 * module is pure — no React, no DOM — so the resolution rule is Node-testable.
 */

export type ApplyKind = "direct" | "discovery" | "none"
export type ApplyDestinationType = "direct_role" | "career_search"

export interface ApplyTarget {
  /** Where to send the user, or null when we have neither a link nor a company. */
  url: string | null
  /** direct = an exact role URL; discovery = official-opening search; none = nothing. */
  kind: ApplyKind
  company: string | null
  /** Discovery is deliberately never labelled Apply. */
  actionLabel: "Apply" | "Find official opening" | null
  destinationType: ApplyDestinationType | null
}

/** The careers-search primitive — Google "{company} careers". Shared by the
 *  resolver and the Web Share sheet (job-share). Null when company is unknown. */
export function careersSearchUrl(company: string | null | undefined): string | null {
  const c = company?.trim()
  return c ? `https://www.google.com/search?q=${encodeURIComponent(`${c} careers`)}` : null
}

/**
 * Resolve the apply destination: prefer the scraped portal link, fall back to a
 * "{company} careers" search (lands on the right page ~95% of the time and needs
 * zero backfill), else nothing. Defensible posture per ApplyRow — we surface a
 * search, not a hosted scraped URL, when no portal link exists.
 */
export function resolveApplyTarget(job: {
  source_url?: string | null
  company?: string | null
  listing_confidence?: "active" | "uncertain" | "likely_closed" | "closed" | null
}): ApplyTarget {
  const company = job.company?.trim() || null
  const knownUnhealthy = job.listing_confidence != null && job.listing_confidence !== "active"
  const portal = knownUnhealthy ? null : job.source_url?.trim()
  if (portal) {
    return {
      url: portal,
      kind: "direct",
      company,
      actionLabel: "Apply",
      destinationType: "direct_role",
    }
  }
  const careers = careersSearchUrl(company)
  if (careers) {
    return {
      url: careers,
      kind: "discovery",
      company,
      actionLabel: "Find official opening",
      destinationType: "career_search",
    }
  }
  return { url: null, kind: "none", company, actionLabel: null, destinationType: null }
}
