import type { Metadata } from "next"
import { Suspense } from "react"
import { EnterpriseSignup } from "@/app/signup/institutions/enterprise-signup"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro for Colleges — Campus Placement Intelligence",
  description:
    "Cohort-level CV scoring, skill-gap analysis against live hiring, and placement analytics for T&P cells, deans, and career services. Apply for the beta cohort.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/institutions` },
  openGraph: {
    title: "Myro for Colleges — Campus Placement Intelligence",
    description:
      "Cohort-level CV scoring, skill-gap maps, and placement analytics for placement cells. Apply for the beta cohort.",
    type: "website",
    url: `${BASE}/institutions`,
  },
}

// Public B2B front door. Reuses the dual-mode enterprise signup, defaulted to
// the institution track — the rich beta-access form is the canonical, shareable
// /institutions URL (cleaner than the /signup/institutions#institutions hash).
export default function InstitutionsLandingPage() {
  return (
    <Suspense fallback={null}>
      <EnterpriseSignup initialMode="institutions" lockMode />
    </Suspense>
  )
}
