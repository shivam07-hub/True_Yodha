"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingJobSearch } from "@/components/public/landing/job-search"
import { LandingHowItWorks } from "@/components/public/landing/how-it-works"
import { LandingLoop } from "@/components/public/landing/loop"
import { LandingDomains } from "@/components/public/landing/domains"
import { LandingJobSwitchPlan } from "@/components/public/landing/job-switch-plan"
import { LandingProof } from "@/components/public/landing/proof"
import { LandingFaq } from "@/components/public/landing/faq"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { useReveal } from "@/components/public/landing/use-reveal"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-sections.css"
import "@/components/public/landing/job-gen.css"
import "@/components/public/landing/landing-depth.css"

/**
 * Myro landing — single job-seeker funnel (backlog #33, grill-locked 2026-06-27).
 * One promise, one story: hero (CV → live score) → job-gen proof-search (type the
 * job you want → REAL openings) → how-it-works (the one-time way in) → the weekly
 * loop (the recurring cycle) → 10-domain chips → ₹99 Personalised Job-Switch Plan
 * teaser → proof/FAQ → footer. Dropping a CV in any
 * band navigates to /cv-preview, which scores it and either opens the playground
 * or routes to /signup with the readout (navigate-then-load; the dropzone owns
 * that jump, so the landing holds no scoring state).
 * Demoted off the landing per #33 Q7: Myrology (footer only), the multi-product
 * "Surfaces" breadth section, coins as a cold-visitor concept. Removed 2026-07-23:
 * the animated Engine band — it was the machine-view of the same loop HowItWorks
 * and the weekly loop already tell, so it told one story a third time (declutter).
 * Design source: reference/building landing page.zip (confirmed).
 */
export function LandingPage({ fontClassName = "" }: { fontClassName?: string }) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)

  // Already-signed-in users shouldn't land on the public marketing page.
  // Tokens live in localStorage (not a cookie), so the server can't gate this —
  // detect after hydration and bounce to the app. Access OR refresh: an expired
  // access token with a live refresh token is still a session (useAuth rehydrates
  // it on /home). SSR/bots still render the full page, so SEO is preserved.
  const [redirecting, setRedirecting] = useState(false)
  useEffect(() => {
    if (getAccessToken() || getRefreshToken()) {
      setRedirecting(true)
      // Returning users land on /market — Live is the primary daily surface.
      router.replace("/market")
    }
  }, [router])

  // The landing now follows the canonical surface (it consumes --tm-* like the
  // rest of the product — pre = post). No force-dark: it themes light/dark with
  // the visitor's OS preference like the rest of the app.

  // Nav hairline fades in after 8px scroll (handoff §Interactions).
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useReveal(rootRef)

  const data = useLandingData()

  if (redirecting) return null

  return (
    <div
      ref={rootRef}
      className={`tm-landing ${fontClassName}`.trim()}
      data-scrolled={scrolled ? "true" : "false"}
    >
      <PublicTopNav active="home" showSignIn />

      <main>
        <LandingHero
          companiesLabel={data.companiesLabel}
          companyNames={data.marqueeNames}
          jobsTracked={data.jobsTracked}
          companiesMonitored={data.companiesMonitored}
          skillsMapped={data.skillsMapped}
          seekers={data.seekers}
        />

        <LandingJobSearch />

        <LandingHowItWorks />

        <LandingLoop />

        <LandingDomains />

        <LandingJobSwitchPlan />

        <LandingProof rows={data.intelRows} asOf={data.asOf} companiesLabel={data.companiesLabel} />

        <LandingFaq />
      </main>

      <PublicFooter />
    </div>
  )
}
