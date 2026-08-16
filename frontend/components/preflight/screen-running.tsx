"use client"

/**
 * Screens 5 and 6 — running, then done.
 *
 * Progress is the Job Refresh lifecycle plus the per-job reveal the server
 * actually streams. A queued ticket is waiting; ranking counts are N of M.
 */

import { formatCount } from "@/lib/format"
import type { RevealedJob } from "@/lib/hooks/use-job-refresh"

export function ScreenRunning({
  lifecycle,
  label,
  done,
  total,
  revealed,
}: {
  lifecycle: "queued" | "computing"
  label: string | null
  done: number | null
  total: number | null
  revealed: RevealedJob[]
}) {
  const ranking = done != null && total != null && total > 0
  const pct = ranking ? Math.min(100, Math.round((done / total) * 100)) : 0
  const latest = revealed.length > 0 ? revealed[revealed.length - 1] : null
  const latestText = latest
    ? [latest.company, latest.title].filter(Boolean).join(" · ")
    : null
  const status = ranking
    ? `Ranking ${formatCount(done)} of ${formatCount(total)}`
    : (label ?? (lifecycle === "queued" ? "Waiting to start" : "Ranking with Myro"))

  return (
    <div className="pf-run">
      <div className="pf-run-track">
        <div className="pf-run-fill" style={{ width: `${pct}%` }} />
      </div>
      <div role="status" aria-live="polite">
        <div className="pf-run-line" data-state="current">
          <span className="pf-run-mark" aria-hidden>▸</span>
          <span>{status}</span>
        </div>
        {latestText ? (
          <div className="pf-run-line" data-state="done">
            <span className="pf-run-mark" aria-hidden>·</span>
            <span>{latestText}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ScreenDone({
  matches,
  scanned,
  onSeeMatches,
  onRunAgain,
}: {
  matches: number
  scanned: number
  onSeeMatches: () => void
  onRunAgain: () => void
}) {
  return (
    <>
      <div className="pf-signed">Run complete</div>
      <div className="pf-numbers">
        <div>
          <div className="pf-numeral">{formatCount(matches)}</div>
          <div className="pf-numeral-label">strong matches</div>
        </div>
        {scanned > 0 ? (
          <div>
            <div className="pf-numeral">{formatCount(scanned)}</div>
            <div className="pf-numeral-label">scanned against your CV</div>
          </div>
        ) : null}
      </div>
      <p className="pf-sub">
        Myro used exactly what you signed off on. Nothing you left unanswered was
        applied — if the results feel off, tell Myro from the market and
        it&apos;ll propose a change.
      </p>
      <div className="pf-chips">
        <button type="button" className="pf-btn pf-btn-primary tm-control-focus" onClick={onSeeMatches}>
          See {formatCount(matches)} matches
        </button>
        <button type="button" className="pf-btn pf-btn-outline tm-control-focus" onClick={onRunAgain}>
          Run it again
        </button>
      </div>
    </>
  )
}
