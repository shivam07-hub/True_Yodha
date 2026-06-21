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

  // Every tracked company gets a crawlable sitemap entry — previously the
  // ~260 /companies/{name} pages were absent entirely. Public analytics (no
  // auth); a transient backend miss still ships the rest of the sitemap.
  let companyPaths: MetadataRoute.Sitemap = []
  try {
    const analytics = await jobs.analytics()
    companyPaths = (analytics.by_company ?? [])
      .filter((c) => c.name)
      .map((c) => ({
        url: `${BASE}/companies/${encodeURIComponent(c.name)}`,
        lastModified: c.last_seen_at ? new Date(c.last_seen_at) : new Date(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      }))
  } catch {
    // Backend unreachable at build/render → ship static + issue + index entries;
    // company URLs return on the next regeneration.
  }

  // Static page entries derive from the single site-route registry — adding a
  // public page there (with a `sitemap:` block) lists it here automatically.
  const staticEntries = sitemapStaticEntries(BASE).map((e) => ({ ...e, lastModified: new Date() }))

  return [
    ...staticEntries,
    ...companyPaths,
    ...issuePaths,
  ]
}
