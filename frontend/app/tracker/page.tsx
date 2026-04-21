"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { jobs, scores, type ApplicationResponse, type ApplicationStatus, type JobMatch } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

function JobDetailModal({ job, onClose }: { job: JobMatch; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1,
          width: "min(560px, 92vw)", maxHeight: "80vh",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border)",
          borderRadius: "var(--tm-radius)",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{job.title}</div>
            <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
              {[job.company, job.location].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--tm-border-soft)", borderRadius: 6, color: "var(--tm-text-muted)", cursor: "pointer", padding: "3px 8px", fontSize: 11, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 12 }}>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job ID</span>
          <span style={{ color: "var(--tm-text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{job.job_id}</span>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job Title</span>
          <span style={{ color: "var(--tm-text)" }}>{job.title}</span>
        </div>
        {job.job_description && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>Job Description</div>
            <div style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{job.job_description}</div>
          </div>
        )}
        {!job.job_description && (
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>No description available for this role.</div>
        )}
      </div>
    </div>
  )
}


const STATUSES: ApplicationStatus[] = ["pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer"]

const STATUS_META: Record<ApplicationStatus, { label: string; fg: string; bg: string; border: string }> = {
  pending:      { label: "Pending",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  applied:      { label: "Applied",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  no_response:  { label: "No response",  fg: "var(--tm-warning)",  bg: "var(--tm-warning-wash)",  border: "rgba(245,158,11,0.2)" },
  responded:    { label: "Responded",    fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  interviewing: { label: "Interviewing", fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.2)" },
  rejected:     { label: "Rejected",     fg: "var(--tm-danger)",   bg: "var(--tm-danger-wash)",   border: "rgba(251,113,133,0.2)" },
  offer:        { label: "Offer 🎉",     fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.3)" },
}

function MarketTrackedCard({ app, updating, onStatusChange }: {
  app: ApplicationResponse; updating: boolean; onStatusChange: (s: ApplicationStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const statusMeta = STATUS_META[app.status]
  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: "var(--tm-radius)", padding: "18px 20px",
        background: open ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: open ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
        backdropFilter: "blur(20px)", cursor: "pointer",
        transition: "all var(--tm-dur) var(--tm-ease)",
        transform: open ? "translateY(-2px)" : "none",
        boxShadow: open ? "var(--tm-shadow-2)" : "none",
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border)" }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      {/* Header row — matches JobCard layout exactly */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3 }}>{app.title}</div>
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{app.company ?? ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-muted)", padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border-soft)" }}>
            Tracked from Market
          </div>
          <div style={{ fontSize: 10, color: statusMeta.fg, padding: "2px 7px", borderRadius: 999, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
            {statusMeta.label}
          </div>
        </div>
      </div>

      {/* Faint bar placeholder — visual parity with ScoreBar */}
      <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)" }} />

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tm-border-soft)" }} onClick={(e) => e.stopPropagation()}>
          <select
            value={app.status}
            disabled={updating}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
            style={{ flex: 1, width: "100%", padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-surface-2)", border: "1px solid var(--tm-border)", color: "var(--tm-text)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} style={{ background: "var(--tm-surface)" }}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "var(--tm-accent)" : score >= 55 ? "var(--tm-warning)" : "var(--tm-danger)"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, borderRadius: 999, background: color, transition: "width 1s var(--tm-ease)" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>{score}%</span>
    </div>
  )
}

function JobCard({
  job, status, tracked, updating,
  onStatusChange, onDetailClick,
}: {
  job: JobMatch; status: ApplicationStatus; tracked: boolean; updating: boolean
  onStatusChange: (s: ApplicationStatus) => void; onDetailClick: () => void
}) {
  const [open, setOpen] = useState(false)
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const firstPlan = job.action_plan?.[0]
  const statusMeta = STATUS_META[status]

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: "var(--tm-radius)",
        padding: "18px 20px",
        background: open ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: open ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
        backdropFilter: "blur(20px)",
        transition: "all var(--tm-dur) var(--tm-ease)",
        transform: open ? "translateY(-2px)" : "none",
        boxShadow: open ? "var(--tm-shadow-2)" : "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border)" }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onDetailClick() }}
            style={{
              fontSize: 14, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3,
              cursor: "pointer", display: "inline-block",
              borderBottom: "1px solid transparent",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderBottomColor = "var(--tm-accent-ring)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.borderBottomColor = "transparent" }}
          >
            {job.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
          {job.llm_explanation && (
            <div style={{ fontSize: 11, color: "var(--tm-text-muted)", marginTop: 4, lineHeight: 1.5 }}>
              {job.llm_explanation}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {tracked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <div style={{
                fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--tm-accent)", padding: "3px 8px", borderRadius: 999,
                background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
              }}>
                Tracking
              </div>
              <div style={{
                fontSize: 10, color: statusMeta.fg, padding: "2px 7px", borderRadius: 999,
                background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
              }}>
                {statusMeta.label}
              </div>
            </div>
          ) : job.llm_rank ? (
            <div style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Rank #{job.llm_rank}
            </div>
          ) : null}
        </div>
      </div>

      <ScoreBar score={score} />

      {/* Tags */}
      {job.matched_skills?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          {job.matched_skills.slice(0, 5).map((t) => (
            <span key={t} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 999,
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-border-soft)",
              color: "var(--tm-accent)",
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tm-border-soft)" }}>
          {job.llm_explanation && (
            <p style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
              {job.llm_explanation}
            </p>
          )}
          {firstPlan && (
            <div style={{
              padding: "10px 14px", borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-border-soft)",
              fontSize: 12, color: "var(--tm-accent)", marginBottom: 14,
            }}>
              ⚡ Next: {firstPlan.focus}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            {tracked && (
              <select
                value={status}
                disabled={updating}
                onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-surface-2)",
                  border: "1px solid var(--tm-border)",
                  color: "var(--tm-text)", fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} style={{ background: "var(--tm-surface)" }}>{STATUS_META[s].label}</option>
                ))}
              </select>
            )}
            {job.source_url && (
              <a
                href={job.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: "8px 16px", borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-border)",
                  background: "transparent",
                  color: "var(--tm-text-muted)", fontSize: 12, textDecoration: "none",
                }}
              >
                Open JD ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AITutor() {
  const [msg, setMsg] = useState("")
  const [chat, setChat] = useState([
    { role: "ai", text: "I've analysed your skill gaps and the current market. Your fastest path is closing the highest-gap skills first. Upload your CV if you haven't — then I can give you a personalised 7-day plan. What would you like to work on?" },
  ])
  const [loading, setLoading] = useState(false)

  async function send() {
    const userMsg = msg.trim()
    if (!userMsg) return
    setMsg("")
    setChat((c) => [...c, { role: "user", text: userMsg }])
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setChat((c) => [...c, { role: "ai", text: "Great question. Focus on the skills appearing most in your top matched job descriptions — those are your highest ROI targets. Check the skill gaps in the sidebar for specifics." }])
    setLoading(false)
  }

  return (
    <div style={{
      background: "var(--tm-surface)",
      border: "1px solid var(--tm-border)",
      borderRadius: "var(--tm-radius)",
      padding: 20,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-accent)" }}>
        AI Career Tutor
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
              background: m.role === "user" ? "var(--tm-accent-wash)" : "var(--tm-surface-2)",
              border: `1px solid ${m.role === "user" ? "var(--tm-border-soft)" : "var(--tm-border-soft)"}`,
              fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.6,
            }}>{m.text}</div>
          </div>
        ))}
        {loading && <div style={{ fontSize: 12, color: "var(--tm-text-faint)", padding: "4px 0" }}>Thinking…</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask your AI tutor anything…"
          className="tm-input"
          style={{ flex: 1, height: 40 }}
        />
        <button
          onClick={send}
          className="tm-btn tm-btn-ghost"
          style={{ flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

function GapSkillCard({ skill }: { skill: { skill: string; gap_score: number; job_count_30d: number } }) {
  const pct = Math.round(skill.gap_score)
  const color = pct >= 70 ? "var(--tm-danger)" : pct >= 40 ? "var(--tm-warning)" : "var(--tm-accent)"
  return (
    <div style={{
      padding: "12px 16px", borderRadius: "var(--tm-radius-sm)",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--tm-border-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--tm-text)" }}>{skill.skill}</span>
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>Gap: {pct}</span>
      </div>
      <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 4 }}>
        {skill.job_count_30d.toLocaleString()} jobs/30d
      </div>
    </div>
  )
}

export default function TrackerPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()

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

  const scoresQuery = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const refreshMatches = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs", token] }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  const [detailJob, setDetailJob] = useState<JobMatch | null>(null)

  const appsByJobId = useMemo(() => {
    const map: Record<string, { status: ApplicationStatus; appliedAt: string | null }> = {}
    for (const app of appsQuery.data ?? []) {
      map[app.job_id] = { status: app.status, appliedAt: app.applied_at }
    }
    return map
  }, [appsQuery.data])

  const topJobs = useMemo(() => {
    const all = matchesQuery.data?.jobs ?? []
    return [...all].sort((a, b) => {
      const aTracked = !!appsByJobId[a.job_id]
      const bTracked = !!appsByJobId[b.job_id]
      if (aTracked !== bTracked) return aTracked ? -1 : 1
      return (a.llm_rank ?? 99) - (b.llm_rank ?? 99)
    })
  }, [matchesQuery.data, appsByJobId])

  const matchedJobIds = useMemo(() => new Set((matchesQuery.data?.jobs ?? []).map((j) => j.job_id)), [matchesQuery.data])

  const marketTrackedJobs = useMemo(
    () => (appsQuery.data ?? []).filter((a) => !matchedJobIds.has(a.job_id)),
    [appsQuery.data, matchedJobIds],
  )

  const topGapSkills = useMemo(() => (scoresQuery.data?.gap_skills ?? []).slice(0, 4), [scoresQuery.data])

  if (!ready) return null

  return (
    <>
    {detailJob && <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />}
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
            Matched Jobs + Tracker
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
                Opportunities
              </h1>
              <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                Top matches · sorted by skill alignment
              </p>
            </div>
            <button
              onClick={() => refreshMatches.mutate()}
              disabled={refreshMatches.isPending}
              className="tm-btn tm-btn-ghost"
              style={{ opacity: refreshMatches.isPending ? 0.5 : 1 }}
            >
              {refreshMatches.isPending ? "…" : "⟳ Refresh"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
          {/* Job cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matchesQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", animation: "pulse 2s infinite" }} />
              ))
            ) : topJobs.length === 0 ? (
              <div style={{
                padding: 48, textAlign: "center",
                borderRadius: "var(--tm-radius)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--tm-border-soft)",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.2, color: "var(--tm-accent)" }}>◆</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>No matches yet</div>
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
                  Upload your CV then click Refresh.
                </div>
              </div>
            ) : (
              topJobs.map((job) => {
                const app = appsByJobId[job.job_id]
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    status={app?.status ?? "pending"}
                    tracked={!!app}
                    updating={updateStatus.isPending}
                    onStatusChange={(status) => updateStatus.mutate({ jobId: job.job_id, status })}
                    onDetailClick={() => setDetailJob(job)}
                  />
                )
              })
            )}

            {/* Tracked from Market section */}
            {marketTrackedJobs.length > 0 && (
              <>
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  Tracked from Market · {marketTrackedJobs.length}
                </div>
                {marketTrackedJobs.map((app) => (
                  <MarketTrackedCard
                    key={app.job_id}
                    app={app}
                    updating={updateStatus.isPending}
                    onStatusChange={(status) => updateStatus.mutate({ jobId: app.job_id, status })}
                  />
                ))}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <AITutor />
            {topGapSkills.length > 0 && (
              <div style={{
                background: "var(--tm-surface)",
                border: "1px solid var(--tm-border-soft)",
                borderRadius: "var(--tm-radius)",
                padding: 20,
              }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.7, marginBottom: 14 }}>
                  Skill Gaps
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topGapSkills.map((s) => (
                    <GapSkillCard key={s.skill} skill={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
    </>
  )
}
