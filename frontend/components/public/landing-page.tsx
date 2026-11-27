"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingOpenJobs } from "@/components/public/landing/open-jobs"
import { LandingRoleSkills } from "@/components/public/landing/role-skills"
import { LandingGapExample } from "@/components/public/landing/gap-example"
import { LandingFillGap } from "@/components/public/landing/fill-gap"
import { LandingReviewer } from "@/components/public/landing/reviewer"
import { LandingClose } from "@/components/public/landing/close"
import { BridgeRail } from "@/components/public/landing/bridge-rail"
import type { RolePick } from "@/components/public/landing/role-picker"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import { MarketSkeleton } from "@/components/loading/page-skeletons"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-dropzone-stage.css"
import "@/components/public/landing/landing-company-rail.css"
import "@/components/public/landing/landing-chapters.css"
import "@/components/public/landing/landing-gap.css"
import "@/components/public/landing/landing-reviewer.css"
import "@/components/public/landing/landing-motion.css"

/**
 * Myro landing, spec #66: one scroll from what MNCs hire for to your gap. The
 * hero asks for the job (role, then level) above the one dropzone; chapter 2
 * shows where those jobs are open, chapter 3 what they ask for, chapter 4 a CV
 * read against one, chapter 5 how a gap gets filled, chapter 6 the person who
 * reviews it, chapter 7 the dropzone again for whoever read to the end. The
 * bridge rail fills one segment per chapter crossed.
 */
export function LandingPage() {
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
  const [pick, setPick] = useState<RolePick | null>(null)

  if (redirecting) return <MarketSkeleton />

  return (
    <div
      className="tm-landing"
      data-scrolled={scrolled ? "true" : "false"}
    >
      <PublicTopNav active="home" showSignIn />
      <BridgeRail />

      <main>
        <LandingHero pick={pick} onPick={setPick} />

        <LandingOpenJobs
          pick={pick}
          verifiedLive={data.stats?.provenance?.verified_live ?? null}
          companyNames={data.marqueeNames}
          companiesMonitored={data.companiesMonitored}
        />

        <LandingRoleSkills pick={pick} />

        <LandingGapExample pick={pick} />

        <LandingFillGap />

        <LandingReviewer pick={pick} />

        <LandingClose pick={pick} />
      </main>

      <PublicFooter />
    </div>
  )
}
