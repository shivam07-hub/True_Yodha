"use client"

/**
 * Screens 5 and 6 — running, then done.
 *
 * Progress is the Job Refresh lifecycle (ADR-0009: `queued` → `computing` →
 * `done`) plus the per-job reveal the server streams. The old screen showed only
 * the LAST revealed job under a bar — real ranking work arrived at the client
 * and was discarded frame after frame. This one keeps the last few in view.
 *
 * Layout, top to bottom:
 *   1. server phase label (never a phase the refresh did not enter)
 *   2. shuffle-pinned hero — the job Myro is reading right now
 *   3. stack — the last few, fading with age
 *   4. count — small, tabular ("12 of 200")
 *   5. contract line — pinned; the signed-off promise this run is executing
 *
 * The queued state is honest: no hero, no count, just the label saying what it
 * is waiting for. Motion respects `prefers-reduced-motion`.
 */

import { useMemo } from "react"
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Transition,
} from "motion/react"
import { Pin } from "lucide-react"

import { formatCount } from "@/lib/format"
import type { RevealedJob } from "@/lib/hooks/use-job-refresh"

/* CSS is loaded at the shell (`preflight-gate.tsx` imports `./screen-running.css`).
   Keeping this component free of side-effect CSS imports lets the node test
   runner render it via `renderToStaticMarkup` without a CSS transform. */

/** Same dialect as `shuffle-guess-list` — one motion vocabulary across the surface. */
const spring: Transition = { type: "spring", stiffness: 400, damping: 40 }

/** Behind the hero. Four rows keeps the last ~5 seconds legible on the p95
 *  ranking throughput without pushing the contract line below the fold. */
const STACK_LIMIT = 4

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
  contract,
}: {
  lifecycle: "queued" | "computing"
  label: string | null
  done: number | null
  total: number | null
  revealed: RevealedJob[]
  /** The signed-off order's contract line. Pinned at the bottom so the user
   *  can always read what this run is actually executing on. */
  contract: string | null
}) {
  const ranking = done != null && total != null && total > 0

  /** Filter defensively — the SSE hook filters too, but the wait screen has no
   *  business rendering an empty ranked row if a future producer forgets. */
  const jobs = useMemo(() => revealed.filter(readable), [revealed])
  const hero = jobs.length > 0 ? jobs[jobs.length - 1] : null

  /** The last few *behind* the hero, most-recent first. Cap at STACK_LIMIT. */
  const stack = useMemo(() => {
    if (jobs.length <= 1) return [] as RevealedJob[]
    const start = Math.max(0, jobs.length - 1 - STACK_LIMIT)
    return jobs.slice(start, jobs.length - 1).reverse()
  }, [jobs])

  const status =
    label ??
    (lifecycle === "queued" ? "Waiting to start" : "Ranking with Myro")

  return (
    <MotionConfig transition={spring}>
      <div className="pf-run" role="status" aria-live="polite">
        <div className="pf-run-status" data-lifecycle={lifecycle}>
          {status}
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {hero ? (
            <motion.div
              key="hero"
              layout
              className="pf-run-hero"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
            >
              <Pin
                className="pf-run-hero-pin"
                aria-hidden
                fill="currentColor"
              />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${jobs.length}:${labelOf(hero)}`}
                  className="pf-run-hero-copy"
                  initial={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                  transition={{ duration: 0.35, type: "spring", bounce: 0 }}
                >
                  <div className="pf-run-hero-title">
                    {hero.title ?? hero.company}
                  </div>
                  {hero.title && hero.company ? (
                    <div className="pf-run-hero-company">{hero.company}</div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {stack.length > 0 ? (
          <motion.ul
            layout
            className="pf-run-stack"
            aria-label="Just read"
          >
            <AnimatePresence initial={false}>
              {stack.map((job, i) => (
                <motion.li
                  layout
                  key={`${jobs.length - 1 - i}:${labelOf(job)}`}
                  className="pf-run-stack-item"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: Math.max(0.24, 1 - (i + 1) * 0.18), y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                >
                  <span className="pf-run-stack-mark" aria-hidden>
                    ·
                  </span>
                  <span className="pf-run-stack-text">{labelOf(job)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : null}

        {ranking ? (
          <div className="pf-run-count">
            <span className="pf-run-count-num">{formatCount(done)}</span>
            <span className="pf-run-count-sep" aria-hidden> · </span>
            <span className="pf-run-count-of">of {formatCount(total)}</span>
          </div>
        ) : null}

        {contract ? <p className="pf-contract">{contract}</p> : null}
      </div>
    </MotionConfig>
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
            <div className="pf-numeral-label">ranked against your CV</div>
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
