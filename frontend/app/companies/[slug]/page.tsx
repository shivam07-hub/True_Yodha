import type { Metadata } from "next"
import { cache } from "react"
import type { CompanyJobsResponse } from "@/lib/api"
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
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  if (!base) return null
  try {
    const params = new URLSearchParams({ page: "1", page_size: "50" })
    const res = await fetch(`${base}/companies/${encodeURIComponent(companyName)}/jobs?${params}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return (await res.json()) as CompanyJobsResponse
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
  const data = await getCompanyJobs(companyName)
  const total = data?.total ?? 0
  const canonical = `${BASE}/companies/${encodeURIComponent(companyName)}`

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
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function CompanyJobsPage(
  { params }: { params: { slug: string } },
) {
  const companyName = decodeURIComponent(params.slug)
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
      <CompanyJobsClient companyName={companyName} initialData={data} />
      <RelatedCompanies current={companyName} />
    </>
  )
}
