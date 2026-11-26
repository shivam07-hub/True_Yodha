"use client"

import { useRef } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { trackEvent } from "@/lib/analytics"
import { LandingDropzone, type LandingDropzoneHandle } from "./dropzone"
import { RolePicker, pickLabel, uploadDestination, type RolePick } from "./role-picker"

interface LandingHeroProps {
  /** The job the visitor picked. Owned by the landing page, because chapters 2
   *  and 3 read it too (spec #66). */
  pick: RolePick | null
  onPick: (pick: RolePick) => void
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
export function LandingHero({ pick, onPick }: LandingHeroProps) {
  const dzRef = useRef<LandingDropzoneHandle>(null)

  function choose(next: RolePick) {
    onPick(next)
    trackEvent("landing_role_pick", { family: next.family, band: next.band ?? "none" })
  }

  function unsure() {
    trackEvent("cv_upload_started", { source: "landing_role_unsure" })
    dzRef.current?.openFilePicker()
  }

  return (
    <section className="lp-hero" aria-labelledby="landing-heading" data-bridge-step>
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
            {pick ? `Your CV vs ${pickLabel(pick)}` : "Your CV"}
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
