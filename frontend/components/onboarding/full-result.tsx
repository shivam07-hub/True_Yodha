"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ChevronDown, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScoreExplanation } from "@/components/onboarding/score-explanation"
import { SkillCorrectionSheet } from "@/components/onboarding/skill-correction-sheet"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { jobs, type OnboardingResult } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

type FullResultData = Extract<OnboardingResult, { kind: "full_result_ready" }>

interface Props { token: string; result: FullResultData; onAction: (kind: string, href: string) => void; onCorrected: () => void }

export function FullResult({ token, result, onAction, onCorrected }: Props) {
  // Matches compute async after the target is confirmed; poll briefly until the
  // stack lands, then reveal the top 3. (Cap the poll so it never spins forever.)
  const matchQuery = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobs.matches(token),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const count = query.state.data?.jobs?.length ?? 0
      return count === 0 && query.state.dataUpdateCount < 8 ? 2500 : false
    },
  })
  const topMatches = (matchQuery.data?.jobs ?? []).slice(0, 3)
  const findingMatches = topMatches.length === 0 && matchQuery.isFetching

  const tailorHref = result.credible_match ? `/cv?jobId=${result.credible_match.job_id}` : "/cv"
  const tailorKind = result.credible_match ? "tailor_credible_job" : "browse_jobs"

  return (
    <section className="w-full max-w-4xl pb-8" aria-labelledby="result-title">
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>
          <p className="text-sm font-semibold text-[var(--tm-interactive)]">What Myro understood</p>
          <h1 id="result-title" className="mt-2 text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">Your starting point for {result.target.role_title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">{[result.target.seniority, result.target.location].filter(Boolean).map((item) => <span key={item} className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 capitalize text-[var(--tm-text-muted)]">{item}</span>)}</div>

          {/* Matches — the payoff. Top 3 real jobs; See all → /market. */}
          <div className="mt-5">
            <p className="text-sm font-semibold text-[var(--tm-text)]">Your top matches</p>
            {topMatches.length > 0 ? (
              <ul className="mt-2 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">
                {topMatches.map((job) => (
                  <li key={job.job_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--tm-text)]">{job.title}</span>
                      {job.company && <span className="block truncate text-xs text-[var(--tm-text-muted)]">{job.company}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--tm-interactive)]">{Math.round(job.match_score)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] px-4 py-3 text-sm text-[var(--tm-text-muted)]">
                {findingMatches && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {findingMatches ? "Finding your matches…" : "Your matches are ready in the market."}
              </p>
            )}
          </div>

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
      <div className="mt-6"><ScoreExplanation factors={result.score_factors} /></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Button size="lg" onClick={() => onAction("browse_jobs", "/market")}>See all matches<ArrowRight className="size-5" /></Button>
        <Button size="lg" variant="outline" onClick={() => onAction(tailorKind, tailorHref)}>Tailor a CV</Button>
      </div>
    </section>
  )
}
