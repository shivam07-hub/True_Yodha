import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { TaxonomyBrowser } from "./taxonomy-browser"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Skill Taxonomy — 35,108 Skills | Myro",
  description:
    "Browse 35,108 verified skills across 31 domains and 442 clusters. The same taxonomy Myro uses to score your CV and match you to jobs.",
  alternates: { canonical: `${BASE}/taxonomy` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Skill Taxonomy — 35,108 Skills | Myro",
    description:
      "Browse the full Myro skills taxonomy: 31 career domains, 442 sub-skill clusters, 35,108 leaf skills.",
    type: "website",
    url: `${BASE}/taxonomy`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Skill Taxonomy — 35,108 Skills | Myro",
    description:
      "Browse the full Myro taxonomy used to score CVs — 31 domains, 442 clusters, 35,108 skills.",
  },
}

const DOMAINS = [
  "Information Technology",
  "Architecture and Construction",
  "Public Safety and National Security",
  "Transportation, Supply Chain, and Logistics",
  "Analysis",
  "Maintenance, Repair, and Facility Services",
  "Design",
  "Engineering",
  "Law, Regulation, and Compliance",
  "Media and Communications",
  "Marketing and Public Relations",
  "Business",
  "Environment",
  "Health Care",
  "Manufacturing and Production",
  "Finance",
  "Human Resources",
  "Energy and Utilities",
  "Physical and Inherent Abilities",
  "Science and Research",
  "Education and Training",
  "Customer and Client Support",
  "Performing Arts, Sports, and Recreation",
  "Sales",
  "Administration",
  "Social and Human Services",
  "Property and Real Estate",
  "Hospitality and Food Services",
  "Economics, Policy, and Social Studies",
  "Agriculture, Horticulture, and Landscaping",
  "Personal Care and Services",
]

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "Myro Career Skills Taxonomy",
  description:
    "35,108 verified skills organized into 31 career domains and 442 sub-skill clusters. The Myro skill taxonomy powering every CV score and job match.",
  url: `${BASE}/taxonomy`,
  hasDefinedTerm: DOMAINS.map((name) => ({
    "@type": "DefinedTerm",
    name,
    inDefinedTermSet: `${BASE}/taxonomy`,
  })),
}

export default function TaxonomyPage() {
  return (
    <div
      className="tm-page-canvas"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicTopNav showSignIn />
      <main style={{ flex: 1 }}>
        <TaxonomyBrowser />
      </main>
      <PublicFooter />
    </div>
  )
}
