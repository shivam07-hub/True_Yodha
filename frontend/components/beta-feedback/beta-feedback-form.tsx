"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api-error"
import { formatDateTime } from "@/lib/format"
import { feedback, users } from "@/lib/api"
import {
  clearBetaFeedbackDraft,
  initialBetaFeedbackDraft,
  loadBetaFeedbackDraft,
  saveBetaFeedbackDraft,
  validateAssessmentStep,
  validateReviewStep,
  validateSessionStep,
  type BetaAssignmentReceipt,
  type BetaFeedbackDraft,
  type BetaFeedbackErrors,
} from "@/lib/beta-feedback"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { AssessmentStep } from "./assessment-step"
import { ReviewStep } from "./review-step"
import { SessionStep } from "./session-step"
import "./beta-feedback.css"
import "./beta-feedback-review.css"

type Step = 1 | 2 | 3

export function BetaFeedbackForm() {
  const { token } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [draft, setDraft] = useState<BetaFeedbackDraft>(initialBetaFeedbackDraft)
  const [errors, setErrors] = useState<BetaFeedbackErrors>({})
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<BetaAssignmentReceipt | null>(null)

  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: Boolean(token),
  })
  const statusQuery = useQuery({
    queryKey: dataKeys.betaAssignment(),
    queryFn: () => feedback.betaAssignmentStatus(token!),
    enabled: Boolean(token),
  })
  const userId = profileQuery.data?.ninja_name ?? null

  useEffect(() => {
    if (!userId || hydratedUserId === userId) return
    setDraft(loadBetaFeedbackDraft(userId, window.sessionStorage))
    setHydratedUserId(userId)
  }, [hydratedUserId, userId])

  useEffect(() => {
    if (!userId || hydratedUserId !== userId || receipt || statusQuery.data?.submitted) return
    saveBetaFeedbackDraft(userId, draft, window.sessionStorage)
  }, [draft, hydratedUserId, receipt, statusQuery.data?.submitted, userId])

  useEffect(() => {
    if (statusQuery.data?.receipt) setReceipt(statusQuery.data.receipt)
  }, [statusQuery.data?.receipt])

  const mutation = useMutation({
    mutationFn: () => feedback.submitBetaAssignment(token!, draft),
    onSuccess: (nextReceipt) => {
      if (userId) clearBetaFeedbackDraft(userId, window.sessionStorage)
      setReceipt(nextReceipt)
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        const result = await statusQuery.refetch()
        if (result.data?.receipt) setReceipt(result.data.receipt)
      }
    },
  })

  function update<K extends keyof BetaFeedbackDraft>(
    field: K,
    value: BetaFeedbackDraft[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function continueFromStep() {
    const nextErrors = step === 1
      ? validateSessionStep(draft)
      : validateAssessmentStep(draft)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setStep((current) => Math.min(3, current + 1) as Step)
  }

  function submit() {
    const nextErrors = validateReviewStep(draft)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    mutation.mutate()
  }

  if (profileQuery.isLoading || statusQuery.isLoading || !hydratedUserId) {
    return <StateCard title="Preparing your form" body="Checking your account and saved draft." />
  }

  if (profileQuery.isError || statusQuery.isError) {
    return (
      <StateCard title="Could not open the form" body="Your draft is safe. Retry when your connection is ready.">
        <Button
          className="bf-button"
          size="lg"
          onClick={() => void Promise.all([profileQuery.refetch(), statusQuery.refetch()])}
        >
          Retry
        </Button>
      </StateCard>
    )
  }

  if (receipt) {
    return (
      <StateCard
        title="Feedback received"
        body={`Submission #${receipt.id} was received on ${formatDateTime(receipt.submitted_at)}.`}
      >
        <p className="bf-receipt-note">This optional feedback is linked to your Myro account.</p>
      </StateCard>
    )
  }

  return (
    <section className="bf-card" aria-labelledby="bf-title">
      <header className="bf-header">
        <div className="bf-eyebrow">MYRO OPTIONAL FEEDBACK</div>
        <h1 className="bf-title" id="bf-title">Share optional feedback</h1>
        <div className="bf-progress-meta">
          <span>Step {step} of 3</span>
          <span>{step === 1 ? "Context" : step === 2 ? "Observations" : "Review"}</span>
        </div>
        <div className="bf-progress" aria-hidden="true">
          {[1, 2, 3].map((item) => <span className={item <= step ? "active" : ""} key={item} />)}
        </div>
      </header>

      <div className="bf-body">
        {step === 1 && <SessionStep draft={draft} errors={errors} update={update} />}
        {step === 2 && <AssessmentStep draft={draft} errors={errors} update={update} />}
        {step === 3 && (
          <ReviewStep
            draft={draft}
            errors={errors}
            update={update}
            onSubmit={submit}
            submitting={mutation.isPending}
          />
        )}

        {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 409) && (
          <p className="bf-submit-error" role="alert">
            Submission failed. Your draft is safe on this device. Please retry.
          </p>
        )}

        {step < 3 && (
          <div className="bf-actions">
            {step > 1 && (
              <Button className="bf-button-secondary" size="lg" variant="outline" onClick={() => setStep((step - 1) as Step)}>
                Back
              </Button>
            )}
            <Button className="bf-button" size="lg" onClick={continueFromStep}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function StateCard({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <section className="bf-card bf-state" aria-live="polite">
      <div className="bf-eyebrow">MYRO OPTIONAL FEEDBACK</div>
      <h1 className="bf-title">{title}</h1>
      <p>{body}</p>
      {children}
    </section>
  )
}
