"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { ApplicationResponse, JobMatchesResponse } from "@/lib/api"
import {
  removeSavedApplication,
  restoreSavedApplication,
  type SavedApplicationSnapshot,
} from "@/lib/collections/saved-job-dismissal"
import { dataKeys } from "@/lib/domain-data"

export type SavedJobDismissalNotice = {
  kind: "undo" | "dismiss-error" | "restore-error"
  snapshot: SavedApplicationSnapshot
}

interface DismissOperation {
  promise: Promise<boolean>
  undoRequested: boolean
}

export interface SavedJobDismissalController {
  notice: SavedJobDismissalNotice | null
  dismiss: (application: ApplicationResponse) => void
  undo: () => void
  retry: () => void
  clearNotice: () => void
}

const UNDO_WINDOW_MS = 6_000
const APPLICATIONS_QUERY_KEY = dataKeys.applications()
const JOBS_QUERY_KEY = dataKeys.jobs()

/**
 * One optimistic boundary for Collections removal on desktop and mobile.
 * Database calls remain serialized so Undo cannot race ahead of dismissal.
 */
export function useSavedJobDismissal(token: string): SavedJobDismissalController {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<SavedJobDismissalNotice | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const operations = useRef(new Map<string, DismissOperation>())
  const appsKey = APPLICATIONS_QUERY_KEY
  const jobsKey = JOBS_QUERY_KEY

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const reconcile = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: appsKey })
    void queryClient.invalidateQueries({ queryKey: jobsKey })
  }, [appsKey, jobsKey, queryClient])

  const markDismissed = useCallback((jobId: string, dismissed: boolean) => {
    queryClient.setQueryData<JobMatchesResponse | undefined>(jobsKey, (current) => {
      if (!current) return current
      const ids = new Set(current.dismissed_job_ids)
      if (dismissed) ids.add(jobId)
      else ids.delete(jobId)
      return { ...current, dismissed_job_ids: Array.from(ids) }
    })
  }, [jobsKey, queryClient])

  const restoreLocal = useCallback((snapshot: SavedApplicationSnapshot) => {
    queryClient.setQueryData<ApplicationResponse[]>(appsKey, (current = []) =>
      restoreSavedApplication(current, snapshot),
    )
    markDismissed(snapshot.application.job_id, false)
  }, [appsKey, markDismissed, queryClient])

  const removeLocal = useCallback((snapshot: SavedApplicationSnapshot) => {
    queryClient.setQueryData<ApplicationResponse[]>(appsKey, (current = []) =>
      removeSavedApplication(current, snapshot.application.job_id)?.applications ?? current,
    )
    markDismissed(snapshot.application.job_id, true)
  }, [appsKey, markDismissed, queryClient])

  const showUndo = useCallback((snapshot: SavedApplicationSnapshot) => {
    clearTimer()
    setNotice({ kind: "undo", snapshot })
    timer.current = setTimeout(() => {
      setNotice((current) => current?.snapshot.application.job_id === snapshot.application.job_id ? null : current)
      operations.current.delete(snapshot.application.job_id)
      reconcile()
    }, UNDO_WINDOW_MS)
  }, [clearTimer, reconcile])

  const dismiss = useCallback((application: ApplicationResponse) => {
    const jobId = application.job_id
    if (operations.current.has(jobId)) return
    void queryClient.cancelQueries({ queryKey: appsKey })
    const current = queryClient.getQueryData<ApplicationResponse[]>(appsKey) ?? [application]
    const transition = removeSavedApplication(current, jobId)
    if (!transition) return

    queryClient.setQueryData(appsKey, transition.applications)
    markDismissed(jobId, true)
    showUndo(transition.snapshot)

    const operation: DismissOperation = { promise: Promise.resolve(false), undoRequested: false }
    operation.promise = jobs.removeTrackerJob(token, jobId)
      .then(() => true)
      .catch(() => {
        if (!operation.undoRequested) {
          operations.current.delete(jobId)
          restoreLocal(transition.snapshot)
          clearTimer()
          setNotice({ kind: "dismiss-error", snapshot: transition.snapshot })
          reconcile()
        }
        return false
      })
    operations.current.set(jobId, operation)
  }, [appsKey, clearTimer, markDismissed, queryClient, reconcile, restoreLocal, showUndo, token])

  const restoreRemote = useCallback(async (snapshot: SavedApplicationSnapshot) => {
    const jobId = snapshot.application.job_id
    try {
      await jobs.restoreTrackerJob(token, jobId)
      operations.current.delete(jobId)
      reconcile()
    } catch {
      removeLocal(snapshot)
      setNotice({ kind: "restore-error", snapshot })
      reconcile()
    }
  }, [reconcile, removeLocal, token])

  const undo = useCallback(() => {
    if (notice?.kind !== "undo") return
    const snapshot = notice.snapshot
    const operation = operations.current.get(snapshot.application.job_id)
    clearTimer()
    setNotice(null)
    restoreLocal(snapshot)

    if (!operation) {
      void restoreRemote(snapshot)
      return
    }
    operation.undoRequested = true
    void operation.promise.then((dismissed) => {
      if (dismissed) void restoreRemote(snapshot)
      else {
        operations.current.delete(snapshot.application.job_id)
        reconcile()
      }
    })
  }, [clearTimer, notice, reconcile, restoreLocal, restoreRemote])

  const retry = useCallback(() => {
    if (!notice || notice.kind === "undo") return
    const retryNotice = notice
    setNotice(null)
    if (retryNotice.kind === "dismiss-error") dismiss(retryNotice.snapshot.application)
    else {
      restoreLocal(retryNotice.snapshot)
      void restoreRemote(retryNotice.snapshot)
    }
  }, [dismiss, notice, restoreLocal, restoreRemote])

  const clearNotice = useCallback(() => {
    clearTimer()
    setNotice(null)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return { notice, dismiss, undo, retry, clearNotice }
}
