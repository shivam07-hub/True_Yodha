"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Sparkles, Target } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { JobTrackerCard } from "@/components/tracker/job-tracker-card"
import { SkillIntelligencePanel } from "@/components/tracker/skill-intelligence-panel"
import { jobs, scores, type ApplicationStatus } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

export default function TrackerPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()

  // ── Data fetching ──────────────────────────────────────────
  const matchesQuery = useQuery({
    queryKey: ["jobs", token],
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
  })

  const appsQuery = useQuery({
    queryKey: ["applications", token],
    queryFn: () => jobs.applications(token!),
    enabled: !!token,
  })

  const scoreQuery = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  // ── Mutations ──────────────────────────────────────────────
  const refreshMatches = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs", token] }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  const addToTracker = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  // ── Derived data ───────────────────────────────────────────
  const topJobs = useMemo(
    () => (matchesQuery.data?.jobs ?? []).slice(0, 5),
    [matchesQuery.data]
  )

  const appsByJobId = useMemo(() => {
    const map: Record<number, { status: ApplicationStatus; appliedAt: string | null }> = {}
    for (const app of appsQuery.data ?? []) {
      map[app.job_id] = { status: app.status, appliedAt: app.applied_at }
    }
    return map
  }, [appsQuery.data])

  const activeCount = (appsQuery.data ?? []).filter((a) =>
    ["applied", "responded", "interviewing"].includes(a.status)
  ).length

  const gapSkills = scoreQuery.data?.gap_skills ?? []

  if (!ready) return null

  return (
    <AppShell>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Target className="h-4 w-4" />
            Jobs Tracker
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {topJobs.length} top matches · {activeCount} active applications
          </p>
        </div>
        <button
          onClick={() => refreshMatches.mutate()}
          disabled={refreshMatches.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          {refreshMatches.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
          Refresh matches
        </button>
      </div>

      {/* ── Two-column layout ────────────────────────────────── */}
      <div className="flex gap-6 items-start lg:flex-row flex-col">

        {/* Left — Job matches + application tracking */}
        <div className="w-full lg:w-[400px] shrink-0 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Top matches from your CV
          </h2>

          {matchesQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-muted/30" />
              ))}
            </div>
          ) : topJobs.length === 0 ? (
            <div className="rounded-xl border border-border px-4 py-10 text-center">
              <p className="text-sm font-medium">No matches yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload your CV then refresh matches to see your top roles.
              </p>
            </div>
          ) : (
            topJobs.map((job) => {
              const app = appsByJobId[job.job_id]
              return (
                <JobTrackerCard
                  key={job.id}
                  job={job}
                  status={app?.status ?? "pending"}
                  appliedAt={app?.appliedAt ?? null}
                  tracked={!!app}
                  updating={updateStatus.isPending || addToTracker.isPending}
                  onStatusChange={(status) => updateStatus.mutate({ jobId: job.job_id, status })}
                  onAddToTracker={() => addToTracker.mutate(job.job_id)}
                />
              )
            })
          )}
        </div>

        {/* Right — Skill intelligence panel */}
        <div className="flex-1 min-w-0">
          <SkillIntelligencePanel
            gapSkills={gapSkills}
            isLoading={scoreQuery.isLoading}
          />
        </div>

      </div>
    </AppShell>
  )
}
