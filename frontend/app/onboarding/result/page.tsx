"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { AnalysisProgress } from "@/components/onboarding/analysis-progress"
import { BaselineGenerator } from "@/components/onboarding/baseline-generator"
import { FullResult } from "@/components/onboarding/full-result"
import { FirstRunSkillReview } from "@/components/onboarding/first-run-skill-review"
import { FirstRoleSuccess } from "@/components/onboarding/first-role-success"
import { JourneyProgress } from "@/components/onboarding/journey-progress"
import { ProfilePreview } from "@/components/onboarding/profile-preview"
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
  const { token, ready } = useAuth()
  const { state, refresh } = useOnboardingState(token)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  // Which step the user is LOOKING at. Null = wherever they actually are.
  // Deliberately not persisted: a reload should return you to your real
  // position, not to whatever you were reviewing when you closed the tab.
  const [viewStep, setViewStep] = useState<number | null>(null)
  // The live phase from the upload stream. Preferred over the polled copy because
  // it arrives as the worker moves, not on the next fallback tick.
  const [streamedPhase, setStreamedPhase] = useState<string | null>(null)

  const result = useQuery({
    queryKey: [...dataKeys.onboardingResult(), viewStep] as const,
    queryFn: () => onboarding.result(token!, viewStep ?? undefined),
    enabled: Boolean(token),
    // The result payload now carries the shortlist, so this poll is what shows
    // the matches landing. `computing` = a run for this direction is in flight;
    // `stalled` = it was re-enqueued, so keep watching, just less eagerly.
    // (React Query pauses interval refetching on a blurred tab, so a walked-away
    // user costs nothing.)
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.kind === "full_result_processing") {
        // Step 1 is the CV analysis, and the app-shell upload observer is ALREADY
        // polling that job and broadcasting every phase change. Polling it here too
        // meant two requests asking one question for 48-109s, and this one costs a
        // multi-read assembly. The stream drives the screen (see below); this stays
        // only as a dead-man fallback in case the observer itself stalls.
        //
        // Step 3 is the score wait, which no observer covers — that keeps its poll.
        return data.journey_step === 1 ? 15_000 : 2_000
      }
      if (data?.kind !== "full_result_ready") return false
      if (data.shortlist_status === "computing") return 2_500
      return data.shortlist_status === "stalled" ? 8_000 : false
    },
    // A step only changes when the user submits one (which seeds this cache
    // directly, see `advance`) or when a background job lands (which the interval
    // above watches — `refetchInterval` ignores `staleTime`). Without this, a
    // just-seeded step is stale on arrival and immediately re-asks the server for
    // the answer it was just given.
    staleTime: 30_000,
    retry: true,
  })

  // The CV analysis reaches this screen as a STREAM, not as a poll. The app-shell
  // `CVUploadLifecycleObserver` owns the one poller (it has to — it survives route
  // changes and resumes a persisted job after a reload) and broadcasts each phase.
  // `/cv` already listens; this surface was re-polling the same job instead.
  //
  // Deliberately not extracted into a shared hook: `/cv` needs failure codes, the
  // receipt and `started_at`, this needs a phase and a finish signal. One interface
  // over both would be as complex as the two call sites it replaced.
  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<CVUploadProgressEventDetail>).detail
      if (detail?.status) setStreamedPhase(detail.status.current_phase ?? "queued")
    }
    const onTerminal = () => {
      // Done or failed, the next step is a fact on the server — ask once, now,
      // rather than waiting out the fallback interval.
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

  async function resetToUpload() {
    if (!token) return
    await onboarding.startOver(token)
    queryClient.removeQueries({ queryKey: dataKeys.onboarding() })
    queryClient.removeQueries({ queryKey: dataKeys.onboardingResult() })
    window.location.assign("/onboarding")
  }

  // Confirming an answer moves the user forward, so drop the review cursor —
  // otherwise they'd re-submit and land back on the step they just completed.
  //
  // `next` is the step the server assembled as part of answering the submit. Seed
  // it rather than refetching: the round trip this replaces was measured at 8.2s
  // on prod, immediately after an 8.4s submit, to arrive at an answer the client
  // was already holding. Callers without one (a step whose submit does not return
  // the next payload) fall back to asking.
  function advance(next?: OnboardingResult) {
    setViewStep(null)
    if (next) queryClient.setQueryData([...dataKeys.onboardingResult(), null] as const, next)
    else void result.refetch()
  }
  // Return to wherever they actually are, without touching any answer.
  const forward = () => setViewStep(null)

  if (!ready || state.isLoading || result.isLoading || !token) return null

  const furthest = result.data?.furthest_step ?? 0

  const body = (() => {
    if (generatorOpen || state.data?.current_stage === "generator") {
      return state.data ? <BaselineGenerator token={token} state={state.data} onCancel={() => setGeneratorOpen(false)} onApproved={() => { setGeneratorOpen(false); refresh(); void result.refetch() }} /> : null
    }
    if (result.isError) return (
      <section className="w-full max-w-lg text-center" aria-labelledby="result-load-error">
        <h1 id="result-load-error" className="text-balance text-2xl font-semibold text-[var(--tm-text)]">Couldn&apos;t load your next step</h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">Your progress is saved. Reconnect to continue from the same place.</p>
        <Button size="lg" className="mt-6" onClick={() => void result.refetch()}>Try again</Button>
      </section>
    )
    if (!result.data || result.data.kind === "full_result_processing") return <AnalysisProgress phase={streamedPhase ?? result.data?.phase ?? "queued"} onRetry={() => void result.refetch()} />
    if (result.data.kind === "profile_preview") return <ProfilePreview result={result.data} onBuild={() => setGeneratorOpen(true)} onUpload={() => void resetToUpload()} />
    if (result.data.kind === "first_role_saved") return <FirstRoleSuccess title={result.data.title} company={result.data.company} tailorHref={result.data.tailor_href} />
    // Forward is offered only to someone reviewing ground they've already
    // covered — a first-time visitor has nothing ahead to return to.
    if (result.data.kind === "awaiting_skill_confirmation") return <FirstRunSkillReview token={token} result={result.data} onConfirmed={advance} onForward={furthest > 1 ? forward : undefined} />
    if (result.data.kind === "awaiting_target") return <TargetConfirm token={token} result={result.data} onConfirmed={advance} onBack={() => setViewStep(1)} onForward={furthest > 2 ? forward : undefined} />
    if (result.data.kind === "terminal_failure") return (
      <section className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-normal text-[var(--tm-text)]">Analysis stopped</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{result.data.message || "Myro could not complete this analysis."}</p>
        {result.data.xp_refunded && <p className="mt-2 text-sm font-medium text-[var(--tm-text)]">Any charged Myro Coins were returned.</p>}
        <Button size="lg" className="mt-6" onClick={() => void resetToUpload()}><RotateCcw className="size-5" />Start again</Button>
      </section>
    )
    // `onBack` reviews the direction with the answers intact; `onAdjust` is the
    // destructive one — it clears the target so the user starts that choice over.
    return <FullResult
      token={token}
      result={result.data}
      onBack={() => setViewStep(2)}
      onAdjust={async () => { await onboarding.resetTarget(token); setViewStep(null); await result.refetch() }}
    />
  })()

  // The backend authors the step. It has to: `full_result_processing` is both
  // the first CV read (nothing checked, nothing chosen) and the post-target
  // score wait, and mapping that one kind to 3 ticked off two steps the user
  // had never reached. Fall back only for kinds that are unambiguously the end.
  const journeyStep = result.data && "journey_step" in result.data && result.data.journey_step
    ? result.data.journey_step
    : result.data?.kind === "full_result_ready" || result.data?.kind === "first_role_saved"
      ? 3
      : null

  return (
    <main className="min-h-dvh bg-[var(--tm-bg)] text-[var(--tm-text)]">
      <header className="border-b border-[var(--tm-border-soft)]"><div className="mx-auto flex h-16 max-w-5xl items-center px-5 sm:px-8"><MyroLogo size={25} /><span className="ml-2 text-base font-semibold">Myro</span></div></header>
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8">
        {journeyStep && <JourneyProgress current={journeyStep} furthest={furthest} onSelect={(step) => setViewStep(step === furthest ? null : step)} />}
        <div className="flex flex-1 items-center justify-center py-8">{body}</div>
      </div>
    </main>
  )
}
