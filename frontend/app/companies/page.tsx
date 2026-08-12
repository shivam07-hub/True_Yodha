import type { Metadata } from "next"
import { Suspense } from "react"
import { jobs, type CompanyPulseItem } from "@/lib/api"
import {
  CompaniesDirectory,
  CompaniesDirectoryLoading,
} from "@/components/companies/companies-directory"
import type {
  DirectoryAvailability,
  DirectoryCompany,
} from "@/lib/companies/directory-state"

/**
 * The companies directory (Signal Thread 1d) — a dual-audience surface.
 *
 * SEO/AEO: every /companies/{name} link is rendered into the initial HTML (the
 * CompaniesDirectory client component is server-rendered, links and all), so a
 * crawler that runs no JS still sees the full list. Paired with sitemap.ts.
 *
 * Product: a featured grid of the top companies by open roles carries their REAL
 * demand pulse (server-fetched from the public pulse endpoint), sortable and
 * followable. Follow stars + the compare-slots meter hydrate as authed islands.
 *
 * Public data (no auth), revalidated hourly (ISR).
 */
const BASE = "https://www.himyro.com"
const POOL_SIZE = 20 // the pulse endpoint caps at 20 companies per call

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Companies hiring now — Myro",
  description:
    "Browse every company Myro tracks and jump to their live open roles. Hundreds of companies, ranked by live hiring demand.",
  alternates: { canonical: `${BASE}/companies` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Companies hiring now — Myro",
    description: "Browse every company Myro tracks, ranked by live hiring demand.",
    type: "website",
    url: `${BASE}/companies`,
  },
}

function topSectors(companies: DirectoryCompany[], max = 5): string[] {
  const counts = new Map<string, number>()
  for (const c of companies) {
    const s = (c.industry ?? "").trim()
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([s]) => s)
}

export default function CompaniesDirectoryPage() {
  return (
    <Suspense fallback={<CompaniesDirectoryLoading />}>
      <CompaniesDirectoryData />
    </Suspense>
  )
}

async function CompaniesDirectoryData() {
  // The crawlable list = only companies with an indexable detail page (>=1 live
  // listing). Two reasons: (1) the directory's internal links must not pass
  // link-equity to /companies pages that noindex themselves — a link farm
  // pointing at thin pages drags the directory's own quality signal down;
  // (2) `count` here is the REAL live-role count, so "sort by open roles" and
  // the featured pulse grid stop ranking companies with a 3,000 all-time count
  // but zero live roles (which rendered a misleading em-dash at the top).
  // Industry is enriched from analytics (all-time is fine for a sector label).
  let companies: DirectoryCompany[] = []
  let availability: DirectoryAvailability = "ready"
  try {
    const [indexable, analytics] = await Promise.all([
      jobs.indexableCompanies(),
      jobs.analytics().catch(() => null),
    ])
    if (indexable.status === "unavailable") {
      availability = "unavailable"
    } else {
      const industryOf = new Map(
        (analytics?.by_company ?? []).map((c) => [c.name, c.industry ?? null]),
      )
      companies = indexable.companies
        .filter((c) => c.name)
        .map((c) => ({
          name: c.name,
          count: c.active_count,
          industry: industryOf.get(c.name) ?? null,
        }))
    }
  } catch {
    // A network failure is distinct from a completed empty directory. The client
    // island receives this state and retries without making the user reload.
    availability = "unavailable"
  }

  const alphabetical = [...companies].sort((a, b) => a.name.localeCompare(b.name))
  const byOpen = [...companies].sort((a, b) => b.count - a.count)

  // Featured pool = top companies by open roles; fetch their real pulse. On any
  // failure the pool empties → the directory degrades to the crawlable list
  // (no stuck cards, no fabricated numbers).
  let pool: DirectoryCompany[] = []
  let pulses: CompanyPulseItem[] = []
  const candidates = byOpen.slice(0, POOL_SIZE)
  if (candidates.length > 0) {
    try {
      const res = await jobs.companyPulse(candidates.map((c) => c.name))
      pulses = res.companies
      pool = candidates
    } catch {
      // pulse unavailable → featured grid hidden, list still renders
    }
  }

  return (
    <CompaniesDirectory
      companies={alphabetical}
      pool={pool}
      pulses={pulses}
      totalCount={companies.length}
      sectors={topSectors(companies)}
      availability={availability}
    />
  )
}
