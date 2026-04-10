"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, Loader2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { diary } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

export default function DiaryPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [entry, setEntry] = useState("")
  const [error, setError] = useState<string | null>(null)

  const history = useQuery({
    queryKey: ["diary", token],
    queryFn: () => diary.history(token!),
    enabled: !!token,
  })

  const saveEntry = useMutation({
    mutationFn: () => diary.createEntry(token!, entry),
    onMutate: () => setError(null),
    onSuccess: () => {
      setEntry("")
      queryClient.invalidateQueries({ queryKey: ["diary", token] })
      queryClient.invalidateQueries({ queryKey: ["scores", token] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save entry"),
  })

  if (!ready) return null

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="h-4 w-4" />
            Career Diary
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Add what you learned, built, shipped, or practiced today.
          </p>
        </div>

        <section className="rounded-lg border border-border p-4">
          <label htmlFor="diary-entry" className="text-sm font-medium">
            Today&apos;s entry
          </label>
          <textarea
            id="diary-entry"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            rows={8}
            placeholder="I built a dashboard, practiced SQL window functions, revised my CV, or spoke with a recruiter..."
            className="mt-2 w-full resize-none rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => saveEntry.mutate()}
              disabled={!entry.trim() || saveEntry.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saveEntry.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save entry
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Recent entries</h2>
          {history.isLoading ? (
            <div className="h-28 rounded-lg border border-border bg-muted/40" />
          ) : history.data?.entries.length ? (
            history.data.entries.map((item) => (
              <article key={item.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <time className="text-xs font-medium">{item.log_date}</time>
                  {item.score_after != null && (
                    <span className="text-xs text-muted-foreground">
                      Score {item.score_before ?? "new"} to {item.score_after}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {item.entry_text}
                </p>
                {item.skills_delta.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.skills_delta.map((skill) => (
                      <span
                        key={`${item.id}-${skill.taxonomy_key}`}
                        className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                      >
                        {skill.taxonomy_key} +{skill.xp_added} XP
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No entries yet.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
