"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  jobs,
  type ApplicationResponse,
  type ApplyIntentSurface,
  type FeedbackSurface,
  type QualityReasonCode,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { resolveApplyTarget, type ApplyTarget } from "@/lib/jobs/apply-transport"
import {
  answerApplyReturn,
  beginApplyReturn,
  issueFeedbackReason,
  type ApplyIssue,
  type ApplyReturnAnswer,
  type ApplyReturnStep,
} from "@/lib/jobs/apply-return-model"
import {
  applyIntentOutboxKey,
  enqueueApplyIntent,
  flushApplyIntentOutbox,
} from "@/lib/jobs/apply-intent-outbox"
import {
  enqueueFeedback,
  feedbackOutboxKey,
  flushFeedbackOutbox,
} from "@/lib/jobs/feedback-outbox"

export interface ApplyCapture {
  target: ApplyTarget
  href: string | null
  onApply: () => void
  open: () => void
  state: ApplyReturnStep
  pending: boolean
  answer: (answer: ApplyReturnAnswer) => void
  reportIssue: (issue: ApplyIssue) => void
  retry: () => void
  findSimilar: () => void
}

interface UseApplyCaptureInput {
  token: string
  job: {
    job_id: string
    source_url?: string | null
    company?: string | null
    listing_confidence?: "active" | "uncertain" | "likely_closed" | "closed" | null
  }
  surface: FeedbackSurface
  intentSurface: ApplyIntentSurface
  onFindSimilar?: () => void
  /** Job-specific CV surfaces freeze their exact artifact only after Yes. */
  onSubmitted?: () => Promise<void> | void
}

/**
 * Outbound apply boundary: click = attempt; return confirmation = application
 * truth. Intent and quality events use durable local outboxes when offline.
 */
export function useApplyCapture({
  token,
  job,
  surface,
  intentSurface,
  onFindSimilar,
  onSubmitted,
}: UseApplyCaptureInput): ApplyCapture {
  const queryClient = useQueryClient()
  const target = resolveApplyTarget(job)
  const appliedAt = React.useRef<number | null>(null)
  const answered = React.useRef(false)
  const submittedArtifactWritten = React.useRef(false)
  const returnTimer = React.useRef<number | null>(null)
  const retryAction = React.useRef<{ action: () => Promise<void>; success: ApplyReturnStep } | null>(null)
  const [state, setState] = React.useState<ApplyReturnStep>("idle")
  const [pending, setPending] = React.useState(false)
  const feedbackKey = React.useMemo(() => feedbackOutboxKey(token), [token])
  const intentKey = React.useMemo(() => applyIntentOutboxKey(token), [token])

  const flushFeedback = React.useCallback(() => {
    if (typeof window === "undefined") return Promise.resolve()
    return flushFeedbackOutbox(window.localStorage, feedbackKey, input =>
      jobs.submitFeedback(token, input),
    )
  }, [feedbackKey, token])

  const flushIntents = React.useCallback(() => {
    if (typeof window === "undefined") return Promise.resolve()
    return flushApplyIntentOutbox(window.localStorage, intentKey, event =>
      jobs.recordApplyIntent(token, event.job_id, {
        client_event_id: event.client_event_id,
        surface: event.surface,
        destination_type: event.destination_type,
      }),
    )
  }, [intentKey, token])

  React.useEffect(() => {
    void flushFeedback()
    void flushIntents()
    const onOnline = () => {
      void flushFeedback()
      void flushIntents()
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [flushFeedback, flushIntents])

  React.useEffect(() => {
    answered.current = false
    appliedAt.current = null
    submittedArtifactWritten.current = false
    if (returnTimer.current != null) window.clearTimeout(returnTimer.current)
    returnTimer.current = null
    retryAction.current = null
    setState("idle")
    setPending(false)
  }, [job.job_id])

  const showReturnPrompt = React.useCallback(() => {
      if (document.visibilityState !== "visible") return
      if (appliedAt.current == null || answered.current) return
      if (Date.now() - appliedAt.current < 1_200) return
      setState(beginApplyReturn().step)
  }, [])

  React.useEffect(() => {
    document.addEventListener("visibilitychange", showReturnPrompt)
    window.addEventListener("focus", showReturnPrompt)
    return () => {
      document.removeEventListener("visibilitychange", showReturnPrompt)
      window.removeEventListener("focus", showReturnPrompt)
      if (returnTimer.current != null) window.clearTimeout(returnTimer.current)
    }
  }, [showReturnPrompt])

  const enqueueQuality = React.useCallback((reason: QualityReasonCode) => {
    if (typeof window === "undefined" || !job.job_id) return
    enqueueFeedback(window.localStorage, feedbackKey, {
      client_event_id: crypto.randomUUID(),
      job_id: job.job_id,
      feedback_kind: "quality",
      reason_code: reason,
      surface,
    })
    void flushFeedback()
  }, [feedbackKey, flushFeedback, job.job_id, surface])

  const onApply = React.useCallback(() => {
    if (!target.destinationType || !job.job_id || typeof window === "undefined") return
    answered.current = false
    submittedArtifactWritten.current = false
    appliedAt.current = Date.now()
    setState("idle")
    const event = {
      client_event_id: crypto.randomUUID(),
      job_id: job.job_id,
      surface: intentSurface,
      destination_type: target.destinationType,
    }
    enqueueApplyIntent(window.localStorage, intentKey, event)
    void flushIntents()
    if (returnTimer.current != null) window.clearTimeout(returnTimer.current)
    returnTimer.current = window.setTimeout(showReturnPrompt, 1_200)
  }, [flushIntents, intentKey, intentSurface, job.job_id, showReturnPrompt, target.destinationType])

  const open = React.useCallback(() => {
    onApply()
    if (target.url && typeof window !== "undefined") {
      window.open(target.url, "_blank", "noopener,noreferrer")
    }
  }, [onApply, target.url])

  const persistStatus = React.useCallback(async (status: "saved" | "applied") => {
    const key = dataKeys.applications()
    const current = queryClient.getQueryData<ApplicationResponse[]>(key) ?? []
    const existing = current.find(application => application.job_id === job.job_id)
    if (existing && existing.status !== "saved") return
    const updated = await jobs.updateApplication(token, job.job_id, { status })
    queryClient.setQueryData<ApplicationResponse[]>(key, rows => {
      const applications = rows ?? []
      return applications.some(application => application.job_id === job.job_id)
        ? applications.map(application => application.job_id === job.job_id ? updated : application)
        : [...applications, updated]
    })
    void queryClient.invalidateQueries({ queryKey: key })
  }, [job.job_id, queryClient, token])

  const run = React.useCallback((action: () => Promise<void>, success: ApplyReturnStep) => {
    retryAction.current = { action, success }
    setPending(true)
    void action()
      .then(() => setState(success))
      .catch(() => setState("error"))
      .finally(() => setPending(false))
  }, [])

  const answer = React.useCallback((answerValue: ApplyReturnAnswer) => {
    if (answered.current) return
    answered.current = true
    const next = answerApplyReturn(answerValue)
    setState(next.step)
    if (answerValue === "couldnt") return

    if (answerValue === "submitted") {
      if (target.kind === "direct") enqueueQuality("apply_link_live")
      run(async () => {
        if (!submittedArtifactWritten.current) {
          await onSubmitted?.()
          submittedArtifactWritten.current = true
        }
        await persistStatus("applied")
      }, "submitted")
    } else {
      run(() => persistStatus("saved"), "saved")
    }
  }, [enqueueQuality, onSubmitted, persistStatus, run, target.kind])

  const reportIssue = React.useCallback((issue: ApplyIssue) => {
    enqueueQuality(issueFeedbackReason(issue))
    setState("reported")
    run(() => persistStatus("saved"), "reported")
  }, [enqueueQuality, persistStatus, run])

  const retry = React.useCallback(() => {
    const retryable = retryAction.current
    if (!retryable) return
    run(retryable.action, retryable.success)
  }, [run])

  const findSimilar = React.useCallback(() => onFindSimilar?.(), [onFindSimilar])

  return {
    target,
    href: target.url,
    onApply,
    open,
    state,
    pending,
    answer,
    reportIssue,
    retry,
    findSimilar,
  }
}
