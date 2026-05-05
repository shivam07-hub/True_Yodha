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

export default function HomePage() {
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <ParticleBg />
      <PublicTopNav active="intel" showSignIn />
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <AboutSection />
        {/* Intel pane fills the viewport on scroll */}
        <div style={{ height: "100dvh", display: "flex", flexDirection: "column", position: "relative" }}>
          <IntelPane />
        </div>
        <PublicFooter />
      </div>
    </div>
  )
}
