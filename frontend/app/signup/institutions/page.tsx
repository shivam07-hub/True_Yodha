import type { Metadata } from "next"
import { Suspense } from "react"
import { EnterpriseSignup } from "./enterprise-signup"

export const metadata: Metadata = {
  title: "Myro for Placement Cells — Career Intelligence for Institutions",
  description:
    "Cohort-level CV scoring, skill-gap analysis against live hiring, and placement analytics for T&P cells, deans, and career services. Apply for the beta cohort.",
  robots: { index: true, follow: true },
  // /institutions is the canonical B2B front door; this dual-mode entry points
  // there so the two indexable surfaces don't compete for the same query.
  alternates: { canonical: "https://www.himyro.com/institutions" },
}

export default function InstitutionsSignupPage() {
  return (
    <Suspense fallback={null}>
      <EnterpriseSignup />
    </Suspense>
  )
}
