import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { IntelPane } from "@/components/public/intel-pane"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro Intel — Live Career Signals",
  description: "Explore live hiring demand across roles, companies, locations, and skills with Myro Intel.",
  alternates: { canonical: `${BASE}/intel` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro Intel — Live Career Signals",
    description: "Explore live hiring demand across roles, companies, locations, and skills with Myro Intel.",
    type: "website",
    url: `${BASE}/intel`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro Intel — Live Career Signals",
    description: "Explore live hiring demand across roles, companies, locations, and skills with Myro Intel.",
  },
}

export default function IntelPage() {
  return (
    <div style={{ height: "100dvh", width: "100vw", maxWidth: "100vw", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <PublicTopNav active="intel" showSignIn />
      <div style={{ flex: 1, width: "100%", minWidth: 0, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <IntelPane />
        <PublicFooter commons />
      </div>
    </div>
  )
}
