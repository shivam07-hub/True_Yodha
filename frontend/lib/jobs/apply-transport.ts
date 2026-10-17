/**
 * Apply Transport — the single resolver for "where does applying to this job
 * send the user?". Every apply-out (web drawers, multi-role card, CV playground,
 * CV export, mobile Jobs/Collections) reads its destination from here.
 *
 * Three venues, four kinds:
 *   hosted  — posted on Myro; Apply here, in-app, no leave-site prompt
 *   direct  — company career-page URL; Apply, then "Did you apply?"
 *   discovery — no exact URL; Find official opening
 *   none
 */

export type ApplyKind = "direct" | "discovery" | "hosted" | "none"
export type ApplyDestinationType = "direct_role" | "career_search" | "hosted_role"
export type ListingVenue = "career_page" | "myro"

export interface ApplyTarget {
  /** Where to send the user, or null when we have neither a link, a company, nor a hosted apply page. */
  url: string | null
  kind: ApplyKind
  company: string | null
  actionLabel: "Apply" | "Apply here" | "Find official opening" | null
  destinationType: ApplyDestinationType | null
}

export function hostedApplyPath(jobId: string): string {
  return `/internships/${encodeURIComponent(jobId)}/apply`
}

/** Careers-search primitive — Google "{company} careers". Null when company is unknown. */
export function careersSearchUrl(company: string | null | undefined): string | null {
  const c = company?.trim()
  return c ? `https://www.google.com/search?q=${encodeURIComponent(`${c} careers`)}` : null
}

/** Hosted apply stays on Myro. Portal apply leaves in a new tab. */
export function applyLinkAttrs(target: ApplyTarget): {
  href: string | undefined
  target?: "_blank"
  rel?: string
} {
  if (!target.url) return { href: undefined }
  if (target.kind === "hosted") return { href: target.url }
  return { href: target.url, target: "_blank", rel: "noopener noreferrer" }
}

export function resolveApplyTarget(job: {
  job_id?: string | null
  source_url?: string | null
  company?: string | null
  listing_venue?: ListingVenue | string | null
  listing_confidence?: "active" | "uncertain" | "likely_closed" | "closed" | null
}): ApplyTarget {
  const company = job.company?.trim() || null
  if (job.listing_venue === "myro") {
    const id = job.job_id?.trim()
    if (!id) {
      return { url: null, kind: "none", company, actionLabel: null, destinationType: null }
    }
    return {
      url: hostedApplyPath(id),
      kind: "hosted",
      company,
      actionLabel: "Apply here",
      destinationType: "hosted_role",
    }
  }
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
