"use client"

import { SectionTitle } from "./section-title"
import { LandingUploadButton } from "./upload-button"
import { uploadDestination, type RolePick } from "./role-picker"

interface LandingGapExampleProps {
  /** Rides the upload only. The example itself is fixed, so it reads the same
   *  whatever was picked above (spec #66: every chapter stands alone). */
  pick: RolePick | null
}

/**
 * Spec #66 chapter 4: what Myro reads in a CV, shown on one labelled example.
 * The three rows are the gap kinds in `gap_planner.py`: a skill the CV already
 * shows, one it has but undersells (latent: rewrite the line), one it lacks
 * (absent: build it). The before and after carry the rewrite; no sentence
 * explains it.
 */
export function LandingGapExample({ pick }: LandingGapExampleProps) {
  return (
    <section className="lp-chapter" data-bridge-step aria-label="Example: a CV read against a job">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Your CV, read against the job</SectionTitle>
          <p className="lp-section-sub">Example · Data Analyst, 0–2 yrs</p>
        </div>

        <dl className="lp-gap">
          <div className="lp-gap-row" data-kind="matched">
            <dt>Matched</dt>
            <dd>Excel · SQL</dd>
          </div>
          <div className="lp-gap-row" data-kind="rewrite">
            <dt>Rewrite</dt>
            <dd>
              <del className="lp-gap-before">Handled reports for sales team</del>
              <ins className="lp-gap-after">Built weekly SQL sales reports for 12 regional managers</ins>
            </dd>
          </div>
          <div className="lp-gap-row" data-kind="missing">
            <dt>Missing</dt>
            <dd>Power BI</dd>
          </div>
        </dl>

        <div className="lp-chapter-action">
          <LandingUploadButton source="landing_gap_example" destination={uploadDestination(pick)}>
            Upload CV
          </LandingUploadButton>
        </div>
      </div>
    </section>
  )
}
