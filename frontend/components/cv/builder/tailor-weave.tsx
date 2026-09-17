/**
 * TailorWeave — "Tailor with Mentor" for one job.
 *
 * Overlay opens on the loom. Interview POST fires once after coverage has
 * settled. Timeout is not an empty list — retry stays on the loom. A current
 * proposal skips to Accept. Each Take lands on the paper now (Google Docs).
 */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { cv as cvApi, type WeaveProposal } from "@/lib/api"
import { buildSteps } from "@/lib/cv/weave-steps"
import { useXPStore } from "@/store/xpStore"
import { WeaveLoom } from "./mentor-thinking"
import { TailorInterview } from "./tailor-interview"
import { useTailorGateRefresh } from "./use-tailor-gate"
import { useWeaveLanding } from "./use-weave-landing"
import { WeaveReview } from "./weave-review"

type Act = "loom" | "interview" | "review"

interface TailorWeaveProps {
  token: string
  jobId: string
  company: string
  jobTitle: string
  loomRoles: string[]
  cost?: number
  /** Playground coverage has a result — interview may share that cache. */
  coverageSettled: boolean
  coverageFailed?: boolean
  onRetryCoverage?: () => void
  /** What the paper says today — shown as the "was" on the extras card. */
  currentSummary?: string
  currentSkillsLine?: string
  onApplied: (versionId: number) => void
  onClose: () => void
}

export function TailorWeave({
  token, jobId, company, jobTitle, loomRoles, cost = 50,
  coverageSettled, coverageFailed = false, onRetryCoverage,
  currentSummary = "", currentSkillsLine = "",
  onApplied, onClose,
}: TailorWeaveProps) {
  const [act, setAct] = useState<Act>("loom")
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<WeaveProposal | null>(null)
  const [stale, setStale] = useState(false)
  const applyXpChange = useXPStore(s => s.applyXpChange)
  const weaveStarted = useRef(false)
  const seeded = useRef(false)

  const [qIdx, setQIdx] = useState(0)
  const [probe, setProbe] = useState<string | null>(null)
  const [answers, setAnswers] = useState<{ requirement: string; text: string }[]>([])

  const steps = useMemo(() => buildSteps(proposal), [proposal])
  const refreshTrackGate = useTailorGateRefresh()
  const landing = useWeaveLanding({
    token, jobId, steps,
    onApplied: versionId => { onApplied(versionId); refreshTrackGate() },
  })


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const existing = useQuery({
    queryKey: ["cv-weave", jobId],
    queryFn: () => cvApi.weave.get(token, jobId),
    staleTime: 30_000,
    retry: false,
  })

  const currentProposal = existing.data?.purchased && existing.data.proposal && !existing.data.stale
    ? existing.data.proposal
    : null
  const staleDraft = Boolean(existing.data?.purchased && existing.data.stale)

  useEffect(() => {
    if (seeded.current || !existing.isSuccess || !currentProposal) return
    seeded.current = true
    setProposal(currentProposal)
    setStale(false)
    landing.seed({
      steps: buildSteps(currentProposal),
      acceptedRoles: existing.data.accepted_roles ?? [],
      decidedRoles: existing.data.decided_roles ?? [],
      extrasDecided: Boolean(existing.data.extras_decided),
    })
    setAct("review")
  }, [existing.isSuccess, currentProposal, existing.data, landing])

  const interview = useQuery({
    queryKey: ["cv-weave-interview", jobId],
    queryFn: () => cvApi.weave.interview(token, jobId),
    enabled: coverageSettled && !coverageFailed && existing.isFetched
      && !currentProposal && !staleDraft && act !== "review",
    staleTime: 60_000,
    retry: false,
  })
  const questions = interview.data?.questions ?? []

  const runWeave = useMutation({
    mutationFn: (opts: { refresh: boolean }) => cvApi.weave.run(token, jobId, answers, opts),
    onMutate: () => { setError(null); setAct("loom") },
    onSuccess: res => {
      if (res.new_coin_balance != null && !res.cached) {
        applyXpChange({ newBalance: res.new_coin_balance, action: "cv_weave" })
      }
      setProposal(res.proposal)
      setStale(res.stale)
      landing.reset()
      setAct("review")
    },
    onError: (e: Error) => {
      setError(e.message)
      setAct("loom")
    },
  })

  const bankAnswer = useMutation({
    mutationFn: (body: { requirement: string; answer: string; final: boolean }) =>
      cvApi.weave.answer(token, { requirement: body.requirement, answer: body.answer, jobId, final: body.final }),
  })

  const weaveMutate = runWeave.mutate
  const weaving = runWeave.isPending

  useEffect(() => {
    if (currentProposal || act === "review") return
    if (coverageFailed) {
      setError("Could not read this job. Retry from here.")
      return
    }
    if (!coverageSettled || !existing.isFetched) return
    if (staleDraft) {
      if (!weaveStarted.current && !weaving) {
        weaveStarted.current = true
        weaveMutate({ refresh: true })
      }
      return
    }
    if (interview.isError) {
      const msg = interview.error instanceof Error ? interview.error.message : "Could not read this job."
      setError(msg)
      return
    }
    if (!interview.isSuccess) return
    if (interview.data.questions.length > 0) {
      setAct("interview")
      return
    }
    if (!weaveStarted.current && !weaving) {
      weaveStarted.current = true
      weaveMutate({ refresh: false })
    }
  }, [
    coverageSettled, coverageFailed, currentProposal, staleDraft,
    existing.isFetched, interview.isSuccess, interview.isError, interview.data,
    interview.error, act, weaving, weaveMutate,
  ])


  const loomLines = useMemo(() => [
    "Reading the job's language",
    "Matching your banked stories",
    ...loomRoles.slice(0, 4).map(r => `Weaving ${r}`),
    "Checking every number survives",
  ], [loomRoles])

  function advanceInterview() {
    setProbe(null)
    if (qIdx >= questions.length - 1) {
      weaveStarted.current = true
      runWeave.mutate({ refresh: stale })
    } else setQIdx(i => i + 1)
  }

  function submitAnswer(text: string, final: boolean) {
    const q = questions[qIdx]
    if (!q || text.length < 12 || bankAnswer.isPending) return
    bankAnswer.mutate({ requirement: q.requirement, answer: text, final }, {
      onSuccess: res => {
        if (res.follow_up && !final) { setProbe(res.follow_up); return }
        setAnswers(prev => [...prev, { requirement: q.requirement, text }])
        advanceInterview()
      },
      onError: () => {
        setAnswers(prev => [...prev, { requirement: q.requirement, text }])
        advanceInterview()
      },
    })
  }

  function retryLoom() {
    setError(null)
    weaveStarted.current = false
    if (coverageFailed) onRetryCoverage?.()
    else if (interview.isError) void interview.refetch()
    else runWeave.mutate({ refresh: staleDraft || stale })
  }

  const q = questions[qIdx]
  const skipLabel = qIdx >= questions.length - 1 ? `Skip & weave · ${cost}` : "Skip"

  return (
    <div className="tw-backdrop" role="dialog" aria-modal="true" aria-label="Tailor with Mentor" onClick={onClose}>
      <div className="tw-modal" data-act={act} onClick={e => e.stopPropagation()}>
        <div className="tw-head">
          <span className="tw-head-title">Tailor with Mentor</span>
          <span className="tw-head-job">{jobTitle || "This job"} · {company}</span>
          <button type="button" className="tw-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="tw-stage">
          {act === "loom" && (
            <>
              <WeaveLoom lines={loomLines} settled={!runWeave.isPending && !interview.isFetching && coverageSettled && !coverageFailed} />
              {error && (
                <div className="tw-loom-retry">
                  <p className="tw-err" role="alert">{error}</p>
                  <button type="button" className="tw-btn tw-btn-primary" onClick={retryLoom}>Retry</button>
                </div>
              )}
            </>
          )}

          {act === "interview" && q && (
            <TailorInterview
              key={qIdx}
              question={q}
              index={qIdx}
              total={questions.length}
              banking={bankAnswer.isPending}
              skipLabel={skipLabel}
              probe={probe}
              onSubmit={submitAnswer}
              onSkip={advanceInterview}
            />
          )}

          {act === "review" && proposal && (
            <WeaveReview
              steps={steps}
              idx={landing.idx}
              originals={landing.originals}
              currentSummary={currentSummary}
              currentSkillsLine={currentSkillsLine}
              error={error ?? landing.error}
              onToggleOriginal={landing.toggleOriginal}
              onDecide={landing.decide}
              onBack={landing.undoLast}
              onDone={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
