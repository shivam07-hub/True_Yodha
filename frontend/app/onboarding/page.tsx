"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { ExperienceStep } from "@/components/onboarding/experience-step"
import { Button } from "@/components/ui/button"
import {
  beginCVUpload,
  clearPersistedCVUploadState,
  onboarding,
  pollCVUploadStatus,
} from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { useOnboardingState } from "@/lib/hooks/use-onboarding-state"

export default function OnboardingPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const { state, profile, refresh } = useOnboardingState(token)
  const pollingJob = useRef<string | null>(null)
  const resolved = useRef(false)
  const [entryMode, setEntryMode] = useState<"flow" | "completed">("flow")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve the entry destination ONCE from the first fetch (Slice 1 fix — do
  // NOT make this reactive to background refetches, that raced returning users
  // off their step). Score-first onboarding (Slice 4): the target is now
  // confirmed on the result screen, so any in-flight stage (target/result/
  // generator) resumes there — there is no blocking target step on this page.
  useEffect(() => {
    if (resolved.current || !state.isFetchedAfterMount) return
    resolved.current = true
    const data = state.data
    if (data?.status === "completed") { setEntryMode("completed"); return }
    if (["target", "result", "generator"].includes(data?.current_stage ?? "")) {
      router.replace("/onboarding/result")
    }
  }, [router, state.data, state.isFetchedAfterMount])

  // Keep the CV-upload localStorage resume record tidy on completion. Narration
  // + reveal live on /onboarding/result (driven by GET /onboarding/result), so
  // this page only needs to reconcile the persisted job, not render phases.
  useEffect(() => {
    const jobId = state.data?.upload_job_id
    if (!token || !jobId || pollingJob.current === jobId || state.data?.entry_mode !== "uploaded_cv") return
    pollingJob.current = jobId
    void pollCVUploadStatus(token, jobId, { timeoutMs: 10 * 60_000 })
      .then(() => { clearPersistedCVUploadState(); refresh() })
      .catch(() => { pollingJob.current = null })
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
      refresh()
      router.push("/onboarding/result")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The CV could not be accepted.")
      setBusy(false)
    }
  }

  async function handleDescription(description: string) {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.profilePreview(token, description, crypto.randomUUID())
      refresh()
      router.push("/onboarding/result")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The description could not be saved.")
      setBusy(false)
    }
  }

  async function handleReRun() {
    if (!token) return
    setBusy(true)
    await onboarding.startOver(token).catch(() => undefined)
    refresh()
    setEntryMode("flow")
    setBusy(false)
  }

  if (!ready || state.isLoading || profile.isLoading) return null

  if (entryMode === "completed") {
    return (
      <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
        <header className="border-b border-[var(--tm-border-soft)]">
          <div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8">
            <MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span>
          </div>
        </header>
        <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-5xl items-center justify-center px-5 py-8 sm:px-8">
          <section className="w-full max-w-md text-center">
            <h1 className="text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">You&apos;re all set</h1>
            <p className="mt-2 text-base leading-6 text-[var(--tm-text-muted)]">Your Myro profile is ready. Head to your dashboard, or re-run the analysis with a fresh CV.</p>
            <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/market")}>Go to dashboard</Button>
            <button type="button" onClick={() => void handleReRun()} disabled={busy} className="tm-control-focus mx-auto mt-3 block rounded px-3 py-2 text-sm text-[var(--tm-text-muted)] underline-offset-4 hover:underline">
              {busy ? "Starting over..." : "Re-run analysis"}
            </button>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8">
          <MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span>
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-5xl items-center justify-center px-5 py-8 sm:px-8">
        <ExperienceStep busy={busy} error={error} onUpload={(file) => void handleUpload(file)} onDescribe={(description) => void handleDescription(description)} />
      </div>
    </main>
  )
}
