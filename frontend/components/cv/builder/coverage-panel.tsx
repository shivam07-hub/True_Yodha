/**
 * CoveragePanel — the CV Playground v2 right-rail "Job fit" tab (Lane C).
 *
 * The map: every JD requirement classified against the user's career stories
 * AND the CV's own lines — covered / partial / missing. Replaces the old
 * taxonomy Skills tab (which read job_skills keyword buckets — garbage for
 * non-tech roles).
 *
 * TWO doors, and the free one leads. Every row here used to open Tailor with
 * Mentor — a 50-coin whole-CV weave — so a user looking at "12 missing" had no
 * move that cost nothing, even though the per-gap session was built and sitting
 * unmounted. Close gaps is the diagnosis: free, one gap at a time, and the only
 * path that reaches practice and claims a proven level. The weave stays as what
 * it is — the paid rewrite of the whole CV, for when you already know the gaps.
 */
"use client"

import type { JDCoverageResponse } from "@/lib/api"

const DOT: Record<string, string> = { covered: "✓", weak: "◐", gap: "" }

interface CoveragePanelProps {
  coverage: JDCoverageResponse | undefined
  loading: boolean
  error: boolean
  /** Free, per-gap. The lead action and where every row goes. */
  onOpenGaps: () => void
  /** Paid, whole-CV. Secondary by design — see the header note. */
  onOpenWeave: () => void
  onRetry: () => void
}

export function CoveragePanel({ coverage, loading, error, onOpenGaps, onOpenWeave, onRetry }: CoveragePanelProps) {
  if (loading) {
    return (
      <div className="cvb-cov">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="cvb-cov-skel" />)}
      </div>
    )
  }
  if (error) {
    return (
      <div className="cvb-cov cvb-cov-empty">
        <p>Couldn’t read this job’s requirements.</p>
        <button type="button" className="tw-btn tw-btn-ghost" onClick={onRetry}>Try again</button>
      </div>
    )
  }
  if (!coverage || coverage.requirements.length === 0) {
    return (
      <div className="cvb-cov cvb-cov-empty">
        <p>No requirements read for this job yet.</p>
      </div>
    )
  }

  return (
    <div className="cvb-cov">
      <div className="cvb-cov-summary">
        <span className="cvb-cov-stat" data-v="covered">{coverage.covered} covered</span>
        <span className="cvb-cov-stat" data-v="weak">{coverage.weak} partial</span>
        <span className="cvb-cov-stat" data-v="gap">{coverage.gap} missing</span>
      </div>
      <button type="button" className="tw-btn tw-btn-primary cvb-cov-cta" onClick={onOpenGaps}>
        Close gaps →
      </button>
      <button type="button" className="tw-btn tw-btn-ghost cvb-cov-cta" onClick={onOpenWeave}>
        Tailor with Mentor
      </button>
      <ul className="cvb-cov-list">
        {coverage.requirements.map((r, i) => (
          <li key={i}>
            <button type="button" className="cvb-cov-row" data-v={r.status} onClick={onOpenGaps}>
              <span className="tw-dot" data-v={r.status}>{DOT[r.status]}</span>
              <span className="cvb-cov-row-req">{r.requirement}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
