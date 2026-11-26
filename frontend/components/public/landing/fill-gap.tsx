"use client"

import { SectionTitle } from "./section-title"
import { LandingFinlaticsRail } from "./finlatics-rail"

/** The prep ladder (UNIFIED_PREP_V2.md) in the words a candidate uses. */
const STEPS = ["Learn", "Prove", "Add to CV", "Interview prep"] as const

/**
 * Spec #66 chapter 5: what happens to a gap once it is found. The four steps
 * are a real order (you prove a skill before it goes on the CV), so they are
 * drawn as one line, not as peers. Finlatics' programmes close the chapter as
 * the place the first step happens.
 */
export function LandingFillGap() {
  return (
    <section className="lp-chapter" data-bridge-step aria-label="Fill the gap">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Add what&apos;s missing. Prepare for what they&apos;ll ask.</SectionTitle>
        </div>

        <ol className="lp-ladder">
          {STEPS.map((step) => (
            <li key={step} className="lp-ladder-step">
              {step}
            </li>
          ))}
        </ol>
      </div>

      <LandingFinlaticsRail />
    </section>
  )
}
