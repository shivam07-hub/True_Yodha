"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingCompanyRail } from "@/components/public/landing/company-rail"
import { LandingLiveMirror } from "@/components/public/landing/live-mirror"
import { LandingJobSearch } from "@/components/public/landing/job-search"
import "@/components/public/landing/job-gen.css"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-cv-hub.css"
import "@/components/public/landing/landing-depth.css"
import "@/components/public/landing/landing-match-sources.css"
import "@/components/public/landing/landing-company-rail.css"
import "@/components/public/landing/landing-motion.css"

/**
 * Myro landing — seeker-first MNC story. The hero is the product: CV Hub
 * with a three-step toggle (upload, sample score, tailor). Live job proof
 * sits below. One dropzone, one handoff to /cv-preview → signup.
 */
export function LandingPage({ fontClassName = "" }: { fontClassName?: string }) {
  const router = useRouter()

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

  // Nav hairline fades in after 8px scroll (handoff §Interactions).
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const data = useLandingData()

  if (redirecting) return null

  return (
    <div
      className={`tm-landing ${fontClassName}`.trim()}
      data-scrolled={scrolled ? "true" : "false"}
    >
      <PublicTopNav active="home" showSignIn />

      <main>
        <LandingHero
          companyNames={data.marqueeNames}
          jobsTracked={data.jobsTracked}
          companiesMonitored={data.companiesMonitored}
          skillsMapped={data.skillsMapped}
          seekers={data.seekers}
        />

        <LandingCompanyRail
          companyNames={data.marqueeNames}
          companiesMonitored={data.companiesMonitored}
        />

        <LandingLiveMirror
          analytics={data.analytics}
          jobsCount={data.jobsTracked}
          companiesCount={data.companiesMonitored}
        />

        <LandingJobSearch
          industries={data.analytics?.by_industry ?? []}
          industriesLoading={!data.analytics}
        />
      </main>

      <PublicFooter />
    </div>
  )
}
