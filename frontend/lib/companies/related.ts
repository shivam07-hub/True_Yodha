/**
 * pickRelatedCompanies — the single source of how Myro suggests other companies.
 *
 * Consumed by both the public company page (RelatedCompanies server block) and
 * the in-app CompanyDrawer, so the recommendation story is identical whether or
 * not the user is logged in.
 *
 * Rule:
 *   1. Same-industry peers first, ranked by open-role count desc — the most
 *      useful onward links AND the strongest internal-link hubs for SEO.
 *   2. A fixed alphabetical-ring BACKBONE (the next N companies after `current`
 *      in name order, wrapping) is always included. This guarantees every
 *      company emits ≥BACKBONE ring links, so every company RECEIVES ≥BACKBONE
 *      inbound links — no crawl-orphan, regardless of industry data (11/268
 *      companies have none). Without the backbone, industry-first alone could
 *      strand a lone-industry or industry-less company with zero inbound links.
 *
 * Pure and deterministic: the interface is the test surface (see related.test.ts).
 */

export interface CompanyRef {
  name: string
  count: number
  industry?: string | null
}

const DEFAULT_LIMIT = 24
const BACKBONE = 6

export function pickRelatedCompanies(
  all: CompanyRef[],
  current: string,
  limit: number = DEFAULT_LIMIT,
): CompanyRef[] {
  const others = all.filter((c) => c.name && c.name !== current)
  if (others.length === 0) return []

  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name))
  const currentRef = all.find((c) => c.name === current)
  const industry = currentRef?.industry ?? null

  // 1. Same-industry peers, most-hiring first.
  const sameIndustry = industry
    ? others
        .filter((c) => c.industry === industry)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    : []

  // 2. Alphabetical-ring backbone starting just after `current`.
  const fullSorted = [...all]
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
  const idx = fullSorted.findIndex((c) => c.name === current)
  const start = idx === -1 ? 0 : idx + 1
  const ring: CompanyRef[] = []
  for (let i = 0; i < fullSorted.length && ring.length < BACKBONE; i++) {
    const c = fullSorted[(start + i) % fullSorted.length]
    if (c.name !== current) ring.push(c)
  }

  // Compose: industry head fills up to (limit - BACKBONE), backbone guaranteed,
  // then top up from the sorted remainder if slots remain (industry-less case).
  const seen = new Set<string>()
  const result: CompanyRef[] = []
  const push = (c: CompanyRef) => {
    if (c.name === current || seen.has(c.name)) return
    seen.add(c.name)
    result.push(c)
  }

  for (const c of sameIndustry) {
    if (result.length >= limit - BACKBONE) break
    push(c)
  }
  for (const c of ring) push(c)
  for (const c of sorted) {
    if (result.length >= limit) break
    push(c)
  }

  return result.slice(0, limit)
}
