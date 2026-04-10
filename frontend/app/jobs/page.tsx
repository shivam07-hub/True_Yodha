"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Briefcase, ExternalLink, Loader2, Search, Sparkles } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { jobs, type JobMatch } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

function scoreTone(score: number): string {
  if (score >= 75) return "bg-emerald-500"
  if (score >= 50) return "bg-amber-500"
  return "bg-muted-foreground"
}

function JobCard({ job, onTrack }: { job: JobMatch; onTrack: (jobId: number) => void }) {
  const firstPlan = job.action_plan[0]

  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{job.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {job.llm_rank && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            Rank {job.llm_rank}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${scoreTone(job.overlap_score)}`}
            style={{ width: `${Math.min(100, Math.max(0, job.overlap_score))}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs font-medium">{Math.round(job.overlap_score)}%</span>
      </div>

      {job.llm_explanation && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{job.llm_explanation}</p>
      )}

      {firstPlan && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs">
          <span className="font-medium">Next move: </span>
          <span className="text-muted-foreground">{firstPlan.focus} · {firstPlan.tasks[0]}</span>
        </div>
      )}

      {job.source_url && (
        <a
          href={job.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
        >
          Open role <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <div className="mt-3">
        <button
          onClick={() => onTrack(job.job_id)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          Add to tracker
        </button>
      </div>
    </article>
  )
}

export default function JobsPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")

  const matches = useQuery({
    queryKey: ["jobs", token],
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
  })

  const compute = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs", token] }),
  })

  const track = useMutation({
    mutationFn: (jobId: number) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = matches.data?.jobs ?? []
    if (!term) return list
    return list.filter((job) =>
      [job.title, job.company, job.location].filter(Boolean).some((value) =>
        value!.toLowerCase().includes(term),
      ),
    )
  }, [matches.data?.jobs, search])

  if (!ready) return null

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Briefcase className="h-4 w-4" />
              Matched Jobs
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {matches.data?.total ?? 0} recommendations from your latest market batch
            </p>
          </div>
          <button
            onClick={() => compute.mutate()}
            disabled={!token || compute.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {compute.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Refresh matches
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search matched roles or companies"
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {matches.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 rounded-lg border border-border bg-muted/40" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} onTrack={(jobId) => track.mutate(jobId)} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No matches yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your CV, then refresh matches after the market data import is ready.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
