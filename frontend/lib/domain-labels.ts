/**
 * The real domain vocabulary, and one dead one it replaced.
 *
 * `score.domain_scores` is keyed by Tax-L1 taxonomy names (e.g. "Science and
 * Research", "Business") — see backend `skill.l1_domain` — the same names the
 * radar, the taxonomy skeleton, and the skill room's classification spine all
 * use. Because the key already IS the display name, `domainLabel()` below is a
 * harmless passthrough on real data: it exists only for the historical short
 * codes it was written against and never hits its table for a real domain.
 *
 * `ALL_SCORE_DOMAINS` is the actual universe — every domain the scoring engine
 * can produce a value for, real or not-yet-evidenced. Anything that needs to
 * ask "which domains has this user NOT proven" must diff against this list,
 * not `DOMAIN_LABELS` (see below).
 */
export const ALL_SCORE_DOMAINS: readonly string[] = [
  "Administration",
  "Agriculture, Horticulture, and Landscaping",
  "Analysis",
  "Architecture and Construction",
  "Business",
  "Customer and Client Support",
  "Design",
  "Economics, Policy, and Social Studies",
  "Education and Training",
  "Energy and Utilities",
  "Engineering",
  "Environment",
  "Finance",
  "Health Care",
  "Hospitality and Food Services",
  "Human Resources",
  "Information Technology",
  "Law, Regulation, and Compliance",
  "Maintenance, Repair, and Facility Services",
  "Manufacturing and Production",
  "Marketing and Public Relations",
  "Media and Communications",
  "Performing Arts, Sports, and Recreation",
  "Personal Care and Services",
  "Physical and Inherent Abilities",
  "Property and Real Estate",
  "Public Safety and National Security",
  "Sales",
  "Science and Research",
  "Social and Human Services",
  "Transportation, Supply Chain, and Logistics",
]

/**
 * DEAD for scoring purposes — pre-dates the Tax-L1 keying above and never
 * migrated. Its 10 short codes (SD/DE/AML/…) do not exist anywhere in real
 * `domain_scores` data, so `domainLabel()` on real input always falls through
 * to returning the key unchanged. Kept only because a few callers still route
 * real domain names through `domainLabel()` as an inert no-op; DO NOT iterate
 * this map's keys as "the domains" — that was the exact bug in
 * `score-breakdown.ts`'s `emptyDomains` (a fictional 10-domain universe with
 * near-zero overlap with the real 31). Use `ALL_SCORE_DOMAINS` for that.
 */
export const DOMAIN_LABELS: Record<string, string> = {
  SD: "Software Dev",
  DE: "Data Engineering",
  AML: "AI / ML",
  CLD: "Cloud",
  SEC: "Security",
  PMG: "Product Mgmt",
  BIZ: "Business",
  COM: "Communication",
  LDR: "Leadership",
  OPS: "Operations",
}

/** Display name for a domain code, falling back to the raw code if unknown. */
export function domainLabel(key: string): string {
  return DOMAIN_LABELS[key] ?? key
}
