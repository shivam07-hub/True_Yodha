import type { Metadata } from "next"
import { Suspense } from "react"
import { SignupRoute } from "./signup-route"
import { AuthRouteSkeleton } from "@/components/loading/auth-route-skeleton"

export const metadata: Metadata = {
  title: "Sign Up — Myro",
  description: "Start your CV hub. Score your CV against live jobs and keep every version you tailor.",
  // ADR-0006 §2 — /signup is the magic-link landing twin + SEO surface +
  // no-JS fallback. Indexable so search engines crawl the calm public CTA.
  robots: { index: true, follow: true },
}

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthRouteSkeleton />}>
      <SignupRoute />
    </Suspense>
  )
}
