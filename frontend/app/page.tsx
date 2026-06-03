import type { Metadata } from "next"
import { LandingPage } from "@/components/public/landing-page"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro — A job-ready CV in 10 minutes",
  description:
    "Upload your CV once. AI scores it across 10 career domains, tailors a version for every job, and shows you exactly which one to send. Private by default. Free.",
  robots: { index: true, follow: true },
  alternates: { canonical: BASE },
  openGraph: {
    title: "Myro — A job-ready CV in 10 minutes",
    description:
      "One master CV, tailored for each job role. Scored against live jobs. Private by default.",
    type: "website",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — A job-ready CV in 10 minutes",
    description:
      "One master CV, tailored for each job role. Scored against live jobs. Private by default.",
  },
}

export default function HomePage() {
  return <LandingPage />
}
