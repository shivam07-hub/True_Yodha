import type { Metadata } from "next"

/**
 * Metadata-only layout for the pre-login CV scorer.
 *
 * /cv-preview is a `"use client"` page, so it can't export `metadata` itself and
 * was inheriting the root (homepage) title + no self-canonical. Because its
 * above-the-fold content (a CV dropzone + score readout) overlaps the homepage
 * hero, Google clustered the two and reported "Duplicate without user-selected
 * canonical" (GSC 2026-07-23). A distinct title + explicit self-canonical
 * disambiguates them. Chrome (nav/footer) stays inside the page — this layout
 * only carries metadata and passes children through.
 */
const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Score your CV free — Myro",
  description:
    "Drop your CV and get an instant Myro Score across 10 career domains — free, nothing saved. See your strengths and gaps before you sign up.",
  alternates: { canonical: `${BASE}/cv-preview` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Score your CV free — Myro",
    description:
      "Instant Myro Score across 10 career domains. Free, nothing saved.",
    type: "website",
    url: `${BASE}/cv-preview`,
  },
}

export default function CvPreviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
