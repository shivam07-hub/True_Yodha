import type { Metadata } from "next"
import { CVHubPage } from "@/components/public/cv-hub-page"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro — A job-ready CV in 10 minutes",
  description: "Upload your CV once. Tailor it for any role in 10 minutes — scored against live job descriptions. Free.",
  alternates: { canonical: `${BASE}/about` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro — A job-ready CV in 10 minutes",
    description: "Upload your CV once. Tailor it for any role in 10 minutes — scored against live job descriptions. Free.",
    type: "website",
    url: `${BASE}/about`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — A job-ready CV in 10 minutes",
    description: "Upload your CV once. Tailor it for any role in 10 minutes — scored against live job descriptions. Free.",
  },
}

export default function AboutPage() {
  return <CVHubPage />
}
