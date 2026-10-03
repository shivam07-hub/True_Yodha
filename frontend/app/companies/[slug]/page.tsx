import type { Metadata } from "next"
import { cache } from "react"
import type { CompanyJobsResponse } from "@/lib/api"
import { publicRead } from "@/lib/public-api"
import { CompanyJobsClient } from "@/components/companies/company-jobs-client"
import { RelatedCompanies } from "@/components/companies/related-companies"

/**
 * Company detail page — a public SEO / job-intel surface.
 *
 * Previously this was a `"use client"` page whose initial HTML was a
 * "Loading company jobs…" shell with homepage metadata and no self-canonical.
 * Google was sent ~260 of these via the sitemap but saw no company-specific
 * content or canonical → not worth indexing (Codex handoff P2/P3).
 *
 * Now: server-fetch the first page of roles, emit company-specific
 * title/description/self-canonical + ItemList JSON-LD, and render the real job
 * list into the server HTML (via the client child seeded with `initialData`).
 * Save / comments / pagination / signup stay client-side.
 *
 * Public data (companies/{name}/jobs has no auth). ISR hourly.
 */

const BASE = "https://www.himyro.com"
export const revalidate = 3600

// Shared between generateMetadata and the page so one request serves both
// (React cache dedupes within a single render pass).
const getCompanyJobs = cache(async (companyName: string): Promise<CompanyJobsResponse | null> => {
  try {
    const params = new URLSearchParams({ page: "1", page_size: "50" })
    return await publicRead<CompanyJobsResponse>(
      `/companies/${encodeURIComponent(companyName)}/jobs?${params}`,
      { missing: "empty", next: { revalidate: 3600 } },
    )
  } catch {
    // Backend unreachable at render → render the shell; the client query retries
    // and ISR regenerates. Never 500 a crawlable page over a transient fetch.
    return null
  }
})

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const companyName = decodeURIComponent(params.slug)
  // Same cached read the page makes → no extra round-trip (React.cache dedupes).
  const data = await getCompanyJobs(companyName)
  const total = data?.total ?? 0
  const canonical = `${BASE}/companies/${encodeURIComponent(companyName)}`

  // A company page earns indexing only when it has real crawlable content:
  // live roles. An empty shell (0 live roles) is the thin page Google
  // crawls then drops as "Crawled - currently not indexed" — worse than not
  // asking. noindex here + omission from the sitemap (see sitemap.ts) keep the
  // request honest. follow:true so Googlebot still walks the links. When the
  // scraper re-lists roles, ISR flips the page back to index automatically —
  // no manual step.
  const indexable = total > 0

  const title = `${companyName} jobs and hiring signals | Myro`
  const description =
    total > 0
      ? `Explore ${total} open role${total !== 1 ? "s" : ""} at ${companyName}, with locations and skill signals from Myro's live job database.`
      : `Live open roles, locations, and skill signals for ${companyName}, from Myro's live job database.`

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: indexable,
      follow: true,
      googleBot: { index: indexable, follow: true, "max-image-preview": "large" },
    },
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function CompanyJobsPage(
  { params }: { params: { slug: string } },
) {
  const companyName = decodeURIComponent(params.slug)
  // The one J0 read (React.cache dedupes it with generateMetadata). Skill
  // demand is J2: the client loads it only after its disclosure is opened.
  const data = await getCompanyJobs(companyName)

  // ItemList of the rendered roles — matches on-page content exactly (no invented
  // JobPosting salary/employment data). Helps AI engines chunk the role list.
  const jsonLd =
    data && data.jobs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Open roles at ${companyName}`,
          numberOfItems: data.total,
          itemListElement: data.jobs.slice(0, 50).map((j, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: j.title,
          })),
        }
      : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CompanyJobsClient
        companyName={companyName}
        initialData={data}
      />
      <RelatedCompanies current={companyName} />
    </>
  )
}
