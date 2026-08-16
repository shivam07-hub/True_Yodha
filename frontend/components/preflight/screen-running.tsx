"use client"

/**
 * Screens 5 and 6 — running, then done.
 *
 * The four log lines are driven by the REAL job, not a timer: the server streams
 * its phase label and the per-job reveal, and the step advances when the work
 * does. A fake progress bar that finishes before the run is how a surface trains
 * people to distrust every other number on it.
 *
 * The panel holds a minimum height so the modal doesn't jump between steps.
 */

import { formatCount } from "@/lib/format"

const STEPS = [
  "Reading your signed-off order",
  "Scanning new roles",
  "Scoring against your CV baseline",
  "Ranking by fit",
] as const

/**
 * Which of the four lines the server's phase label lands on.
 *
 * Matched on words the backend actually emits rather than on an index it never
 * sends — a step counter the server doesn't own drifts the moment a phase is
 * renamed, and then the bar says "ranking" while the worker is still scanning.
 */
export function stepFromLabel(label: string | null, done: number | null, total: number | null): number {
  if (done != null && total != null && total > 0) return done >= total ? 3 : 2
  const text = (label ?? "").toLowerCase()
  if (/rank/.test(text)) return 3
  if (/scor|rate|evaluat|brain/.test(text)) return 2
  if (/scan|search|shortlist|fetch/.test(text)) return 1
  return 0
}

export function ScreenRunning({
  label,
  done,
  total,
  newJobs,
}: {
  label: string | null
  done: number | null
  total: number | null
  newJobs: number
}) {
  const step = stepFromLabel(label, done, total)
  const pct =
    done != null && total != null && total > 0
      ? Math.min(100, Math.round((done / total) * 100))
      : (step / STEPS.length) * 100

  return (
    <div className="pf-run">
      <div className="pf-run-track">
        <div className="pf-run-fill" style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
      <div role="status" aria-live="polite">
        {STEPS.map((text, i) => {
          const state = i < step ? "done" : i === step ? "current" : "pending"
          return (
            <div key={text} className="pf-run-line" data-state={state}>
              <span className="pf-run-mark" aria-hidden>
                {state === "done" ? "✓" : state === "current" ? "▸" : "·"}
              </span>
              <span>
                {i === 1 && newJobs > 0 ? `Scanning ${formatCount(newJobs)} new roles` : text}
              </span>
            </div>
          )
        })}
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
