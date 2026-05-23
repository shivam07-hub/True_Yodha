import type { Metadata } from "next"
import { CVHubPage } from "@/components/public/cv-hub-page"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro — The home for every version of your CV",
  description: "Upload your baseline CV. Tailor a version for every job you target. See each one scored against live job descriptions.",
  alternates: { canonical: `${BASE}/about` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro — The home for every version of your CV",
    description: "Upload your baseline CV. Tailor a version for every job you target. See each one scored against live job descriptions.",
    type: "website",
    url: `${BASE}/about`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — The home for every version of your CV",
    description: "Upload your baseline CV. Tailor a version for every job you target. See each one scored against live job descriptions.",
  },
}

export default function AboutPage() {
  return <CVHubPage />
}
