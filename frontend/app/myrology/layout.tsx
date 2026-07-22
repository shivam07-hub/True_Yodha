import type { Metadata } from "next"

/**
 * Metadata-only layout for the Myrology surface.
 *
 * /myrology is a `"use client"` page, so it can't export `metadata` and was
 * inheriting the root (homepage) title with no self-canonical — leaving Google
 * to pick its own canonical for the page ("Duplicate without user-selected
 * canonical", GSC 2026-07-23). A distinct title + explicit self-canonical fixes
 * it. Chrome stays inside the page; this layout only carries metadata.
 */
const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myrology — career astrology, a second lens | Myro",
  description:
    "Myrology reads your birth chart as a second lens on career direction, timing, and strengths — a reflective companion to your evidence-based Myro Score.",
  alternates: { canonical: `${BASE}/myrology` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myrology — career astrology, a second lens | Myro",
    description:
      "A reflective birth-chart lens on career direction and timing, alongside your Myro Score.",
    type: "website",
    url: `${BASE}/myrology`,
  },
}

export default function MyrologyLayout({ children }: { children: React.ReactNode }) {
  return children
}
