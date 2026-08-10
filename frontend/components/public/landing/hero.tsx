"use client"

import Link from "next/link"
import { ArrowRight, BriefcaseBusiness, Building2, Check, FileText, MapPin } from "lucide-react"
import { LandingDropzone } from "./dropzone"
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
  const sourceNames = companyNames.length > 0
    ? companyNames.slice(0, 3)
    : ["MNC career pages", "India openings", "Role requirements"]

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

        <div className="lp-market-proof" aria-label="How Myro finds relevant MNC jobs">
          <div className="lp-market-proof-head">
            <Link className="lp-market-proof-icon lp-icon-link" href="/intel" aria-label="Open Live Job Data">
              <Building2 className="size-5" aria-hidden="true" />
            </Link>
            <span>
              <strong>MNC hiring, read at the source</strong>
              <small>Career pages tracked live</small>
            </span>
            <Link className="lp-live-pill" href="/intel" aria-label="Open Live Job Data">
              Live
            </Link>
          </div>

          <div className="lp-source-list" aria-label="Career-page sources">
            {sourceNames.map((name) => (
              <div className="lp-source-row" key={name}>
                <span className="lp-source-mark" aria-hidden="true">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span>{name}</span>
                <Check className="size-4" aria-hidden="true" />
              </div>
            ))}
          </div>

          <div className="lp-proof-connector">
            <span aria-hidden="true" />
            <Link className="lp-proof-link" href="/intel" aria-label="Open Live Job Data">
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <span aria-hidden="true" />
          </div>

          <div className="lp-shortlist-card">
            <div className="lp-shortlist-label">After onboarding</div>
            <div className="lp-shortlist-title">Jobs matched to your CV</div>
            <div className="lp-shortlist-row">
              <Link className="lp-shortlist-icon-link" href="/market" aria-label="Browse relevant current openings">
                <BriefcaseBusiness className="size-4" aria-hidden="true" />
              </Link>
              <span>Relevant current openings</span>
            </div>
            <div className="lp-shortlist-row">
              <Link className="lp-shortlist-icon-link" href="/skills" aria-label="Open your skills">
                <FileText className="size-4" aria-hidden="true" />
              </Link>
              <span>Skills already in your CV</span>
            </div>
            <div className="lp-shortlist-row">
              <Link className="lp-shortlist-icon-link" href="/market" aria-label="Browse roles hiring in India">
                <MapPin className="size-4" aria-hidden="true" />
              </Link>
              <span>Roles hiring in India</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
