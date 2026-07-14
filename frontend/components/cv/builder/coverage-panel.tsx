/**
 * CoveragePanel — the CV Playground v2 right-rail "Job fit" tab (Lane C).
 *
 * The map for the Mentor walk: every JD requirement classified against the
 * user's career stories — covered / partial / missing. The primary action opens
 * the guided walk; a row opens it at that ask. Replaces the old taxonomy Skills
 * tab (which read job_skills keyword buckets — garbage for non-tech roles).
 */
"use client"

import type { JDCoverageResponse } from "@/lib/api"

const DOT: Record<string, string> = { covered: "✓", weak: "◐", gap: "" }

interface CoveragePanelProps {
  coverage: JDCoverageResponse | undefined
  loading: boolean
  error: boolean
  onOpenWalk: (atIndex?: number) => void
  onRetry: () => void
}

export function CoveragePanel({ coverage, loading, error, onOpenWalk, onRetry }: CoveragePanelProps) {
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
        <button type="button" className="mw-btn mw-btn-ghost" onClick={onRetry}>Try again</button>
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
      <button type="button" className="mw-btn mw-btn-primary cvb-cov-cta" onClick={() => onOpenWalk()}>
        Fix your CV with Mentor →
      </button>
      <ul className="cvb-cov-list">
        {coverage.requirements.map((r, i) => (
          <li key={i}>
            <button type="button" className="cvb-cov-row" data-v={r.status} onClick={() => onOpenWalk(i)}>
              <span className="mw-dot" data-v={r.status}>{DOT[r.status]}</span>
              <span className="cvb-cov-row-req">{r.requirement}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
