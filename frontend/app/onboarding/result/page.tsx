"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { AnalysisProgress } from "@/components/onboarding/analysis-progress"
import { BaselineGenerator } from "@/components/onboarding/baseline-generator"
import { FirstRunSkillReview } from "@/components/onboarding/first-run-skill-review"
import { JourneyProgress } from "@/components/onboarding/journey-progress"
import { TargetConfirm } from "@/components/onboarding/target-confirm"
import { Button } from "@/components/ui/button"
import { onboarding, type OnboardingResult } from "@/lib/api"
import {
  CV_UPLOAD_PROGRESS_EVENT,
  CV_UPLOAD_TERMINAL_EVENT,
  type CVUploadProgressEventDetail,
} from "@/lib/cv-upload-events"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useOnboardingState } from "@/lib/hooks/use-onboarding-state"

export default function OnboardingResultPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { token, ready } = useAuth()
  const { state, refresh } = useOnboardingState(token)
  const searchParams = useSearchParams()
  const [generatorOpen, setGeneratorOpen] = useState(
    () => searchParams.get("guide") === "1",
  )
  const [viewStep, setViewStep] = useState<number | null>(null)
  const [streamedPhase, setStreamedPhase] = useState<string | null>(null)

  const result = useQuery({
    queryKey: [...dataKeys.onboardingResult(), viewStep] as const,
    queryFn: () => onboarding.result(token!, viewStep ?? undefined),
    enabled: Boolean(token),
    // Only poll while the CV is still being read. Direction completes onboarding
    // and lands on Market — no shortlist wait on this screen.
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.kind === "full_result_processing" && data.journey_step === 1) {
        return 15_000
      }
      return false
    },
    staleTime: 30_000,
    retry: true,
  })

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<CVUploadProgressEventDetail>).detail
      if (detail?.status) setStreamedPhase(detail.status.current_phase ?? "queued")
    }
    const onTerminal = () => {
      setStreamedPhase(null)
      void result.refetch()
    }
    window.addEventListener(CV_UPLOAD_PROGRESS_EVENT, onProgress)
    window.addEventListener(CV_UPLOAD_TERMINAL_EVENT, onTerminal)
    return () => {
      window.removeEventListener(CV_UPLOAD_PROGRESS_EVENT, onProgress)
      window.removeEventListener(CV_UPLOAD_TERMINAL_EVENT, onTerminal)
    }
  }, [result])

  useEffect(() => {
    if (result.data?.kind === "onboarding_complete") {
      router.replace(result.data.redirect_to)
      return
    }
    if (result.data?.kind === "first_role_saved") {
      router.replace(result.data.tailor_href)
      return
    }
    // Legacy shortlist step — Direction is the last onboarding page now.
    if (result.data?.kind === "full_result_ready") {
      router.replace("/market")
    }
  }, [result.data, router])

  async function resetToUpload() {
    if (!token) return
    await onboarding.startOver(token)
    queryClient.removeQueries({ queryKey: dataKeys.onboarding() })
    queryClient.removeQueries({ queryKey: dataKeys.onboardingResult() })
    window.location.assign("/onboarding")
  }

  function advance(next?: OnboardingResult) {
    setViewStep(null)
    if (next) queryClient.setQueryData([...dataKeys.onboardingResult(), null] as const, next)
    else void result.refetch()
  }
  const forward = () => setViewStep(null)

  if (!ready || state.isLoading || result.isLoading || !token) return null

  const furthest = result.data?.furthest_step ?? 0

  const body = (() => {
    if (generatorOpen) {
      return state.data ? <BaselineGenerator token={token} state={state.data} onCancel={() => setGeneratorOpen(false)} onApproved={() => { setGeneratorOpen(false); refresh(); void result.refetch() }} /> : null
    }
    if (result.isError) return (
      <section className="w-full max-w-lg text-center" aria-labelledby="result-load-error">
        <h1 id="result-load-error" className="text-balance text-2xl font-semibold text-[var(--tm-text)]">Couldn&apos;t load your next step</h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">Your progress is saved. Reconnect to continue from the same place.</p>
        <Button size="lg" className="mt-6" onClick={() => void result.refetch()}>Try again</Button>
      </section>
    )
    if (!result.data || result.data.kind === "full_result_processing") {
      return <AnalysisProgress phase={streamedPhase ?? result.data?.phase ?? "queued"} onRetry={() => void result.refetch()} />
    }
    if (result.data.kind === "onboarding_complete" || result.data.kind === "first_role_saved") return null
    if (result.data.kind === "awaiting_skill_confirmation") {
      return <FirstRunSkillReview token={token} result={result.data} onConfirmed={advance} onForward={furthest > 1 ? forward : undefined} />
    }
    if (result.data.kind === "awaiting_target") {
      return (
        <TargetConfirm
          token={token}
          result={result.data}
          onConfirmed={() => advance()}
          onBack={() => setViewStep(1)}
          onForward={furthest > 2 ? forward : undefined}
        />
      )
    }
    if (result.data.kind === "terminal_failure") return (
      <section className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-normal text-[var(--tm-text)]">Analysis stopped</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{result.data.message || "Myro could not complete this analysis."}</p>
        {result.data.xp_refunded && <p className="mt-2 text-sm font-medium text-[var(--tm-text)]">Any charged Myro Coins were returned.</p>}
        <Button size="lg" className="mt-6" onClick={() => void resetToUpload()}><RotateCcw className="size-5" />Start again</Button>
      </section>
    )
    return null
  })()

  const journeyStep = result.data && "journey_step" in result.data && result.data.journey_step
    ? result.data.journey_step
    : result.data?.kind === "awaiting_target"
      ? 2
      : 1

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]"><div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8"><MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span></div></header>
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8">
        {journeyStep && (
          <JourneyProgress
            current={journeyStep === 2 ? 2 : 1}
            furthest={Math.min(furthest, 2)}
            onSelect={(step) => setViewStep(step === furthest ? null : step)}
          />
        )}
        <div className="flex flex-1 items-center justify-center py-8">{body}</div>
      </div>
    </main>
  )
}
