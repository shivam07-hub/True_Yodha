/**
 * "More roles like this one" — one definition of the scope, and one URL.
 *
 * Similarity is the corpus `role_domain`, not the role_family and not the job
 * title. Family labels are unreliable in the corpus (a "Data Analyst" carries
 * role_family "Business Intelligence Software"), and a title match is a string
 * comparison over wildly inconsistent strings. role_domain is machine-stable and
 * broad enough that the destination is never an empty board, which matters more
 * than precision when the whole point is to keep the user moving.
 *
 * `/market` reads the domain as its long-standing `cluster` param, which it maps
 * straight onto the feed's `role_domain` filter — so this reuses the filter that
 * already exists rather than adding a second name for it.
 */
export function similarRolesHref(roleDomain: string | null | undefined): string {
  const domain = roleDomain?.trim()
  return domain ? `/market?cluster=${encodeURIComponent(domain)}` : "/market"
}
