"use client"

import type { MouseEvent } from "react"
import Link from "next/link"
import { ExternalLink, ArrowRight } from "lucide-react"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { LandingStats } from "./stats"
import { LandingDropzone } from "./dropzone"

interface LandingHeroProps {
  /** Live Engine corpus counters — top-of-page credibility strip. */
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
}

export function LandingHero({ jobsTracked, companiesMonitored, skillsMapped }: LandingHeroProps) {
  const signup = useSignupGate()

  /** Open the auth gate, but let modifier / middle clicks follow the href so a
   *  user can still open /signup in a new tab. */
  const gate = (source: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
    event.preventDefault()
    signup.open({ surface: "manual", source })
  }

  return (
    <section className="lp-hero" aria-labelledby="landing-heading">
      <LandingStats
        jobsTracked={jobsTracked}
        companiesMonitored={companiesMonitored}
        skillsMapped={skillsMapped}
      />

      <div className="lp-wrap lp-hero-inner">
        <p className="lp-hero-kicker">MNC careers · India</p>

        <h1 className="lp-hero-h1" id="landing-heading">
          Run your Job hunt like an Operation.
        </h1>

        <p className="lp-hero-support">
          Drop your CV once. Myro scores your fit against real openings, tailors it, prepares you.
        </p>

        <div className="lp-hero-row">
          <div className="lp-hero-start">
            <p className="lp-eyebrow lp-hero-start-eyebrow">Start here</p>
            <LandingDropzone variant="stage" source="landing_dropzone_hero">
              <Link className="lp-dz-alt" href="/market">
                Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </LandingDropzone>
          </div>

          <div className="lp-path-cards">
            <article className="lp-path-card">
              <p className="lp-path-eyebrow">Path 01 · First job</p>
              <h3 className="lp-path-title">No experience yet</h3>
              <p className="lp-path-body">
                Myro maps the shortest route to your first offer, one skill at a time.
              </p>
              <a className="lp-path-link" href="/signup" onClick={gate("landing_path_fresher")}>
                start the fresher route <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </article>

            <article className="lp-path-card">
              <p className="lp-path-eyebrow">Path 02 · Switching</p>
              <h3 className="lp-path-title">2–8 years in</h3>
              <p className="lp-path-body">
                Score your CV against live openings, then tailor before you send.
              </p>
              <a className="lp-path-link" href="/signup" onClick={gate("landing_path_switcher")}>
                score my CV <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}
