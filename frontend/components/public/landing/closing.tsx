"use client"

import { LandingDropzone } from "./dropzone"

export function LandingClosing() {
  return (
    <section className="lp-closing-band" aria-label="Closing call to action">
      <div className="lp-wrap">
        <div className="lp-closing">
          <h2 className="lp-closing-line">Start with your CV.</h2>
          <LandingDropzone source="landing_dropzone_closing" />
        </div>
      </div>
    </section>
  )
}
