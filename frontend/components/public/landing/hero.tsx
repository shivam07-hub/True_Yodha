"use client"

import { useRef, type MouseEvent } from "react"
import Link from "next/link"
import { ExternalLink, ArrowRight } from "lucide-react"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { trackEvent } from "@/lib/analytics"
import { LandingStats } from "./stats"
import { LandingDropzone, type LandingDropzoneHandle } from "./dropzone"

interface LandingHeroProps {
  /** Live Engine corpus counters — top-of-page credibility strip. */
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
}

/**
 * Landing law (every affordance here obeys it): a click resolves to exactly one
 * of three destinations — OPEN (a public surface that never asks for login),
 * UPLOAD (the golden CV path: score with no login, signup only on a degraded
 * parse), or SIGN UP (the auth modal, used ONLY where auth is the real intent).
 * Nothing on the landing points at an `(authed)` route, because that ejects a
 * logged-out visitor to /login — the surprise we refuse to ship.
 *
 * The two cards are audience doors, not steps — a visitor is one or the other,
 * never both in sequence. They carried "Path 01 / Path 02" until 2026-08-20;
 * the numbering asserted an order the reader doesn't have, which is the
 * numbered-marker tell (ANTI_SLOP.md). The eyebrow now names the reader.
 *
 * They split by whether a CV exists to score:
 *   - Switcher ("score my CV") → UPLOAD: opens the one hero dropzone's picker,
 *     the same stash → /cv-preview flow as dropping a file. No signup wall.
 *   - Fresher ("start the fresher route") → SIGN UP: a fresher has no CV to
 *     score; the account IS the onboarding stepper. This is the sanctioned gate.
 */
export function LandingHero({ jobsTracked, companiesMonitored, skillsMapped }: LandingHeroProps) {
  const signup = useSignupGate()
  const dzRef = useRef<LandingDropzoneHandle>(null)

  /** Open the auth gate, but let modifier / middle clicks follow the href so a
   *  user can still open /signup in a new tab. */
  const gate = (source: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
    event.preventDefault()
    signup.open({ surface: "manual", source })
  }

  /** Switcher → golden path: open the hero dropzone's picker instead of a gate. */
  const scoreMyCv = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    trackEvent("cv_upload_started", { source: "landing_path_switcher" })
    dzRef.current?.openFilePicker()
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
            <LandingDropzone ref={dzRef} variant="stage" source="landing_dropzone_hero">
              <Link className="lp-dz-alt" href="/intel">
                Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </LandingDropzone>
          </div>

          <div className="lp-path-cards">
            <article className="lp-path-card">
              <p className="lp-path-eyebrow">First job</p>
              <h3 className="lp-path-title">No experience yet</h3>
              <p className="lp-path-body">
                Myro maps the shortest route to your first offer, one skill at a time.
              </p>
              <a className="lp-path-link" href="/signup" onClick={gate("landing_path_fresher")}>
                start the fresher route <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </article>

            <article className="lp-path-card">
              <p className="lp-path-eyebrow">Switching</p>
              <h3 className="lp-path-title">2–8 years in</h3>
              <p className="lp-path-body">
                Score your CV against live openings, then tailor before you send.
              </p>
              <button type="button" className="lp-path-link" onClick={scoreMyCv}>
                score my CV <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}
