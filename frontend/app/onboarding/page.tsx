"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { ExperienceStep } from "@/components/onboarding/experience-step"
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress"
import { TargetStep } from "@/components/onboarding/target-step"
import {
  beginCVUpload,
  clearPersistedCVUploadState,
  onboarding,
  pollCVUploadStatus,
  type CVUploadStatusResponse,
  type OnboardingTarget,
} from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { useOnboardingState } from "@/lib/hooks/use-onboarding-state"

type Stage = 0 | 1

export default function OnboardingPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const { state, profile, refresh } = useOnboardingState(token)
  const pollingJob = useRef<string | null>(null)
  const [stage, setStage] = useState<Stage>(0)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.isFetchedAfterMount) return
    const current = state.data?.current_stage
    if (current === "target") setStage(1)
    if (current === "result" || current === "generator") router.replace("/onboarding/result")
    if (state.data?.status === "completed") router.replace("/market")
  }, [router, state.data, state.isFetchedAfterMount])

  useEffect(() => {
    const jobId = state.data?.upload_job_id
    if (!token || !jobId || pollingJob.current === jobId || state.data?.entry_mode !== "uploaded_cv") return
    pollingJob.current = jobId
    setPhase("queued")
    void pollCVUploadStatus(token, jobId, {
      timeoutMs: 10 * 60_000,
      onProgress: (status: CVUploadStatusResponse) => setPhase(status.current_phase ?? "queued"),
    }).then(() => {
      clearPersistedCVUploadState()
      setPhase(null)
      refresh()
    }).catch(() => {
      pollingJob.current = null
      setPhase("reconnecting")
    })
  }, [refresh, state.data, token])

  async function handleUpload(file: File) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const { initial } = await beginCVUpload(token, file)
      const jobId = initial.status === "processing" ? initial.job_id : null
      await onboarding.saveExperience(token, {
        entry_mode: "uploaded_cv",
        upload_job_id: jobId,
        file_metadata: { name: file.name, mime: file.type, size_bytes: file.size },
      })
      setStage(1)
      refresh()
      if (jobId) setPhase("queued")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The CV could not be accepted.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDescription(description: string) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.profilePreview(token, description, crypto.randomUUID())
      setStage(1)
      refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The description could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  async function handleTarget(target: OnboardingTarget) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.saveTarget(token, target)
      refresh()
      router.push("/onboarding/result")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The target could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  if (!ready || state.isLoading || profile.isLoading) return null

  const initialTarget: Partial<OnboardingTarget> = {
    role_title: profile.data?.target_role_title ?? "",
    seniority: profile.data?.target_seniority ?? "any",
    location: profile.data?.target_location ?? "",
  }

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8">
          <MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span>
        </div>
      </header>
      <OnboardingProgress current={stage} onStageClick={(next) => { if (next === 0 || next === 1) setStage(next) }} />
      <div className="mx-auto flex min-h-[calc(100dvh-150px)] max-w-5xl items-center justify-center px-5 py-8 sm:px-8">
        {stage === 0 ? (
          <ExperienceStep busy={busy} error={error} onUpload={(file) => void handleUpload(file)} onDescribe={(description) => void handleDescription(description)} onBrowse={() => router.push("/market")} />
        ) : (
          <TargetStep initial={initialTarget} busy={busy} analysisPhase={phase} error={error} onSubmit={(target) => void handleTarget(target)} onBack={() => setStage(0)} onBrowse={() => router.push("/market")} />
        )}
      </div>
    </main>
  )
}
