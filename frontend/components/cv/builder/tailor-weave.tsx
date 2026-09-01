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
import { firstUndecidedIndex } from "@/lib/cv/tailor-order"
import { useXPStore } from "@/store/xpStore"
import { WeaveLoom } from "./mentor-thinking"
import { TailorInterview } from "./tailor-interview"
import { useTailorGateRefresh } from "./use-tailor-gate"
import { WeaveRoleCard } from "./weave-role-card"

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
  onApplied: (versionId: number) => void
  onClose: () => void
}

export function TailorWeave({
  token, jobId, company, jobTitle, loomRoles, cost = 50,
  coverageSettled, coverageFailed = false, onRetryCoverage,
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

  const [rIdx, setRIdx] = useState(0)
  const [acceptedIds, setAcceptedIds] = useState<number[]>([])
  const [decidedIds, setDecidedIds] = useState<number[]>([])
  const [originals, setOriginals] = useState<Set<number>>(() => new Set())

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
    const dec = existing.data.decided_roles ?? []
    setProposal(currentProposal)
    setStale(false)
    setAcceptedIds(existing.data.accepted_roles ?? [])
    setDecidedIds(dec)
    setRIdx(firstUndecidedIndex(
      currentProposal.roles.filter(r => r.changed).map(r => r.role_index),
      dec,
    ))
    setAct("review")
  }, [existing.isSuccess, currentProposal, existing.data])

  const interview = useQuery({
    queryKey: ["cv-weave-interview", jobId],
    queryFn: () => cvApi.weave.interview(token, jobId),
    enabled: coverageSettled && !coverageFailed && existing.isFetched
      && !currentProposal && !staleDraft && act !== "review",
    staleTime: 60_000,
    retry: false,
  })
  const questions = interview.data?.questions ?? []

  const refreshTrackGate = useTailorGateRefresh()

  const runWeave = useMutation({
    mutationFn: (opts: { refresh: boolean }) => cvApi.weave.run(token, jobId, answers, opts),
    onMutate: () => { setError(null); setAct("loom") },
    onSuccess: res => {
      if (res.new_coin_balance != null && !res.cached) {
        applyXpChange({ newBalance: res.new_coin_balance, action: "cv_weave" })
      }
      setProposal(res.proposal)
      setStale(res.stale)
      setRIdx(0); setAcceptedIds([]); setDecidedIds([]); setOriginals(new Set())
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

  const applyWeave = useMutation({
    mutationFn: (land: {
      accepted: number[]
      decided: number[]
      roleIndex: number
      action: "take" | "keep" | "undo"
      originalPointers: number[]
      close: boolean
    }) =>
      cvApi.weave.apply(token, jobId, land.accepted, {
        decidedRoles: land.decided,
        roleIndex: land.roleIndex,
        action: land.action,
        originalPointers: land.originalPointers,
      }),
    onSuccess: (res, land) => {
      onApplied(res.version_id)
      refreshTrackGate()
      setAcceptedIds(land.accepted)
      setDecidedIds(land.decided)
      if (land.close) onClose()
      else if (land.action === "undo") setRIdx(i => Math.max(0, i - 1))
      else setRIdx(i => i + 1)
    },
    onError: (e: Error) => setError(e.message),
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

  useEffect(() => { setOriginals(new Set()) }, [rIdx])

  const changedRoles = useMemo(() => (proposal?.roles ?? []).filter(r => r.changed), [proposal])

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

  function decide(action: "take" | "keep") {
    const role = changedRoles[rIdx]
    if (!role || applyWeave.isPending) return
    const accepted = action === "take"
      ? [...acceptedIds.filter(i => i !== role.role_index), role.role_index]
      : acceptedIds.filter(i => i !== role.role_index)
    const decided = [...decidedIds.filter(i => i !== role.role_index), role.role_index]
    applyWeave.mutate({
      accepted, decided, roleIndex: role.role_index, action,
      originalPointers: action === "take" ? Array.from(originals) : [],
      close: rIdx >= changedRoles.length - 1,
    })
  }

  function undoLast() {
    if (rIdx <= 0 || applyWeave.isPending) return
    const prev = changedRoles[rIdx - 1]
    applyWeave.mutate({
      accepted: acceptedIds.filter(i => i !== prev.role_index),
      decided: decidedIds.filter(i => i !== prev.role_index),
      roleIndex: prev.role_index,
      action: "undo",
      originalPointers: [],
      close: false,
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

          {act === "review" && proposal && changedRoles[rIdx] && (
            <div className="tw-review">
              <div className="tw-review-strip mono" aria-label="Roles">
                {changedRoles.map((r, i) => (
                  <span key={r.role_index} className="tw-review-dot" data-state={i < rIdx ? "done" : i === rIdx ? "now" : "todo"} />
                ))}
                <span className="tw-review-count">{rIdx + 1} / {changedRoles.length} roles</span>
              </div>
              <WeaveRoleCard
                role={changedRoles[rIdx]}
                originalIndexes={originals}
                onToggleOriginal={i => setOriginals(prev => {
                  const next = new Set(prev)
                  if (next.has(i)) next.delete(i)
                  else next.add(i)
                  return next
                })}
              />
              {error && <p className="tw-err" role="alert">{error}</p>}
              <div className="tw-review-actions">
                <button
                  type="button" className="tw-btn tw-btn-ghost"
                  disabled={applyWeave.isPending}
                  onClick={() => decide("keep")}
                >Keep mine</button>
                <button
                  type="button" className="tw-btn tw-btn-primary"
                  disabled={applyWeave.isPending}
                  onClick={() => decide("take")}
                >Take this</button>
              </div>
              {rIdx > 0 && (
                <button type="button" className="tw-back" disabled={applyWeave.isPending} onClick={undoLast}>← Back</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
