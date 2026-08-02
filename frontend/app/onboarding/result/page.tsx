"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { AnalysisProgress } from "@/components/onboarding/analysis-progress"
import { BaselineGenerator } from "@/components/onboarding/baseline-generator"
import { FullResult } from "@/components/onboarding/full-result"
import { ProfilePreview } from "@/components/onboarding/profile-preview"
import { TargetConfirm } from "@/components/onboarding/target-confirm"
import { Button } from "@/components/ui/button"
import { onboarding } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useOnboardingState } from "@/lib/hooks/use-onboarding-state"

export default function OnboardingResultPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { token, ready } = useAuth()
  const { state, refresh } = useOnboardingState(token)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [completed, setCompleted] = useState(false)

  const result = useQuery({
    queryKey: dataKeys.onboardingResult(),
    queryFn: () => onboarding.result(token!),
    enabled: Boolean(token),
    refetchInterval: (query) => query.state.data?.kind === "full_result_processing" ? 2_000 : false,
    retry: true,
  })

  useEffect(() => {
    if (!token || result.data?.kind !== "full_result_ready" || completed) return
    setCompleted(true)
    void onboarding.complete(token).then(refresh).catch(() => setCompleted(false))
  }, [completed, refresh, result.data, token])

  // Send first-run users to the CV playground to review the extraction against
  // their actual CV. Replace, not push, so Back does not land on a screen whose
  // only job was to bounce them here.
  useEffect(() => {
    if (result.data?.kind === "awaiting_skill_confirmation") {
      router.replace("/cv?edit=1&tab=skills&confirm=1")
    }
  }, [result.data, router])

  async function resetToUpload() {
    if (!token) return
    await onboarding.startOver(token)
    queryClient.removeQueries({ queryKey: dataKeys.onboarding() })
    queryClient.removeQueries({ queryKey: dataKeys.onboardingResult() })
    window.location.assign("/onboarding")
  }

  async function takeAction(kind: string, href: string) {
    if (!token) return
    const activation = kind === "tailor_credible_job" ? "tailor_credible_job" : kind === "review_gaps" ? "review_score_gap" : null
    if (activation) await onboarding.activate(token, activation).catch(() => undefined)
    router.push(href)
  }

  if (!ready || state.isLoading || result.isLoading || !token) return null

  const body = (() => {
    if (generatorOpen || state.data?.current_stage === "generator") {
      return state.data ? <BaselineGenerator token={token} state={state.data} onCancel={() => setGeneratorOpen(false)} onApproved={() => { setGeneratorOpen(false); refresh(); void result.refetch() }} /> : null
    }
    if (result.isError) return <AnalysisProgress phase="reconnecting" />
    if (!result.data || result.data.kind === "full_result_processing") return <AnalysisProgress phase={result.data?.phase ?? "queued"} />
    if (result.data.kind === "profile_preview") return <ProfilePreview result={result.data} onBuild={() => setGeneratorOpen(true)} onUpload={() => void resetToUpload()} />
    // Skill confirmation lives in the CV playground, not on its own screen —
    // the extraction is only reviewable next to the CV it was read from, and
    // the same rail stays the permanent home for correcting it later.
    if (result.data.kind === "awaiting_skill_confirmation") return <AnalysisProgress phase="scoring" />
    if (result.data.kind === "awaiting_target") return <TargetConfirm token={token} result={result.data} onConfirmed={() => void result.refetch()} />
    if (result.data.kind === "terminal_failure") return (
      <section className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-normal text-[var(--tm-text)]">Analysis stopped</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{result.data.message || "Myro could not complete this analysis."}</p>
        {result.data.xp_refunded && <p className="mt-2 text-sm font-medium text-[var(--tm-text)]">Any charged Myro Coins were returned.</p>}
        <Button size="lg" className="mt-6" onClick={() => void resetToUpload()}><RotateCcw className="size-5" />Start again</Button>
      </section>
    )
    return <FullResult token={token} result={result.data} onAction={(kind, href) => void takeAction(kind, href)} onCorrected={() => { refresh(); void result.refetch() }} />
  })()

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]"><div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8"><MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span></div></header>
      <div className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-5xl items-center justify-center px-5 py-8 sm:px-8">{body}</div>
    </main>
  )
}
