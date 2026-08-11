"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { LandingDropzone } from "./dropzone"
import { LandingHeroEngine } from "./hero-engine"
import { LandingStats } from "./stats"

interface LandingHeroProps {
  /** Real company names from the Engine corpus for the monogram chips. */
  companyNames: string[]
  /** Live Engine corpus counters — top-of-page credibility strip. */
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
  /** Real seeker count, or null when none is configured (T3 — never fabricated). */
  seekers: number | null
}

export function LandingHero({
  companyNames,
  jobsTracked,
  companiesMonitored,
  skillsMapped,
  seekers,
}: LandingHeroProps) {
  return (
    <section className="lp-hero" aria-labelledby="landing-heading">
      <LandingStats
        jobsTracked={jobsTracked}
        companiesMonitored={companiesMonitored}
        skillsMapped={skillsMapped}
        seekers={seekers}
      />

      <div className="lp-wrap lp-hero-inner">
        <div className="lp-hero-left">
          <p className="lp-hero-kicker">MNC careers · India</p>

          <h1 className="lp-hero-h1" id="landing-heading">
            Prepare for MNC jobs hiring in India.
          </h1>

          <p className="lp-hero-support">
            Upload your CV. Myro tracks MNC career pages, matches you to current openings,
            and tailors your CV for the job.
          </p>

          <LandingDropzone source="landing_dropzone_hero" />

          <Link className="lp-hero-secondary" href="/market">
            Browse live jobs <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <LandingHeroEngine
          companyNames={companyNames}
          companiesMonitored={companiesMonitored}
        />
      </div>
    </section>
  )
}
