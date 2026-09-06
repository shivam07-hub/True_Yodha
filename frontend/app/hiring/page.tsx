import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { hiringPanel, type HiringPanelResponse } from "@/lib/api"
import { HiringPanel } from "@/components/hiring/hiring-panel"
import "@/components/hiring/hiring-panel.css"

/**
 * /hiring — the sector hiring panel (Wave 2, first slice).
 *
 * Public and server-rendered because the reader we are building for is outside
 * the product: a recruiter, an EdTech team, an HR-tech buyer. The panel is the
 * sales collateral, the same way the newsletter's free CSV is. A jobseeker
 * reads the same page and gets the same answer about their sector.
 *
 * Revalidated hourly; the snapshot rebuilds once a day at 20:50 UTC, ten
 * minutes after the Ghost Job Index it cross-references.
 */
const BASE = "https://www.himyro.com"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "What is hiring in India, by sector | Myro",
  description:
    "Live roles, employers, hiring momentum and the most-asked skills across Indian sectors, read from employer hiring systems directly and re-checked at the source.",
  alternates: { canonical: `${BASE}/hiring` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "What is hiring in India, by sector — Myro",
    description:
      "Live roles, employers, momentum and the most-asked skills by sector, with the counts behind every figure.",
    type: "website",
    url: `${BASE}/hiring`,
  },
  twitter: {
    card: "summary_large_image",
    title: "What is hiring in India, by sector — Myro",
    description: "Sector hiring data with the counts behind every figure.",
  },
}

export default async function HiringPage() {
  let data: HiringPanelResponse | null = null
  try {
    data = await hiringPanel.get()
  } catch {
    // Absent, not empty. A panel of zeroes would read as "nothing is hiring".
    data = null
  }

  return (
    <>
      <PublicTopNav />
      {data ? <HiringPanel data={data} /> : <HiringUnavailable />}
      <PublicFooter />
    </>
  )
}

function HiringUnavailable() {
  return (
    <div className="hp-root tm-page-enter">
      <div className="hp-head">
        <p className="hp-eyebrow">Hiring panel</p>
        <h1 className="hp-title">What is hiring in India, by sector</h1>
        <p className="hp-lede">
          The panel is being rebuilt. It publishes once a day, and the figures
          return with it.
        </p>
      </div>
    </div>
  )
}
