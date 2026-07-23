import type { MetadataRoute } from "next"
import { getAllIssues } from "@/lib/newsletter"
import { jobs } from "@/lib/api"
import { sitemapStaticEntries } from "@/lib/site-routes"

const BASE = "https://www.himyro.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await getAllIssues()
  const issuePaths = issues
    .filter((i) => i.slug !== "_placeholder")
    .map((i) => ({
      url: `${BASE}/newsletter/${i.slug}`,
      lastModified: new Date(i.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }))

  // Only companies whose detail page renders real content (>=1 live listing)
  // are emitted. Gating on the all-time `by_company` count shipped ~285 URLs,
  // ~95 of them empty shells (delisted/unverified rows) → Google crawled them
  // and dropped them as "Crawled - currently not indexed", and the sitemap⊆
  // indexable contract broke (a sitemap URL that noindexes itself is a mixed
  // signal). The /companies/indexable allowlist is the SAME live filter the
  // detail page uses, so sitemap membership and the page's index/noindex always
  // agree. Public (no auth); a transient backend miss still ships the rest.
  let companyPaths: MetadataRoute.Sitemap = []
  try {
    const { companies } = await jobs.indexableCompanies()
    companyPaths = companies
      .filter((c) => c.name)
      .map((c) => ({
        url: `${BASE}/companies/${encodeURIComponent(c.name)}`,
        changeFrequency: "daily" as const,
        priority: 0.6,
      }))
  } catch {
    // Backend unreachable at build/render → ship static + issue + index entries;
    // company URLs return on the next regeneration.
  }

  // Static page entries derive from the single site-route registry — adding a
  // public page there (with a `sitemap:` block) lists it here automatically.
  // No lastModified: stamping render-time on every deploy claims constant
  // freshness, which crawlers detect and then ignore for the whole sitemap.
  const staticEntries = sitemapStaticEntries(BASE)

  return [
    ...staticEntries,
    ...companyPaths,
    ...issuePaths,
  ]
}
