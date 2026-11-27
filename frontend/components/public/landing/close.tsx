"use client"

import { LandingDropzone } from "./dropzone"
import { SectionTitle } from "./section-title"
import { pickLabel, uploadDestination, type RolePick } from "./role-picker"

interface LandingCloseProps {
  /** The job picked in the hero, so a CV dropped here is read against it. */
  pick: RolePick | null
}

/**
 * Spec #66 chapter 7: the page ends where it started, on the one dropzone, for
 * a reader who scrolled the whole story before deciding. The last bridge step:
 * crossing it lights "The job you want".
 */
export function LandingClose({ pick }: LandingCloseProps) {
  return (
    <section className="lp-chapter lp-close" data-bridge-step aria-label="See your gap">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>See your gap. Free, no sign-up.</SectionTitle>
          {pick ? <p className="lp-section-sub">Your CV vs {pickLabel(pick)}</p> : null}
        </div>
        <LandingDropzone variant="stage" source="landing_dropzone_close" destination={uploadDestination(pick)} />
      </div>
    </section>
  )
}
