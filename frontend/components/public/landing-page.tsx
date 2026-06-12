"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingEngine } from "@/components/public/landing/engine"
import { LandingReadout } from "@/components/public/landing/readout"
import { LandingSurfaces } from "@/components/public/landing/surfaces"
import { LandingLoop } from "@/components/public/landing/loop"
import { LandingProof } from "@/components/public/landing/proof"
import { LandingFaq } from "@/components/public/landing/faq"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { useReveal } from "@/components/public/landing/use-reveal"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-engine.css"
import "@/components/public/landing/landing-sections.css"

/**
 * Myro landing — "The Myro Engine" redesign.
 * 7 sections organized around one named centerpiece: S1 hero → S2 engine →
 * sample readout → S3 surfaces → S4 loop → S5 proof → S6 FAQ + closing CTA →
 * S7 footer. Design source: reference/building landing page.zip (confirmed).
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
      router.replace("/home")
    }
  }, [router])

  // The landing is a dark-terminal surface; the reused chrome (nav, signup
  // modal portal) follows the app-level surface flag — same seam as /myrology.
  useEffect(() => {
    const root = document.documentElement
    const prior = root.getAttribute("data-surface")
    root.setAttribute("data-surface", "dark")
    return () => {
      root.setAttribute("data-surface", prior ?? "light")
    }
  }, [])

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
      <PublicTopNav active="about" showSignIn />

      <main>
        <LandingHero companiesLabel={data.companiesLabel} companyNames={data.marqueeNames} />

        <LandingEngine
          companiesLabel={data.companiesLabel}
          jobsTracked={data.jobsTracked}
          companiesMonitored={data.companiesMonitored}
          skillsMapped={data.skillsMapped}
          seekers={data.seekers}
        />

        <LandingReadout />

        <LandingSurfaces />

        <LandingLoop />

        <LandingProof rows={data.intelRows} asOf={data.asOf} companiesLabel={data.companiesLabel} />

        <LandingFaq />
      </main>

      <PublicFooter />
    </div>
  )
}
