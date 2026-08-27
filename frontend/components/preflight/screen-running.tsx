"use client"

/**
 * Screens 5 and 6 — running, then done.
 *
 * The wait's job is to show that ranking is moving, then hand over the matches.
 * The count is the thesis. The tape is the last few jobs, latest first. No pin,
 * no restaged hero, no contract from a screen that is no longer visible.
 *
 * Progress is the Job Refresh lifecycle (ADR-0009: `queued` → `computing` →
 * `done`) plus the per-job reveal the server streams. The queued state still
 * occupies the count slot (`0 of —`) so the frame never collapses into a hole.
 */

import { useMemo } from "react"

import { formatCount } from "@/lib/format"
import type { RevealedJob } from "@/lib/hooks/use-job-refresh"

/* CSS is loaded at the shell (`preflight-gate.tsx` imports `./screen-running.css`).
   Keeping this component free of side-effect CSS imports lets the node test
   runner render it via `renderToStaticMarkup` without a CSS transform. */

const TAPE_LIMIT = 4

function readable(job: RevealedJob | null | undefined): job is RevealedJob {
  return Boolean(job && (job.title || job.company))
}

function labelOf(job: RevealedJob): string {
  return [job.company, job.title].filter(Boolean).join(" · ")
}

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
  const jobs = useMemo(() => revealed.filter(readable), [revealed])
  const tape = useMemo(() => jobs.slice(-TAPE_LIMIT).reverse(), [jobs])

  const counted = done ?? 0
  const ofLabel = total != null && total > 0 ? `of ${formatCount(total)}` : "of —"
  const status =
    label ??
    (lifecycle === "queued" ? "Waiting to start" : "Ranking with Myro")

  return (
    <div className="pf-run" role="status" aria-live="polite" aria-label={status}>
      <div className="pf-run-count">
        <span className="pf-run-count-num">{formatCount(counted)}</span>
        <span className="pf-run-count-of">{ofLabel}</span>
      </div>

      {tape.length > 0 ? (
        <ul className="pf-run-tape" aria-label="Just ranked">
          {tape.map((job, i) => (
            <li
              key={`${jobs.length - i}:${labelOf(job)}`}
              className="pf-run-tape-item"
              data-age={i}
            >
              {labelOf(job)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function ScreenDone({
  matches,
  onSeeMatches,
  onRunAgain,
}: {
  matches: number
  onSeeMatches: () => void
  onRunAgain: () => void
}) {
  return (
    <>
      <div className="pf-signed">Run complete</div>
      <div className="pf-numbers">
        <div>
          <div className="pf-numeral">{formatCount(matches)}</div>
          <div className="pf-numeral-label">matches</div>
        </div>
      </div>
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
