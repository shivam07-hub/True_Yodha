import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"
import { LandingPage } from "@/components/public/landing-page"
import { FAQ_ITEMS } from "@/components/public/landing/landing-copy"

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
  "One engine reads 150+ company career pages live, scores your CV against real hiring demand, and tailors a version for every job — the first in 10 minutes. Free to start."

export const metadata: Metadata = {
  title: "Myro — The Career Intelligence Platform",
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: BASE },
  openGraph: {
    title: "Myro — The Career Intelligence Platform",
    description: DESCRIPTION,
    type: "website",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — The Career Intelligence Platform",
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  themeColor: "#0a0a0c",
  viewportFit: "cover",
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Myro",
      url: BASE,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
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
