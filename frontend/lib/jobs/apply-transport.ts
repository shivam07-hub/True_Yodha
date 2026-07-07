/**
 * Apply Transport — the single resolver for "where does applying to this job
 * send the user?". Every apply-out (web drawers, multi-role card, CV playground,
 * CV export, mobile Jobs/Collections) reads its destination from here, so the
 * scraped-URL → careers-search fallback lives in exactly one place.
 *
 * Pairs with `useApplyCapture` (the transport + liveness capture hook). This
 * module is pure — no React, no DOM — so the resolution rule is Node-testable.
 */

export type ApplyKind = "portal" | "careers" | "none"

export interface ApplyTarget {
  /** Where to send the user, or null when we have neither a link nor a company. */
  url: string | null
  /** portal = the scraped source URL; careers = "{company} careers" search; none = nothing. */
  kind: ApplyKind
  company: string | null
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
}): ApplyTarget {
  const company = job.company?.trim() || null
  const portal = job.source_url?.trim()
  if (portal) return { url: portal, kind: "portal", company }
  const careers = careersSearchUrl(company)
  if (careers) return { url: careers, kind: "careers", company }
  return { url: null, kind: "none", company }
}
