"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { onboarding } from "@/lib/api"

const CHECKLIST_KEY = ["first-success-checklist"] as const

export function FirstSuccessChecklist({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const checklist = useQuery({
    queryKey: CHECKLIST_KEY,
    queryFn: () => onboarding.checklist(token),
    staleTime: 60_000,
  })
  const dismiss = useMutation({
    mutationFn: () => onboarding.dismissChecklist(token),
    onSuccess: () => {
      if (checklist.data) {
        queryClient.setQueryData(CHECKLIST_KEY, { ...checklist.data, dismissed: true })
      }
    },
  })

  const data = checklist.data
  if (!data || data.dismissed || data.complete) return null
  const completed = data.items.filter((item) => item.done).length

  return (
    <section className="mb-5 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-4" aria-labelledby="first-setup-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="first-setup-title" className="text-sm font-semibold text-[var(--tm-text)]">Get set up</h2>
          <p className="mt-1 text-xs tabular-nums text-[var(--tm-text-muted)]">{completed} of {data.items.length} complete</p>
        </div>
        <Button type="button" variant="dismiss" size="icon-md" onClick={() => dismiss.mutate()} disabled={dismiss.isPending} aria-label="Dismiss setup checklist">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <ol className="mt-3 divide-y divide-[var(--tm-border-soft)]" role="list">
        {data.items.map((item) => (
          <li key={item.id}>
            {item.done ? (
              <span className="flex min-h-11 items-center gap-3 text-sm text-[var(--tm-text-muted)]">
                <Check className="size-4 text-[var(--tm-success)]" aria-hidden="true" />
                <span className="line-through">{item.label}</span>
              </span>
            ) : (
              <Link href={item.href} className="tm-control-focus flex min-h-11 items-center gap-3 rounded text-sm font-medium text-[var(--tm-text)] hover:text-[var(--tm-interactive)]">
                <span className="size-4 rounded-full border border-[var(--tm-border)]" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
