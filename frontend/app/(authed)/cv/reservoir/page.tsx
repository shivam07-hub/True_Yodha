/**
 * /cv/reservoir — Experience Reservoir inventory (v2 Phase 1, SHADOW).
 *
 * Renders the curatable career-inventory view against RESERVOIR_FIXTURE. No live
 * data yet (the cv_points read endpoint is a later phase) — this route exists so the
 * design is reviewable in the real app shell. Swapping to the live endpoint later
 * only changes ReservoirView's `data` source.
 *
 * Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
 */
"use client"

import { ReservoirView } from "@/components/cv/builder/reservoir-view"
import "../cv-fonts.css"
import "../cv-builder.css"

export default function ReservoirPage() {
  return (
    <div className="cvb-scope">
      <ReservoirView />
    </div>
  )
}
