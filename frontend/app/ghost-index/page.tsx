import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { ghostIndex, type GhostIndexResponse } from "@/lib/api"
import { GhostIndexReport } from "@/components/ghost-index/ghost-index-report"
// The unavailable branch renders gi-* classes without mounting the report, so
// the stylesheet has to be imported here too.
import "@/components/ghost-index/ghost-index.css"

/**
 * /ghost-index — the public verification surface.
 *
 * Server-rendered so a crawler with no JS sees every figure and every employer
 * name. Revalidated hourly; the snapshot underneath rebuilds once a day, so an
 * hour of ISR costs nothing and keeps the freshness stamp honest.
 *
 * When the index has not been computed the page says so. It never renders
 * zeroes: "0% of closed roles are still advertised" is the opposite claim.
 */
const BASE = "https://www.himyro.com"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Ghost Job Index — are closed roles still advertised? | Myro",
  description:
    "Myro re-checks job listings at the employer's own hiring system. When a role closes, most employers leave the ad up. The share still advertised, by employer and sector, with the counts behind every figure.",
  alternates: { canonical: `${BASE}/ghost-index` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Ghost Job Index — Myro",
    description:
      "When an employer's hiring system stops serving a role, does the careers feed stop advertising it? Measured across tracked employers.",
    type: "website",
    url: `${BASE}/ghost-index`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghost Job Index — Myro",
    description:
      "The share of closed roles still being advertised, by employer, with the counts behind every figure.",
  },
}

export default async function GhostIndexPage() {
  let data: GhostIndexResponse | null = null
  try {
    data = await ghostIndex.get()
  } catch {
    // Absent, not empty. A 503 means the snapshot has not been computed — the
    // honest page says nothing rather than printing a zero for every employer.
    data = null
  }

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: "Ghost Job Index", item: `${BASE}/ghost-index` },
      ],
    },
  ]

  // Dataset — presence-gated on a computed snapshot. Aggregates only (no
  // per-user data), matching the same schema shape newsletter issues use.
  if (data) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Myro Ghost Job Index",
      description:
        "The share of closed roles still advertised on the employer's own careers page, by employer and by sector, checked against the employer's own hiring system.",
      url: `${BASE}/ghost-index`,
      isAccessibleForFree: true,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Organization", name: "Myro", url: BASE },
      spatialCoverage: "India",
      dateModified: data.computed_at,
      variableMeasured: [
        "Share of closed roles still advertised",
        "Average days a closed role stayed advertised",
      ],
      measurementTechnique: data.method,
    })
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicTopNav />
      {data ? <GhostIndexReport data={data} /> : <GhostIndexUnavailable />}
      <PublicFooter />
    </>
  )
}

function GhostIndexUnavailable() {
  return (
    <div className="gi-root tm-page-enter">
      <div className="gi-head">
        <p className="gi-eyebrow">Verification ledger</p>
        <h1 className="gi-title">Ghost Job Index</h1>
        <p className="gi-lede">
          The index is being rebuilt. It publishes once a day, and the figures
          return with it.
        </p>
      </div>
    </div>
  )
}
