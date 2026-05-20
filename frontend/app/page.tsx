import type { Metadata } from "next"
import { ParticleBg } from "@/components/particle-bg"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { IntelPane } from "@/components/public/intel-pane"

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

export default function HomePage() {
  return (
    <div style={{ height: "100dvh", width: "100vw", maxWidth: "100vw", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <ParticleBg />
      <PublicTopNav active="intel" showSignIn />
      <div style={{ flex: 1, width: "100%", minWidth: 0, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <IntelPane />
        <PublicFooter />
      </div>
    </div>
  )
}
