import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"
import { LandingPage } from "@/components/public/landing-page"

const BASE = "https://www.himyro.com"

// Space Grotesk is loaded globally in app/layout.tsx now (--font-grotesk on
// <html>), so the landing only needs to supply the mono used by --lp-mono.
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jbmono",
  display: "swap",
})

const DESCRIPTION =
  "Upload your CV. Myro tracks MNC career pages in India, matches you to current openings, and helps you tailor your CV for the job."

export const metadata: Metadata = {
  title: "Myro — Prepare for MNC Jobs Hiring in India",
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: BASE },
  openGraph: {
    title: "Myro — Prepare for MNC Jobs Hiring in India",
    description: DESCRIPTION,
    type: "website",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — Prepare for MNC Jobs Hiring in India",
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  // The landing is the ink surface and dark-only, so both OS preferences get
  // the same navy — a light-preference visitor whose browser chrome went paper
  // would see it butt against a navy page.
  themeColor: "#050a18",
  viewportFit: "cover",
}

// No FAQPage node here. The landing FAQ accordion was removed 2026-08-06 (its
// questions were duplicates of /docs#faq), so /docs is the single surface that
// emits FAQPage — one Q/A, one canonical URL.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Myro",
  url: BASE,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <LandingPage fontClassName={jbMono.variable} />
    </>
  )
}
