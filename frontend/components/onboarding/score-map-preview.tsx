import Link from "next/link"

import { DomainRadar } from "@/components/skills/domain-radar"
import { buildScoreMapHref } from "@/lib/score-map"

interface PreviewScore {
  total_score: number
  domain_scores: Record<string, number>
  skills_assessed: number
}

export function ScoreMapPreview({ score, link = false }: { score: PreviewScore; link?: boolean }) {
  const domains = Object.keys(score.domain_scores).length
  if (domains === 0) return null

  return (
    <section className="mt-6 grid items-center gap-4 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-4 sm:grid-cols-[180px_minmax(0,1fr)]" aria-labelledby="onboarding-score-map-title">
      <div className="mx-auto w-full max-w-[180px] [&_svg]:h-auto [&_svg]:w-full">
        <DomainRadar domainScores={score.domain_scores} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tm-interactive)]">CV → skills → score</p>
        <h2 id="onboarding-score-map-title" className="mt-1 text-lg font-semibold text-[var(--tm-text)]">Your Score map</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">
          Myro found {score.skills_assessed} skills across {domains} evidenced {domains === 1 ? "domain" : "domains"}. These same domain values average to {Math.round(score.total_score)}.
        </p>
        {link && (
          <Link href={buildScoreMapHref({ panel: "why" })} className="tm-control-focus mt-3 inline-flex rounded text-sm font-semibold text-[var(--tm-interactive)]">
            Open Score &amp; Skills →
          </Link>
        )}
      </div>
    </section>
  )
}
