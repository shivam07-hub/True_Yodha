import type { Metadata } from "next"
import { Suspense } from "react"
import { EnterpriseSignup } from "@/app/signup/institutions/enterprise-signup"
import { AuthRouteSkeleton } from "@/components/loading/auth-route-skeleton"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro for Colleges — Campus Placement Intelligence",
  description:
    "Myro scores every student's CV across ten career domains and shows the skill gap against live job postings in India. Apply for a placement cell pilot.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/institutions` },
  openGraph: {
    title: "Myro for Colleges — Campus Placement Intelligence",
    description:
      "Know your batch before the recruiter does. CV scoring and live skill-gap maps for placement cells. Apply for a pilot.",
    type: "website",
    url: `${BASE}/institutions`,
  },
}

// Public B2B front door. Reuses the dual-mode enterprise signup, defaulted to
// the institution track — the rich beta-access form is the canonical, shareable
// /institutions URL (cleaner than the /signup/institutions#institutions hash).
export default function InstitutionsLandingPage() {
  return (
    <Suspense fallback={<AuthRouteSkeleton />}>
      <EnterpriseSignup initialMode="institutions" lockMode />
    </Suspense>
  )
}
