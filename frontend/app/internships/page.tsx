import type { Metadata } from "next"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import { InternshipsSurface } from "@/components/internships/internships-surface"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Paid internships — Myro",
  description:
    "Paid internships next to MNC career-page jobs. Apply here on Myro for hosted listings; company-portal apply for the rest.",
  alternates: { canonical: `${BASE}/internships` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Paid internships — Myro",
    description: "Paid internships, MNC jobs, CV tailoring, and prep in one loop.",
    type: "website",
    url: `${BASE}/internships`,
  },
}

export default function InternshipsPage() {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <PublicTopNav showSignIn />
      <div style={{ flex: 1 }}>
        <InternshipsSurface />
        <PublicFooter commons />
      </div>
    </div>
  )
}
