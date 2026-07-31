"use client"

interface Factor { kind: "gap" | "strength"; label: string; detail: string }

export function ScoreExplanation({ domainScores, domainSkillCounts, factors }: {
  domainScores: Record<string, number>
  domainSkillCounts: Record<string, number>
  factors: Factor[]
}) {
  const domains = Object.entries(domainScores).sort(([a], [b]) => a.localeCompare(b))
  return <section aria-labelledby="score-reasons-title">
    <h2 id="score-reasons-title" className="text-base font-semibold text-[var(--tm-text)]">How your NN is made</h2>
    <p className="mt-1 text-sm leading-6 text-[var(--tm-text-muted)]">Your score is the average of these evidenced domains.</p>
    <div className="mt-3 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">{domains.map(([domain, value]) => <div key={domain} className="flex items-center justify-between gap-4 px-4 py-3"><span className="min-w-0 text-sm font-medium text-[var(--tm-text)]">{domain}<span className="ml-2 text-xs font-normal text-[var(--tm-text-muted)]">{domainSkillCounts[domain] ?? 0} skills</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--tm-text)]">{Math.round(value)}</span></div>)}</div>
    {factors.length > 0 && <div className="mt-6"><h3 className="text-base font-semibold text-[var(--tm-text)]">What would move it most</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{factors.map(factor => <div key={`${factor.kind}-${factor.label}`} className="rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-3"><p className="text-sm font-semibold text-[var(--tm-text)]">{factor.label}</p><p className="mt-1 text-xs leading-5 text-[var(--tm-text-muted)]">{factor.detail}</p></div>)}</div></div>}
  </section>
}
