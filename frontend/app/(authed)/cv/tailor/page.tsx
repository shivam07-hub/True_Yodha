/**
 * /cv/tailor — the unified per-job tailoring surface (CV journey, first slice).
 *
 * SHADOW: binds to TAILOR_FIXTURE (the projection engine isn't built). Lives here so
 * the design is reviewable in the real app shell; swapping to the live projection
 * endpoint later changes only the data source. Spec: project_cv_endtoend_journey.md.
 */
"use client"

import { TailorView } from "@/components/cv/builder/tailor-view"
import "../cv-fonts.css"
import "../cv-builder.css"

export default function TailorPage() {
  return (
    <div className="cvb-scope">
      <TailorView />
    </div>
  )
}
