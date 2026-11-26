"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingHero } from "@/components/public/landing/hero"
import { LandingUseCases } from "@/components/public/landing/use-cases"
import { LandingFinlaticsRail } from "@/components/public/landing/finlatics-rail"
import { LandingOpenJobs } from "@/components/public/landing/open-jobs"
import { LandingRoleSkills } from "@/components/public/landing/role-skills"
import { BridgeRail } from "@/components/public/landing/bridge-rail"
import type { RolePick } from "@/components/public/landing/role-picker"
import { LandingLiveMirror } from "@/components/public/landing/live-mirror"
import { LandingJobSearch } from "@/components/public/landing/job-search"
import { LandingCommons } from "@/components/public/landing/landing-commons"
import "@/components/public/landing/job-gen.css"
import { useLandingData } from "@/components/public/landing/use-landing-data"
import { getAccessToken, getRefreshToken } from "@/lib/session"
import { MarketSkeleton } from "@/components/loading/page-skeletons"
import "@/components/public/landing/landing-base.css"
import "@/components/public/landing/landing-hero.css"
import "@/components/public/landing/landing-dropzone-stage.css"
import "@/components/public/landing/landing-usecases.css"
import "@/components/public/landing/landing-usecase-atoms.css"
import "@/components/public/landing/landing-usecase-panels.css"
import "@/components/public/landing/landing-commons.css"
import "@/components/public/landing/landing-company-rail.css"
import "@/components/public/landing/landing-chapters.css"
import "@/components/public/landing/landing-motion.css"

/**
 * Myro landing, spec #66: one scroll from what MNCs hire for to your gap. The
 * hero asks for the job (role, then level) above the one dropzone; chapter 2
 * shows where those jobs are open, chapter 3 what they ask for. The bridge rail
 * fills one segment per chapter crossed. Sections below chapter 3 are the old
 * page, replaced by L4–L6.
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

        <LandingUseCases
          companyNames={data.marqueeNames}
          companiesMonitored={data.companiesMonitored}
          skillsMapped={data.skillsMapped}
          companies={data.analytics?.by_company ?? []}
          industries={data.analytics?.by_industry ?? []}
          topSkills={data.analytics?.top_skills ?? []}
        />

        <LandingFinlaticsRail />

        <LandingLiveMirror
          analytics={data.analytics}
          jobsCount={data.jobsTracked}
          companiesCount={data.companiesMonitored}
        />

        <LandingJobSearch
          industries={data.analytics?.by_industry ?? []}
          industriesLoading={!data.analytics}
        />

        <LandingCommons />
      </main>

      <PublicFooter />
    </div>
  )
}
