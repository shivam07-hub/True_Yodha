/**
 * Playground adapter for Tailor Order landing.
 *
 * Header, ?mentor=1, and the Skills-map row all enter through here.
 * The step machine stays in tailor-order.ts — this file only fetches
 * the facts and opens the overlay landingStep named.
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cv as cvApi, emitLoopStep } from "@/lib/api"
import {
  autoOpens,
  factsFromGet,
  landingStep,
  overlayFor,
  willCharge,
  type TailorOverlay,
} from "@/lib/cv/tailor-order"

const WEAVE_COST = 50

// Per job, per browser: this person was already shown Mentor on arrival.
// Storage can be blocked; then it simply opens again on the next visit.
const autoKey = (jobId: string) => `myro-mentor-auto:${jobId}`

function seenAuto(jobId: string): boolean {
  try {
    return localStorage.getItem(autoKey(jobId)) === "1"
  } catch {
    return false
  }
}

function markAuto(jobId: string) {
  try {
    localStorage.setItem(autoKey(jobId), "1")
  } catch {
    /* storage blocked — opens again next visit, which is the safe side */
  }
}

export function useTailorLanding(opts: {
  token: string
  jobId: string
  closableGaps: number | null
  mentorRequested: boolean
}) {
  const weaveGet = useQuery({
    queryKey: ["cv-weave", opts.jobId],
    queryFn: () => cvApi.weave.get(opts.token, opts.jobId),
    staleTime: 30_000,
  })
  const facts = factsFromGet(weaveGet.data, opts.closableGaps)
  const step = landingStep(facts)
  const ready =
    weaveGet.isSuccess &&
    (facts.proposal === "stale" || !facts.acceptComplete || opts.closableGaps !== null)

  const [overlay, setOverlay] = useState<TailorOverlay>(null)
  const [focusGap, setFocusGap] = useState<string | null>(null)
  const mentorOpened = useRef(false)
  useEffect(() => {
    if (mentorOpened.current || !ready) return
    // A link asked for Mentor, or this job's CV was never tailored and this
    // person has not been shown it here yet (tailor-order autoOpens).
    const auto = !opts.mentorRequested && autoOpens(facts, seenAuto(opts.jobId))
    if (!opts.mentorRequested && !auto) return
    mentorOpened.current = true
    if (auto) markAuto(opts.jobId)
    setFocusGap(null)
    const next = overlayFor(step)
    if (next) emitLoopStep(opts.token, "mentor_opened", opts.jobId, auto ? "auto" : "link")
    setOverlay(next)
  }, [opts.mentorRequested, ready, step, facts, opts.token, opts.jobId])

  const showLead = !(ready && step === "paper")
  const leadCost = ready && willCharge(step) ? WEAVE_COST : undefined

  return {
    overlay,
    focusGap,
    showLead,
    leadCost,
    onHeader: () => {
      const next = overlayFor(weaveGet.isSuccess ? step : "proof")
      setFocusGap(null)
      if (next) {
        emitLoopStep(opts.token, "mentor_opened", opts.jobId, "cv_header")
        setOverlay(next)
      }
    },
    openGapsMap: (requirement?: string) => {
      setFocusGap(requirement ?? null)
      setOverlay("gaps")
    },
    close: () => {
      setOverlay(null)
      setFocusGap(null)
    },
    refresh: () => { void weaveGet.refetch() },
  }
}
