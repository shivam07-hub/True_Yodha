import type { Metadata } from "next"
import { cache } from "react"
import type { CommentListResponse, CompanyJobsResponse, CompanySkillIntelligence } from "@/lib/api"
import { CompanyJobsClient, type PostingNote } from "@/components/companies/company-jobs-client"
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

// Company-level community notes (public read, no auth → is_own always false in
// the seed; the signed-in client refetches on mount to resolve edit controls).
// This is the UGC that becomes the page's crawlable SEO/AEO content.
const getCompanyNotes = cache(async (companyName: string): Promise<CommentListResponse | null> => {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  if (!base) return null
  try {
    const res = await fetch(
      `${base}/comments?entity_type=company&entity_id=${encodeURIComponent(companyName)}`,
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) return null
    return (await res.json()) as CommentListResponse
  } catch {
    return null
  }
})

const getCompanySkillIntelligence = cache(
  async (companyName: string): Promise<CompanySkillIntelligence | null> => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    if (!base) return null
    try {
      const res = await fetch(
        `${base}/companies/${encodeURIComponent(companyName)}/skill-intelligence?limit=20`,
        { next: { revalidate: 3600 } },
      )
      if (!res.ok) return null
      return (await res.json()) as CompanySkillIntelligence
    } catch {
      return null
    }
  },
)

// Notes left on this company's individual job postings, rolled up. The endpoint
// 404s when the company has neither reviews nor notes → treat as an empty rollup.
const getPostingNotes = cache(async (companyName: string): Promise<PostingNote[]> => {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  if (!base) return []
  try {
    const res = await fetch(`${base}/companies/${encodeURIComponent(companyName)}`, {
      next: { revalidate: 3600 },
    })
    if (res.status === 404 || !res.ok) return []
    const data = (await res.json()) as { posting_notes?: PostingNote[] }
    return data.posting_notes ?? []
  } catch {
    return []
  }
})

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const companyName = decodeURIComponent(params.slug)
  // Same cached reads the page makes → no extra round-trips (React.cache dedupes).
  const [data, notes, postingNotes] = await Promise.all([
    getCompanyJobs(companyName),
    getCompanyNotes(companyName),
    getPostingNotes(companyName),
  ])
  const total = data?.total ?? 0
  const canonical = `${BASE}/companies/${encodeURIComponent(companyName)}`

  // A company page earns indexing only when it has real crawlable content:
  // live roles OR first-hand community notes (the "what's it like at X" AEO
  // text). An empty shell (0 live roles, 0 notes) is the thin page Google
  // crawls then drops as "Crawled - currently not indexed" — worse than not
  // asking. noindex here + omission from the sitemap (see sitemap.ts) keep the
  // request honest. follow:true so Googlebot still walks the links. When the
  // scraper re-lists roles (or a note lands), ISR flips the page back to
  // index automatically — no manual step.
  const hasNotes = (notes?.comments?.length ?? 0) > 0 || postingNotes.length > 0
  const indexable = total > 0 || hasNotes

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
  // Parallel — the three reads are independent (React.cache dedupes the two
  // getCompanyJobs/notes calls this page + generateMetadata each make).
  const [data, notes, postingNotes, skillIntelligence] = await Promise.all([
    getCompanyJobs(companyName),
    getCompanyNotes(companyName),
    getPostingNotes(companyName),
    getCompanySkillIntelligence(companyName),
  ])
  const canonical = `${BASE}/companies/${encodeURIComponent(companyName)}`

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

  // DiscussionForumPosting per first-hand community note — the forum-content
  // rich type Google surfaces and AI answer engines cite heavily for
  // experiential "what's it like to apply at X" queries. Emitted ONLY for notes
  // actually rendered in the HTML (company-level notes + posting-note rollup);
  // never invented, no ratings. Author = public ninja-name only (PV1).
  const forumPosts = [
    ...(notes?.comments ?? []).map((c) => ({
      text: c.body,
      author: c.author_ninja_name,
      datePublished: c.created_at,
    })),
    ...postingNotes.map((n) => ({
      text: n.role ? `${n.role}: ${n.body}` : n.body,
      author: n.author_ninja_name,
      datePublished: n.created_at,
    })),
  ]
    .filter((p) => p.text?.trim())
    .slice(0, 25)

  const forumJsonLd =
    forumPosts.length > 0
      ? forumPosts.map((p) => ({
          "@context": "https://schema.org",
          "@type": "DiscussionForumPosting",
          headline: `What applicants say about ${companyName}`,
          text: p.text,
          datePublished: p.datePublished,
          url: canonical,
          author: { "@type": "Person", name: p.author || "A Myro user" },
        }))
      : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {forumJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(forumJsonLd) }}
        />
      )}
      <CompanyJobsClient
        companyName={companyName}
        initialData={data}
        initialComments={notes}
        initialPostingNotes={postingNotes}
        initialSkillIntelligence={skillIntelligence}
      />
      <RelatedCompanies current={companyName} />
    </>
  )
}
