/**
 * Domain code → human label. `score.domain_scores` is keyed by these short codes
 * (SD, DE, …); every surface that renders a domain name reads this ONE map so the
 * vocabulary never drifts (conceptual-integrity: single source for domain names).
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
