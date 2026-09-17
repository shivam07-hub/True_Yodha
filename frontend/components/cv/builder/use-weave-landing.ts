/**
 * useWeaveLanding — the Accept half of Tailor with Mentor: which card the user
 * is on, and what a Keep/Take writes.
 *
 * The page turns on the click. Each landing is a Google Docs save, so the card
 * advances in `onMutate` and rolls back only if the write actually failed —
 * nobody watches a spinner to see the next role. Landings are queued because
 * each one is a read-modify-write on the same draft row.
 */
"use client"

import { useCallback, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { cv as cvApi } from "@/lib/api"
import { firstUndecidedStep, type WeaveStep } from "@/lib/cv/weave-steps"

/** One Keep/Take, as sent. `extras` decides the CV-wide summary / skills line;
 *  an `undo` with no role is that same card stepping back. */
interface Landing {
  accepted: number[]
  decided: number[]
  roleIndex: number | null
  action: "take" | "keep" | "undo" | "extras"
  originalPointers: number[]
  acceptSummary: boolean
  acceptSkillsLine: boolean
}

/** What the optimistic advance puts back when a landing fails. */
interface Rollback {
  accepted: number[]
  decided: number[]
  extras: boolean
  idx: number
}

export interface WeaveLandingSeed {
  steps: WeaveStep[]
  acceptedRoles: number[]
  decidedRoles: number[]
  extrasDecided: boolean
}

export function useWeaveLanding({
  token, jobId, steps, onApplied,
}: {
  token: string
  jobId: string
  steps: WeaveStep[]
  onApplied: (versionId: number) => void
}) {
  const [idx, setIdx] = useState(0)
  const [accepted, setAccepted] = useState<number[]>([])
  const [decided, setDecided] = useState<number[]>([])
  const [extrasDecided, setExtrasDecided] = useState(false)
  const [originals, setOriginals] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const apply = useMutation({
    mutationFn: (land: Landing) => {
      const next = queue.current
        .catch(() => {})
        .then(() => cvApi.weave.apply(token, jobId, land.accepted, {
          decidedRoles: land.decided,
          roleIndex: land.roleIndex,
          action: land.action,
          originalPointers: land.originalPointers,
          acceptSummary: land.acceptSummary,
          acceptSkillsLine: land.acceptSkillsLine,
        }))
      queue.current = next
      return next
    },
    onMutate: (land: Landing): Rollback => {
      const before: Rollback = { accepted, decided, extras: extrasDecided, idx }
      setError(null)
      setAccepted(land.accepted)
      setDecided(land.decided)
      if (land.action === "extras") setExtrasDecided(true)
      if (land.action === "undo" && land.roleIndex === null) setExtrasDecided(false)
      setOriginals(new Set())
      setIdx(i => (land.action === "undo" ? Math.max(0, i - 1) : i + 1))
      return before
    },
    onSuccess: (res, land) => {
      void land
      onApplied(res.version_id)
    },
    onError: (e: Error, _land, before) => {
      if (before) {
        setAccepted(before.accepted)
        setDecided(before.decided)
        setExtrasDecided(before.extras)
        setIdx(before.idx)
      }
      setError(e.message)
    },
  })

  const seed = useCallback((s: WeaveLandingSeed) => {
    setAccepted(s.acceptedRoles)
    setDecided(s.decidedRoles)
    setExtrasDecided(s.extrasDecided)
    setIdx(firstUndecidedStep(s.steps, {
      decidedRoles: s.decidedRoles, extrasDecided: s.extrasDecided,
    }))
  }, [])

  const reset = useCallback(() => {
    setAccepted([]); setDecided([]); setExtrasDecided(false)
    setIdx(0); setOriginals(new Set()); setError(null)
  }, [])

  const toggleOriginal = useCallback((i: number) => {
    setOriginals(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }, [])

  function decide(action: "take" | "keep") {
    const step = steps[idx]
    if (!step) return
    if (step.kind === "extras") {
      apply.mutate({
        accepted, decided, roleIndex: null, action: "extras", originalPointers: [],
        acceptSummary: action === "take" && Boolean(step.summary),
        acceptSkillsLine: action === "take" && Boolean(step.skillsLine),
      })
      return
    }
    const at = step.role.role_index
    apply.mutate({
      accepted: action === "take"
        ? [...accepted.filter(i => i !== at), at]
        : accepted.filter(i => i !== at),
      decided: [...decided.filter(i => i !== at), at],
      roleIndex: at,
      action,
      originalPointers: action === "take" ? Array.from(originals) : [],
      acceptSummary: false,
      acceptSkillsLine: false,
    })
  }

  function undoLast() {
    const prev = steps[idx - 1]
    if (!prev) return
    if (prev.kind === "extras") {
      apply.mutate({
        accepted, decided, roleIndex: null, action: "undo",
        originalPointers: [], acceptSummary: false, acceptSkillsLine: false,
      })
      return
    }
    apply.mutate({
      accepted: accepted.filter(i => i !== prev.role.role_index),
      decided: decided.filter(i => i !== prev.role.role_index),
      roleIndex: prev.role.role_index,
      action: "undo",
      originalPointers: [],
      acceptSummary: false,
      acceptSkillsLine: false,
    })
  }

  return { idx, originals, error, toggleOriginal, decide, undoLast, seed, reset }
}
