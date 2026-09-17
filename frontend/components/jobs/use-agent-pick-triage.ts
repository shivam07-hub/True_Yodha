"use client"

import { REASON_PROMPT_MS } from "@/lib/jobs/feedback"
import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem, type JobFeedItem } from "@/lib/api"
import {
  agentPicksQueryKey,
  dropJobFromAgentPicks,
  dropJobFromJobFeeds,
} from "@/lib/jobs/job-triage-cache"

const UNDO_MS = 6000
// A skip asks why (`SkipReasonChips` rides the same toast), and a question needs
// longer on screen than a reflex does. Undo stays available for as long as the
// question does — the skip is already recorded either way.
const SKIP_UNDO_MS = REASON_PROMPT_MS

/**
 * Save / Skip for Agent Picks. When the Jobs feed passes its triage callbacks,
 * those persist + snack / undo; this hook only drops the pick from the band.
 * Collections has no feed triage, so this hook owns the API + a 6s Undo.
 */
export function useAgentPickTriage({
  token,
  onSave,
  onSkip,
}: {
  token: string
  onSave?: (job: JobFeedItem) => void
  onSkip?: (job: JobFeedItem) => void
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<{ kind: "saved" | "skipped"; jobId: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearUndo = useCallback(() => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null }
  }, [])

  useEffect(() => clearUndo, [clearUndo])

  const hide = useCallback((jobId: string) => {
    dropJobFromAgentPicks(qc, token, jobId)
  }, [qc, token])

  const rollback = useCallback(() => {
    void qc.invalidateQueries({ queryKey: agentPicksQueryKey(token) })
    void qc.invalidateQueries({ queryKey: ["jobFeed"] })
  }, [qc, token])

  const save = useCallback((pick: AgentPickItem) => {
    hide(pick.job_id)
    if (onSave) {
      onSave(pick)
      return
    }
    dropJobFromJobFeeds(qc, pick.job_id)
    void jobsApi.saveJob(token, pick.job_id).catch(() => rollback())
    clearUndo()
    setPending({ kind: "saved", jobId: pick.job_id })
    undoTimer.current = setTimeout(() => setPending(null), UNDO_MS)
  }, [hide, onSave, qc, token, rollback, clearUndo])

  const skip = useCallback((pick: AgentPickItem) => {
    hide(pick.job_id)
    if (onSkip) {
      onSkip(pick)
      return
    }
    dropJobFromJobFeeds(qc, pick.job_id)
    void jobsApi.skipJob(token, pick.job_id).catch(() => rollback())
    clearUndo()
    setPending({ kind: "skipped", jobId: pick.job_id })
    undoTimer.current = setTimeout(() => setPending(null), SKIP_UNDO_MS)
  }, [hide, onSkip, qc, token, rollback, clearUndo])

  const undo = useCallback(() => {
    if (!pending) return
    const { kind, jobId } = pending
    clearUndo()
    setPending(null)
    const reverse = kind === "saved" ? jobsApi.removeTrackerJob(token, jobId) : jobsApi.unskipJob(token, jobId)
    void reverse.finally(() => rollback())
  }, [pending, token, rollback, clearUndo])

  return { save, skip, undo, pending: onSave || onSkip ? null : pending }
}
