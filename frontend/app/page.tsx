import type { Metadata } from "next"
import { CVHubPage } from "@/components/public/cv-hub-page"

export const metadata: Metadata = {
  title: "Myro - One hub for every CV version",
  description:
    "Save your master CV, tailor versions for internships and jobs, and know which resume to send next.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.himyro.com" },
}

export default function HomePage() {
  return <CVHubPage />
}
