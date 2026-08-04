"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { ExperienceStep } from "@/components/onboarding/experience-step"
import { JourneyProgress } from "@/components/onboarding/journey-progress"
import {
  beginCVUpload,
  onboarding,
} from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { useOnboardingState } from "@/lib/hooks/use-onboarding-state"

export default function OnboardingPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const { state, profile, refresh } = useOnboardingState(token)
  const resolved = useRef(false)
  const [busy, setBusy] = useState(false)
  const [transferPct, setTransferPct] = useState<number | null>(null)
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
    // A finished user is sent where they were going. This used to be an
    // interstitial whose only real action was a "Go to dashboard" button — a
    // redirect wearing a screen, and one more click between a returning user and
    // their jobs. Re-running the analysis lives with the CV, not on a door they
    // were only passing through.
    if (data?.status === "completed") { router.replace("/market"); return }
    if (["target", "result", "generator"].includes(data?.current_stage ?? "")) {
      router.replace("/onboarding/result")
    }
  }, [router, state.data, state.isFetchedAfterMount])

  async function handleUpload(file: File) {
    if (!token) return
    setBusy(true)
    setError(null)
    setTransferPct(0)
    try {
      const { initial } = await beginCVUpload(token, file, "pdf_upload", setTransferPct)
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
      setTransferPct(null)
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

  // A completed user is redirected above and never renders this page, so there is
  // no "already done" branch to hold here.
  if (!ready || state.isLoading || profile.isLoading || state.data?.status === "completed") return null

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8">
          <MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span>
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8">
        {/* Same rail, same component, same labels as /onboarding/result. */}
        <JourneyProgress current={1} />
        <div className="flex flex-1 items-center justify-center py-8">
          <ExperienceStep busy={busy} error={error} progressPct={transferPct} onUpload={(file) => void handleUpload(file)} onDescribe={(description) => void handleDescription(description)} />
        </div>
      </div>
    </main>
  )
}
