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
import { cv as cvApi } from "@/lib/api"
import {
  factsFromGet,
  landingStep,
  overlayFor,
  willCharge,
  type TailorOverlay,
} from "@/lib/cv/tailor-order"

const WEAVE_COST = 50

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
    if (!opts.mentorRequested || mentorOpened.current || !ready) return
    mentorOpened.current = true
    setFocusGap(null)
    setOverlay(overlayFor(step))
  }, [opts.mentorRequested, ready, step])

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
      if (next) setOverlay(next)
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
