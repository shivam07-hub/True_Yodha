import type { Metadata } from "next"
import { AboutSection } from "@/components/public/about-section"
import { ParticleBg } from "@/components/particle-bg"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import { SampleDiagnostic } from "@/components/public/sample-diagnostic"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "About Myro - Career Intelligence",
  description: "Learn what Myro tracks, why career intelligence matters, and see a sample diagnostic showing how live hiring demand turns into skill signals.",
  alternates: { canonical: `${BASE}/about` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "About Myro - Career Intelligence",
    description: "Learn how Myro turns live hiring demand into skill signals for job seekers.",
    type: "website",
    url: `${BASE}/about`,
  },
  twitter: {
    card: "summary_large_image",
    title: "About Myro - Career Intelligence",
    description: "Learn how Myro turns live hiring demand into skill signals for job seekers.",
  },
}

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100dvh", width: "100vw", maxWidth: "100vw", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <ParticleBg />
      <PublicTopNav active="about" showSignIn />
      <div style={{ flex: 1, width: "100%", minWidth: 0, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <AboutSection primaryCtaHref="/intel" primaryCtaLabel="Open Intel" />
        <div id="sample-diagnostic" style={{ scrollMarginTop: 72 }}>
          <SampleDiagnostic />
        </div>
        <PublicFooter />
      </div>
    </div>
  )
}
