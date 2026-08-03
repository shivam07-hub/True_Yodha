"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, LoaderCircle, TriangleAlert, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"

const PHASES: Record<string, string> = {
  queued: "Preparing your analysis",
  reading: "Reading your CV",
  finding_skills: "Extracting your skills",
  structuring_cv: "Preparing your CV review",
  scoring: "Calculating your Myro Score",
  reconnecting: "Reconnecting to your analysis",
}

// A phase that has not changed for this long is not "slow", it is stuck: the
// pipeline advances in seconds, and one signup sat on "Calculating your Myro
// Score" for minutes while the job that would have produced it had already been
// dropped. Silence and progress must not look the same.
const SLOW_MS = 40_000
const STALLED_MS = 100_000

interface Props {
  phase: string
  /** Re-poll now. Absent when the caller has nothing to retry. */
  onRetry?: () => void
}

export function AnalysisProgress({ phase, onRetry }: Props) {
  const [elapsed, setElapsed] = useState(0)
  // Elapsed is measured per PHASE, not per mount: a pipeline that keeps moving
  // resets the clock, so only a phase that genuinely stops trips the warning.
  const startedAt = useRef(Date.now())
  useEffect(() => {
    startedAt.current = Date.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 1_000)
    return () => clearInterval(id)
  }, [phase])

  const stalled = elapsed >= STALLED_MS
  const slow = elapsed >= SLOW_MS && !stalled
  const reconnecting = phase === "reconnecting"
  const Icon = stalled ? TriangleAlert : reconnecting ? Wifi : LoaderCircle

  return (
    <section className="flex min-h-[55dvh] w-full max-w-lg flex-col items-center justify-center text-center" role="status" aria-live="polite">
      <span
        className={`flex size-12 items-center justify-center rounded-full border bg-[var(--tm-surface)] ${
          stalled
            ? "border-[var(--tm-border)] text-[var(--tm-text-muted)]"
            : "border-[var(--tm-border)] text-[var(--tm-interactive)]"
        }`}
      >
        <Icon className={`size-5 ${stalled || reconnecting ? "" : "animate-spin"}`} aria-hidden="true" />
      </span>

      <h1 className="mt-5 text-balance text-2xl font-semibold tracking-normal text-[var(--tm-text)]">
        {stalled ? "This is taking longer than it should" : PHASES[phase] ?? "Building your result"}
      </h1>

      <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">
        {stalled
          ? `Your CV is saved and nothing is lost. Myro is still on “${(PHASES[phase] ?? "this step").toLowerCase()}” — check again, or carry on and come back.`
          : slow
            ? "Still working — this one is slower than usual."
            : "Myro will keep working if you browse jobs."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {stalled && onRetry && (
          <Button size="lg" onClick={onRetry}>Check again</Button>
        )}
        <a
          href="/market"
          target="_blank"
          // The destination is this same Myro origin. `opener` deliberately keeps
          // the browser's initial sessionStorage clone, so an in-progress CV
          // upload can be browsed in a new tab without making the user sign in
          // again. Do not use this relationship for an external link.
          rel="opener"
          className="tm-control-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] px-5 text-sm font-semibold text-[var(--tm-interactive-rest)] transition-colors hover:bg-[var(--tm-surface-hover)]"
        >
          {stalled ? "Browse jobs meanwhile" : "Browse jobs while Myro works"}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
