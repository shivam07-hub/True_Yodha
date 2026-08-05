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
import { useJobLiveness } from "@/lib/hooks/use-job-liveness"
import { livenessNotice } from "@/lib/jobs/detail-model"

export interface ApplyCapture {
  target: ApplyTarget
  href: string | null
  onApply: (event?: React.MouseEvent<HTMLElement>) => boolean
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
  const { liveness, loading: livenessLoading } = useJobLiveness(job.job_id)
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
    return flushFeedbackOutbox(window.sessionStorage, feedbackKey, input =>
      jobs.submitFeedback(token, input),
    )
  }, [feedbackKey, token])

  const flushIntents = React.useCallback(() => {
    if (typeof window === "undefined") return Promise.resolve()
    return flushApplyIntentOutbox(window.sessionStorage, intentKey, event =>
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
    enqueueFeedback(window.sessionStorage, feedbackKey, {
      client_event_id: crypto.randomUUID(),
      job_id: job.job_id,
      feedback_kind: "quality",
      reason_code: reason,
      surface,
    })
    void flushFeedback()
  }, [feedbackKey, flushFeedback, job.job_id, surface])

  const livenessState = liveness?.state
    ?? (job.listing_confidence === "closed" || job.listing_confidence === "likely_closed"
      ? "closed"
      : job.listing_confidence === "active" ? "live" : "unverified")

  React.useEffect(() => {
    if (state !== "checking" || livenessLoading) return
    setState(livenessNotice(livenessState)?.guardsApply ? "closed" : "idle")
  }, [livenessLoading, livenessState, state])

  const onApply = React.useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (livenessLoading) {
      event?.preventDefault()
      event?.stopPropagation()
      setState("checking")
      return false
    }
    if (livenessNotice(livenessState)?.guardsApply) {
      event?.preventDefault()
      event?.stopPropagation()
      setState("closed")
      return false
    }
    if (!target.destinationType || !job.job_id || typeof window === "undefined") return false
    answered.current = false
    submittedArtifactWritten.current = false
    appliedAt.current = Date.now()
    setState("idle")
    const intentEvent = {
      client_event_id: crypto.randomUUID(),
      job_id: job.job_id,
      surface: intentSurface,
      destination_type: target.destinationType,
    }
    enqueueApplyIntent(window.sessionStorage, intentKey, intentEvent)
    void flushIntents()
    if (returnTimer.current != null) window.clearTimeout(returnTimer.current)
    returnTimer.current = window.setTimeout(showReturnPrompt, 1_200)
    return true
  }, [flushIntents, intentKey, intentSurface, job.job_id, livenessLoading, livenessState, showReturnPrompt, target.destinationType])

  const open = React.useCallback(() => {
    if (!onApply()) return
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

  /**
   * A report is the opposite of a save. Reporting a dead or wrong listing used
   * to call `persistStatus("saved")` — the user said "this is gone" and Myro
   * filed it into Collections and thanked them for it.
   *
   * The report now does what it says: the quality event goes to the corpus (the
   * feedback trigger drops the listing's confidence for everyone), and the job
   * leaves THIS user's feed via the dismissal every match/feed read already
   * honours. A saved application row is left alone — a `likely_closed` listing
   * lands in the Collections "Closed" chip on its own, which keeps the CV work
   * reachable without pretending the role is still open.
   *
   * `technical` is excluded: a timeout on our side or theirs says nothing about
   * the listing, so it reports without hiding the job.
   */
  const reportIssue = React.useCallback((issue: ApplyIssue) => {
    enqueueQuality(issueFeedbackReason(issue))
    setState("reported")
    if (issue === "technical") return
    run(async () => {
      await jobs.dismissMatchCard(token, job.job_id)
      // `["jobs"]` is the prefix over the feed, the match stack and the pulses
      // the Closed chip reads; the liveness key carries this surface's own gate.
      await queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      await queryClient.invalidateQueries({ queryKey: ["jobLiveness", job.job_id] })
    }, "reported")
  }, [enqueueQuality, job.job_id, queryClient, run, token])

  const retry = React.useCallback(() => {
    const retryable = retryAction.current
    if (!retryable) return
    run(retryable.action, retryable.success)
  }, [run])

  const findSimilar = React.useCallback(() => onFindSimilar?.(), [onFindSimilar])

  return {
    target,
    href: livenessLoading ? null : target.url,
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
