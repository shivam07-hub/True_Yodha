"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, Search, Sparkles } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { jobs, type JobMatch } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

function scoreColor(score: number): string {
  if (score >= 75) return "var(--tm-success)"
  if (score >= 50) return "var(--tm-warning)"
  return "var(--tm-text-faint)"
}

function JobCard({ job, onTrack }: { job: JobMatch; onTrack: (jobId: string) => void }) {
  const firstPlan = job.action_plan[0]
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const color = scoreColor(score)

  return (
    <article style={{
      borderRadius: "var(--tm-radius)",
      border: "1px solid var(--tm-border-soft)",
      background: "rgba(255,255,255,0.02)",
      padding: "var(--tm-card-pad)",
      transition: "border-color var(--tm-dur) var(--tm-ease)",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.title}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text-faint)" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        {job.llm_rank && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 600,
            padding: "3px 8px", borderRadius: "var(--tm-radius-pill)",
            background: "var(--tm-accent-wash)",
            color: "var(--tm-accent)",
            border: "1px solid var(--tm-border-soft)",
          }}>
            Rank {job.llm_rank}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${score}%`, background: color, transition: "width 700ms var(--tm-ease)" }} />
        </div>
        <span style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 500, color }}>{score}%</span>
      </div>

      {job.llm_explanation && (
        <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
          {job.llm_explanation}
        </p>
      )}

      {firstPlan && (
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", fontSize: 13, color: "var(--tm-text-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--tm-accent)" }}>Next: </span>
          {firstPlan.focus} · {firstPlan.tasks[0]}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onTrack(job.job_id)}
          className="tm-btn tm-btn-ghost"
          style={{ height: 30, padding: "0 12px", fontSize: 13 }}
        >
          + Track
        </button>
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--tm-text-muted)", textDecoration: "none", transition: "color var(--tm-dur) var(--tm-ease)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
          >
            Open role <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        )}
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
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
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
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
                  Full Job List
                </div>
                <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
                  Matched Jobs
                </h1>
                <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  {matches.data?.total ?? 0} recommendations from latest market batch
                </p>
              </div>
              <button
                onClick={() => compute.mutate()}
                disabled={!token || compute.isPending}
                className="tm-btn tm-btn-ghost"
                style={{ opacity: !token || compute.isPending ? 0.5 : 1 }}
              >
                {compute.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
                Refresh matches
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "var(--tm-text-faint)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles or companies…"
                className="tm-input"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {matches.isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 160, borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          ) : filtered.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {filtered.map((job) => (
                <JobCard key={job.id} job={job} onTrack={(jobId) => track.mutate(jobId)} />
              ))}
            </div>
          ) : (
            <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.2, color: "var(--tm-accent)" }}>◆</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>No matches yet</p>
              <p style={{ fontSize: 14, color: "var(--tm-text-faint)" }}>
                Upload your CV, then refresh after market data import.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
