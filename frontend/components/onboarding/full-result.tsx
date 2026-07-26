"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResultMatches } from "@/components/onboarding/result-matches"
import { ScoreExplanation } from "@/components/onboarding/score-explanation"
import { ScoreMapPreview } from "@/components/onboarding/score-map-preview"
import { SkillCorrectionSheet } from "@/components/onboarding/skill-correction-sheet"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { jobs, type OnboardingResult } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { pickBestMatch } from "@/lib/jobs/match-verdict"

type FullResultData = Extract<OnboardingResult, { kind: "full_result_ready" }>

interface Props { token: string; result: FullResultData; onAction: (kind: string, href: string) => void; onCorrected: () => void }

export function FullResult({ token, result, onAction, onCorrected }: Props) {
  const [savedCount, setSavedCount] = useState(0)

  // Matches compute async after the target is confirmed; poll until the stack
  // lands, then reveal the top 3. Keep polling while the server says it is
  // still computing — stopping at a fixed tick and then claiming the matches
  // were waiting in the feed was how an empty reveal became a walk to an empty
  // feed. Still capped, so it can never spin forever.
  const matchQuery = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobs.matches(token),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const data = query.state.data
      const count = data?.jobs?.length ?? 0
      if (count > 0) return false
      const stillWorking = !data || data.match_health === "computing"
      return stillWorking && query.state.dataUpdateCount < 20 ? 2500 : false
    },
  })
  const topMatches = (matchQuery.data?.jobs ?? []).slice(0, 3)
  const findingMatches = topMatches.length === 0 && matchQuery.isFetching

  // The ending: once they have committed to a job, the next real step is the
  // CV for it — not a feed. `pickBestMatch` is the canonical "your best match"
  // used by every other surface, so this points at the same job they do.
  const bestMatch = pickBestMatch(matchQuery.data?.jobs ?? [])
  const tailorTarget = result.credible_match?.job_id ?? bestMatch?.job_id ?? null
  const tailorHref = tailorTarget ? `/cv?jobId=${tailorTarget}` : "/cv"
  const tailorKind = tailorTarget ? "tailor_credible_job" : "browse_jobs"

  return (
    <section className="w-full max-w-4xl pb-8" aria-labelledby="result-title">
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>
          <p className="text-sm font-semibold text-[var(--tm-interactive)]">What Myro understood</p>
          <h1 id="result-title" className="mt-2 text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">Your starting point for {result.target.role_title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">{[result.target.seniority, result.target.location].filter(Boolean).map((item) => <span key={item} className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 capitalize text-[var(--tm-text-muted)]">{item}</span>)}</div>

          {/* Matches — the payoff, and the only place on this page where the
              user can act on one. */}
          <ResultMatches
            token={token}
            matches={topMatches}
            health={matchQuery.data?.match_health ?? null}
            finding={findingMatches}
            onAction={onAction}
            onSavedCountChange={setSavedCount}
          />

          <div className="mt-5 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">{result.skills.map((skill) => <details key={skill.taxonomy_key} className="group px-4 py-3"><summary className="tm-control-focus flex cursor-pointer list-none items-center justify-between rounded text-sm font-medium"><span>{skill.name}{typeof skill.level === "number" && <span className="ml-2 text-xs font-normal text-[var(--tm-text-faint)]">L{skill.level}</span>}</span><ChevronDown className="size-4 group-open:rotate-180" /></summary><p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{skill.evidence || "Detected in your current CV."}</p></details>)}</div>
          <div className="mt-2"><SkillCorrectionSheet token={token} baselineId={result.baseline_version_id} proof={result.skills} onSaved={onCorrected} /></div>
        </div>
        <aside className="flex min-h-44 flex-col justify-center rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-5 text-center">
          <p className="text-sm font-medium text-[var(--tm-text-muted)]">Your Myro Score</p>
          <p className="mt-2 text-5xl font-semibold tabular-nums text-[var(--tm-text)]">{Math.round(result.score.total_score)}</p>
          {result.score.top_percent != null ? (
            <div className="mt-2 flex justify-center">
              <BandPercentileLine band={result.score.band} topPercent={result.score.top_percent} />
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--tm-text-muted)]">Starting point for your target role</p>
          )}
        </aside>
      </div>
      <ScoreMapPreview score={result.score} link />
      <div className="mt-6"><ScoreExplanation factors={result.score_factors} /></div>
      {/*
        The ending. A user who has saved something has already picked their
        target — hand them the CV for it. A user who has not still needs to
        find one, so the feed leads. Onboarding used to close on the same two
        buttons either way, which made the whole reveal a menu.
      */}
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        {savedCount > 0 ? (
          <>
            <Button size="lg" onClick={() => onAction(tailorKind, tailorHref)}>
              Tailor your CV for it<ArrowRight className="size-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => onAction("browse_jobs", "/market")}>
              {savedCount === 1 ? "1 saved · see more" : `${savedCount} saved · see more`}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" onClick={() => onAction("browse_jobs", "/market")}>See all matches<ArrowRight className="size-5" /></Button>
            <Button size="lg" variant="outline" onClick={() => onAction(tailorKind, tailorHref)}>Tailor a CV</Button>
          </>
        )}
      </div>
    </section>
  )
}
