/**
 * CoveragePanel — the CV Playground v2 right-rail "Job fit" tab (Lane C).
 *
 * The map: every JD requirement classified against the user's career stories
 * AND the CV's own lines — covered / partial / missing. Replaces the old
 * taxonomy Skills tab (which read job_skills keyword buckets — garbage for
 * non-tech roles).
 *
 * A map, not a door. Covered / partial / missing. Tapping a row closes that
 * gap on the paper (enter at that Line). The named verb Tailor with Mentor
 * lives once, on the playground header — not here.
 */
"use client"

import type { JDCoverageResponse } from "@/lib/api"

const DOT: Record<string, string> = { covered: "✓", weak: "◐", gap: "" }

interface CoveragePanelProps {
  coverage: JDCoverageResponse | undefined
  loading: boolean
  error: boolean
  /** Closes that missing/partial row — the Skills-map seam, not a second verb. */
  onOpenGaps: (requirement: string) => void
  onRetry: () => void
}

export function CoveragePanel({ coverage, loading, error, onOpenGaps, onRetry }: CoveragePanelProps) {
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
      <ul className="cvb-cov-list">
        {coverage.requirements.map((r, i) => (
          <li key={i}>
            {r.status === "covered" ? (
              <div className="cvb-cov-row is-static" data-v={r.status}>
                <span className="tw-dot" data-v={r.status}>{DOT[r.status]}</span>
                <span className="cvb-cov-row-req">{r.requirement}</span>
              </div>
            ) : (
              <button
                type="button"
                className="cvb-cov-row"
                data-v={r.status}
                onClick={() => onOpenGaps(r.requirement)}
              >
                <span className="tw-dot" data-v={r.status}>{DOT[r.status]}</span>
                <span className="cvb-cov-row-req">{r.requirement}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
