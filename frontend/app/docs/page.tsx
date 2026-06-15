import type { Metadata } from "next"
import { DocsPage } from "@/components/docs/docs-page"
import { FAQ_ITEMS } from "@/components/docs/docs-sections"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "How Myro Works | Methodology & Documentation",
  description:
    "Plain-English explanation of how Myro reads your CV, calculates your Myro Score, finds matching jobs, and maps your skills across 10 career domains.",
  alternates: { canonical: `${BASE}/docs` },
  openGraph: {
    title: "How Myro Works | Methodology & Documentation",
    description:
      "No black boxes. See exactly how your CV is read, how your score is calculated, and how job matches are found.",
    url: `${BASE}/docs`,
  },
}

// /docs#faq is the canonical product-FAQ hub (FAQPage). AEO play — AI engines
// parse this for product answers; Google dropped FAQ rich results in 2023.
// The same Q/A render visibly via <FAQSection>, so the markup is backed by text.
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${BASE}/docs#faq`,
  mainEntity: FAQ_ITEMS.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

export default function Docs() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <DocsPage />
    </>
  )
}
