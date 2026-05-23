import type { MetadataRoute } from "next"
import { getAllIssues } from "@/lib/newsletter"

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

  return [
    { url: BASE, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/intel`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/newsletter`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    ...issuePaths,
  ]
}
