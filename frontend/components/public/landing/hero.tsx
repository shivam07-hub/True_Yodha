"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { trackEvent } from "@/lib/analytics"
import { LandingStats } from "./stats"
import { LandingDropzone, type LandingDropzoneHandle } from "./dropzone"
import { LEVEL_LABEL, RolePicker, roleLabel, type RolePick } from "./role-picker"

interface LandingHeroProps {
  /** Live Engine corpus counters — top-of-page credibility strip. */
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
}

/** Where an upload lands, carrying the job the visitor picked so the first
 *  screen after the score can read their CV against it (spec #66 Q8, L7). */
function uploadDestination(pick: RolePick | null): string {
  if (!pick) return "/cv-preview"
  const params = new URLSearchParams({ role: pick.family })
  if (pick.band) params.set("level", pick.band)
  return `/cv-preview?${params.toString()}`
}

/**
 * Spec #66 chapter 1. The job they want first (aspiration decides, Q1), then
 * their level (the six bands, Q6), then the CV. Every affordance obeys the
 * landing law: a click resolves to OPEN (a public surface) or UPLOAD (score with
 * no login). Nothing here points at an `(authed)` route.
 *
 * The two audience cards ("First job" / "Switching") left with this rewrite:
 * the level row is the same split, told in the six bands the product uses.
 */
export function LandingHero({ jobsTracked, companiesMonitored, skillsMapped }: LandingHeroProps) {
  const dzRef = useRef<LandingDropzoneHandle>(null)
  const [pick, setPick] = useState<RolePick | null>(null)

  function choose(next: RolePick) {
    setPick(next)
    trackEvent("landing_role_pick", { family: next.family, band: next.band ?? "none" })
  }

  function unsure() {
    trackEvent("cv_upload_started", { source: "landing_role_unsure" })
    dzRef.current?.openFilePicker()
  }

  const target = pick
    ? [roleLabel(pick.family), pick.band ? LEVEL_LABEL[pick.band] : null].filter(Boolean).join(" · ")
    : null

  return (
    <section className="lp-hero" aria-labelledby="landing-heading">
      <LandingStats
        jobsTracked={jobsTracked}
        companiesMonitored={companiesMonitored}
        skillsMapped={skillsMapped}
      />

      <div className="lp-wrap lp-hero-inner">
        <h1 className="lp-hero-h1" id="landing-heading">
          <span className="lp-hero-line">See what MNCs hire for.</span>
          <span className="lp-hero-line">
            <span className="lp-hero-quiet">Find your CV&apos;s gap </span>
            before they do.
          </span>
        </h1>

        <RolePicker pick={pick} onPick={choose} onUnsure={unsure} />

        <div className="lp-hero-start">
          <p className="lp-eyebrow lp-hero-start-eyebrow">
            {target ? `Your CV vs ${target}` : "Your CV"}
          </p>
          <LandingDropzone
            ref={dzRef}
            variant="stage"
            source="landing_dropzone_hero"
            destination={uploadDestination(pick)}
          >
            <Link className="lp-dz-alt" href="/intel">
              Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </LandingDropzone>
        </div>
      </div>
    </section>
  )
}
