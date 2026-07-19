"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  CVUploadFailure,
  clearPersistedCVUploadState,
  getPersistedCVUploadJobId,
  pollCVUploadStatus,
} from "@/lib/api"
import {
  announceCVUploadProgress,
  announceCVUploadTerminal,
  CV_UPLOAD_JOB_EVENT,
  type CVUploadJobEventDetail,
} from "@/lib/cv-upload-events"
import { dataKeys, invalidateCvData } from "@/lib/domain-data"

const RETRY_AFTER_MS = 5_000

/**
 * App-shell owner for a durable CV upload job. The observer survives route
 * changes, keeps the notification inbox fresh, and reconciles product caches
 * when the worker reaches a terminal state.
 */
export function CVUploadLifecycleObserver({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const activeJobRef = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const phaseByJob = new Map<string, string | null>()

    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: dataKeys.notificationsUnread() })
      void queryClient.invalidateQueries({ queryKey: dataKeys.notifications() })
    }

    const refreshCVData = () => {
      invalidateCvData(queryClient)
      void queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      void queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
    }

    const track = async (jobId: string): Promise<void> => {
      if (!mounted || activeJobRef.current === jobId) return
      activeJobRef.current = jobId
      refreshNotifications()
      let retry = false
      try {
        const result = await pollCVUploadStatus(token, jobId, {
          timeoutMs: 10 * 60_000,
          onProgress: (status) => {
            if (!mounted) return
            announceCVUploadProgress(jobId, status)
            const phase = status.current_phase ?? null
            if (phaseByJob.get(jobId) !== phase) {
              phaseByJob.set(jobId, phase)
              void queryClient.invalidateQueries({ queryKey: dataKeys.notifications() })
            }
          },
        })
        if (!mounted) return
        clearPersistedCVUploadState()
        refreshCVData()
        refreshNotifications()
        announceCVUploadTerminal({ jobId, outcome: "done", result })
      } catch (reason) {
        const error = reason instanceof Error ? reason : new Error("CV analysis could not be checked.")
        retry = reason instanceof CVUploadFailure && reason.retryable
        refreshNotifications()
        if (!retry && mounted) {
          clearPersistedCVUploadState()
          announceCVUploadTerminal({ jobId, outcome: "failed", error })
        }
      } finally {
        if (activeJobRef.current === jobId) activeJobRef.current = null
        if (retry && mounted) {
          retryTimer = setTimeout(() => { void track(jobId) }, RETRY_AFTER_MS)
        }
      }
    }

    const onJob = (event: Event) => {
      const detail = (event as CustomEvent<CVUploadJobEventDetail>).detail
      if (detail?.jobId) void track(detail.jobId)
    }
    window.addEventListener(CV_UPLOAD_JOB_EVENT, onJob)

    const persisted = getPersistedCVUploadJobId()
    if (persisted) void track(persisted)

    return () => {
      mounted = false
      window.removeEventListener(CV_UPLOAD_JOB_EVENT, onJob)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [queryClient, token])

  return null
}
