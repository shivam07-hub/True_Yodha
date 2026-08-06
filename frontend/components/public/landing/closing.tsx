"use client"

import { LandingDropzone } from "./dropzone"

/* Closing band. Held a 4-question FAQ accordion until 2026-08-06 — three of the
   four were already answered on /docs#faq, which owns the product FAQ and its
   FAQPage schema, so the accordion was duplicate text standing between the
   visitor and the final CTA. The dropzone is the point of this band. */
export function LandingClosing() {
  return (
    <section className="lp-closing-band" aria-label="Closing call to action">
      <div className="lp-wrap">
        <div className="lp-closing lp-reveal">
          <span className="lp-eyebrow">Start here</span>
          <p className="lp-closing-line">
            Ten minutes from now you&rsquo;ll have a scored, job-ready CV. Start there.
          </p>
          <LandingDropzone source="landing_dropzone_closing" />
        </div>
      </div>
    </section>
  )
}
