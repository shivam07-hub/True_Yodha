"use client"

import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { onboarding } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

interface Props {
  token: string
  credibleJobId: string | null
  credibleJobSaved: boolean
  tailored: boolean
}

export function NextSteps({ token, credibleJobId, credibleJobSaved, tailored }: Props) {
  const queryClient = useQueryClient()
  const state = useQuery({ queryKey: dataKeys.onboarding(), queryFn: () => onboarding.state(token), staleTime: 60_000 })
  const data = state.data
  if (!data || data.status !== "completed" || data.checklist_dismissed_at) return null

  const reviewed = Boolean(data.score_gap_reviewed_at || data.activation_kind === "review_score_gap")
  const items = [
    { label: "Review one score gap", href: "/forge?view=intel", done: reviewed, milestone: "score_gap_reviewed" as const },
    { label: "Save a relevant job", href: "/market", done: credibleJobSaved, milestone: null },
    { label: "Tailor your CV", href: credibleJobId ? `/cv?jobId=${credibleJobId}` : "/market", done: tailored, milestone: null },
  ]

  function dismiss() {
    void onboarding.dismissChecklist(token).then(() => queryClient.invalidateQueries({ queryKey: dataKeys.onboarding() }))
  }

  return (
    <section className="mb-5 border-b border-[var(--tm-border-soft)] pb-5" aria-labelledby="next-steps-title">
      <div className="flex items-center justify-between gap-3"><h2 id="next-steps-title" className="text-sm font-semibold text-[var(--tm-text)]">Next steps</h2><button type="button" onClick={dismiss} className="tm-control-focus rounded p-2 text-[var(--tm-text-muted)]" aria-label="Dismiss next steps"><X className="size-4" /></button></div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {items.map((item) => <Link key={item.label} href={item.href} onClick={() => { if (item.milestone) void onboarding.markMilestone(token, item.milestone).then(() => queryClient.invalidateQueries({ queryKey: dataKeys.onboarding() })) }} className={`tm-control-focus flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm no-underline ${item.done ? "border-[var(--tm-border-soft)] text-[var(--tm-text-faint)]" : "border-[var(--tm-border)] text-[var(--tm-text)] hover:border-[var(--tm-interactive)]"}`}><span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-[var(--tm-success)] bg-[var(--tm-success)] text-white" : "border-[var(--tm-border)]"}`}>{item.done && <Check className="size-3" />}</span><span className={item.done ? "line-through" : ""}>{item.label}</span></Link>)}
      </div>
    </section>
  )
}
