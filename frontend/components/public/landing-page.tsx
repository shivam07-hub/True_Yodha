"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingEngine } from "@/components/public/landing/engine"
import { LandingReadout } from "@/components/public/landing/readout"
import { LandingSurfaces } from "@/components/public/landing/surfaces"
import { LandingProof } from "@/components/public/landing/proof"
import { LandingFaq } from "@/components/public/landing/faq"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { useReveal } from "@/components/public/landing/use-reveal"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import type { AnonScoreResponse } from "@/lib/api"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-engine.css"
import "@/components/public/landing/landing-sections.css"

/**
 * Myro landing — "The Myro Engine" redesign.
 * Sections organized around one named centerpiece: S1 hero → S2 engine →
 * S3 surfaces → proof → sample readout (the personalized payoff, kept adjacent
 * to the closing CTA) → FAQ + closing CTA → footer.
 * Design source: reference/building landing page.zip (confirmed).
 * (The retention-loop diagram was removed from the marketing page — it reads as
 * architecture, not story. Concept preserved in docs/FEATURE_LOOP_REGISTRY.md.)
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
  // rest of the product — pre = post). No force-dark: a light-pref/OS visitor
  // sees the light Engine; a dark one sees the dark Engine. The Engine pipeline
  // + readout stay dark consoles regardless (pinned in landing-engine.css).

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

  // Live CV-score preview (grill). State lives here so the hero dropzone (input)
  // and the Readout (output) — two different sections — share one result. On a
  // score, reveal the live Readout and scroll to it so the user sees the payoff.
  const [anonResult, setAnonResult] = useState<AnonScoreResponse | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)

  function handleResult(result: AnonScoreResponse) {
    setAnonResult(result)
    setScoring(false)
    requestAnimationFrame(() => {
      const target = document.getElementById("cv-hub")
      if (!target) return
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    })
  }

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
          scoring={scoring}
          scoreError={scoreError}
          onScoring={() => {
            setScoring(true)
            setScoreError(null)
          }}
          onResult={handleResult}
          onError={(message) => {
            setScoreError(message)
            setScoring(false)
          }}
        />

        <LandingEngine
          companiesLabel={data.companiesLabel}
          scoring={scoring}
          scoreError={scoreError}
          onScoring={() => {
            setScoring(true)
            setScoreError(null)
          }}
          onResult={handleResult}
          onError={(message) => {
            setScoreError(message)
            setScoring(false)
          }}
        />

        <LandingSurfaces />

        <LandingProof rows={data.intelRows} asOf={data.asOf} companiesLabel={data.companiesLabel} />

        <LandingReadout result={anonResult} />

        <LandingFaq
          scoring={scoring}
          scoreError={scoreError}
          onScoring={() => {
            setScoring(true)
            setScoreError(null)
          }}
          onResult={handleResult}
          onError={(message) => {
            setScoreError(message)
            setScoring(false)
          }}
        />
      </main>

      <PublicFooter />
    </div>
  )
}
