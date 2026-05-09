import type { Metadata } from "next"
import { ParticleBg } from "@/components/particle-bg"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro — Career Intelligence for Job Seekers",
  description: "Upload your CV and get your Myro Score in 60 seconds. See which skills the market demands, match against top jobs, and get a 7-day action plan.",
  alternates: { canonical: BASE },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro — Career Intelligence for Job Seekers",
    description: "Upload your CV and get your Myro Score in 60 seconds.",
    type: "website",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — Career Intelligence for Job Seekers",
    description: "Upload your CV and get your Myro Score in 60 seconds.",
  },
}
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { IntelPane } from "@/components/public/intel-pane"
import { AboutSection } from "@/components/public/about-section"
import { SampleDiagnostic } from "@/components/public/sample-diagnostic"

export default function HomePage() {
  return (
    <div style={{ height: "100dvh", width: "100vw", maxWidth: "100vw", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <ParticleBg />
      <PublicTopNav active="intel" showSignIn />
      <div style={{ flex: 1, width: "100%", minWidth: 0, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <AboutSection />
        {/* Intel pane — anchored for scroll-from-hero CTA */}
        <div
          id="intel"
          style={{
            minHeight: "100dvh",
            height: "auto",
            overflow: "visible",
            scrollMarginTop: 72,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <IntelPane />
        </div>
        {/* Post-Intel CTA bridge */}
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 24px 0", background: "var(--tm-bg)" }}>
          <a
            href="/signup"
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 24px", height: 50,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 16, fontWeight: 700,
              color: "var(--tm-accent-fg)",
              background: "var(--tm-accent)",
              border: "1px solid var(--tm-accent)",
              textDecoration: "none",
              boxShadow: "0 0 20px var(--tm-accent-glow)",
            }}
          >
            Upload your CV →
          </a>
        </div>
        <SampleDiagnostic />
        <PublicFooter />
      </div>
    </div>
  )
}
