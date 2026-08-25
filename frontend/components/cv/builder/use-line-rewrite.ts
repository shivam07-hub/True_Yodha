/**
 * useLineRewrite — the one Mentor-rewrite state machine.
 *
 * Three copies of this loop shipped before the hierarchy redesign: BulletRewrite
 * (authed drawer), the rail's in-card rewrite, and PublicPlayground's own
 * RewriteModal. They drifted — the anon copy never learned `suggest_metric`, so
 * a logged-out user with a real number in a banked story was still asked to
 * invent one. The machine lives here now; the surface only decides how it looks
 * and where the request goes.
 *
 * No-fabrication (ADR-0016) is a property of the SERVER contract, preserved
 * here: a metric-less bullet returns `question` or `suggest_metric`, never an
 * invented number, and `quantifyOnly` removes the reframe escape so a Quantify
 * fix can only be closed by a real one.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface RewriteAngle {
  angle: string
  label: string
  text: string
  why?: string
}

export interface RewriteResult {
  mode: "variants" | "question" | "suggest_metric" | "error"
  variants: RewriteAngle[]
  question?: string | null
  rationale?: string | null
  /** A real number found in the user's OWN history — offered, never assumed. */
  candidateValue?: string | null
  candidateSource?: string | null
}

export type RewriteFetcher = (opts: {
  metric: string | null
  allowNoMetric: boolean
}) => Promise<RewriteResult>

export type RewritePhase = "loading" | "variants" | "question" | "suggest_metric" | "error"

export interface LineRewriteState {
  phase: RewritePhase
  variants: RewriteAngle[]
  selected: number
  question: string | null
  candidate: { value: string; source: string } | null
  error: string | null
  select: (index: number) => void
  /** Re-run with a real number the user typed, or with the offered candidate. */
  withMetric: (metric: string) => void
  /** Re-run allowing a reframe with no number. Hidden for Quantify fixes. */
  withoutMetric: () => void
  retry: () => void
  /** Leave the offered candidate and ask for the user's own number instead. */
  askInstead: () => void
}

export function useLineRewrite(fetcher: RewriteFetcher): LineRewriteState {
  const [phase, setPhase] = useState<RewritePhase>("loading")
  const [variants, setVariants] = useState<RewriteAngle[]>([])
  const [selected, setSelected] = useState(0)
  const [question, setQuestion] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<{ value: string; source: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Single-flight. The mount effect fires once, but Try again / Use this number
  // are buttons a user can double-tap, and a second call would race the first
  // into setState — last writer wins, and the answer shown might not be the
  // answer to the question last asked.
  const inFlight = useRef(false)
  // Re-ARMED on mount, not just initialised. A ref cleared in a cleanup is not
  // restored by the next mount, and React StrictMode (on by default in the Next
  // app router, dev only) runs mount -> cleanup -> mount: the first run fired,
  // the cleanup set this false, the re-mount was blocked by inFlight, and the
  // answer that eventually arrived was dropped against a component that was
  // very much alive. One request, permanently stuck on "loading", in dev only.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const run = useCallback(async (opts: { metric?: string; allowNoMetric?: boolean } = {}) => {
    if (inFlight.current) return
    inFlight.current = true
    setPhase("loading"); setError(null); setQuestion(null); setCandidate(null)
    try {
      const res = await fetcher({
        metric: opts.metric ?? null,
        allowNoMetric: opts.allowNoMetric ?? false,
      })
      // Unmounted mid-flight (the user closed the card): drop the answer rather
      // than writing state into a component that is gone.
      if (!alive.current) return
      if (res.mode === "variants" && res.variants.length > 0) {
        setVariants(res.variants); setSelected(0); setPhase("variants")
      } else if (res.mode === "suggest_metric" && res.candidateValue) {
        setCandidate({ value: res.candidateValue, source: res.candidateSource ?? "your story" })
        setQuestion(res.question ?? null)
        setPhase("suggest_metric")
      } else if (res.mode === "question") {
        setQuestion(res.question ?? "What was the measurable result?")
        setPhase("question")
      } else {
        setError(res.rationale ?? "Rewrite is unavailable right now.")
        setPhase("error")
      }
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : "Rewrite is unavailable. Try again.")
      setPhase("error")
    } finally {
      inFlight.current = false
    }
    // The fetcher closes over the bullet, which is fixed for the life of one
    // open rewrite — this component is mounted by the user pressing "Rewrite
    // with Mentor" and unmounted when they leave. Taking `fetcher` as a dep
    // would re-fire the model on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void run() }, [run])

  return {
    phase, variants, selected, question, candidate, error,
    select: setSelected,
    withMetric: (metric: string) => void run({ metric }),
    withoutMetric: () => void run({ allowNoMetric: true }),
    retry: () => void run(),
    askInstead: () => { setCandidate(null); setQuestion("What was the real number?"); setPhase("question") },
  }
}
