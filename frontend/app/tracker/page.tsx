"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { jobs, scores, type ApplicationStatus, type JobMatch } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

const STATUSES: ApplicationStatus[] = ["pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer"]

const STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  pending:      { label: "Pending",      color: "#00F5D4" },
  applied:      { label: "Applied",      color: "#00F5D4" },
  no_response:  { label: "No response",  color: "#FFB347" },
  responded:    { label: "Responded",    color: "#00F5D4" },
  interviewing: { label: "Interviewing", color: "#A97FFF" },
  rejected:     { label: "Rejected",     color: "rgba(255,100,100,0.8)" },
  offer:        { label: "Offer 🎉",     color: "#00F5D4" },
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "#00F5D4" : score >= 55 ? "#FFB347" : "#A97FFF"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, borderRadius: 999, background: `linear-gradient(90deg,${color},${color}80)`, transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>{score}%</span>
    </div>
  )
}

function JobCard({
  job, status, tracked, updating,
  onStatusChange, onAddToTracker,
}: {
  job: JobMatch; status: ApplicationStatus; tracked: boolean; updating: boolean
  onStatusChange: (s: ApplicationStatus) => void; onAddToTracker: () => void
}) {
  const [open, setOpen] = useState(false)
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const firstPlan = job.action_plan?.[0]
  const statusMeta = STATUS_META[status]

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: 14, padding: "18px 20px",
        background: "rgba(255,255,255,0.03)",
        border: open ? "1px solid rgba(0,245,212,0.35)" : "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)", transition: "all 0.3s",
        transform: open ? "translateY(-2px)" : "none",
        boxShadow: open ? "0 8px 32px rgba(0,0,0,0.3)" : "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "rgba(0,245,212,0.15)" }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F0F4FF", marginBottom: 3 }}>{job.title}</div>
          <div style={{ fontSize: 11, color: "rgba(240,244,255,0.45)" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {tracked && (
            <div style={{
              fontSize: 10, color: statusMeta.color,
              padding: "3px 8px", borderRadius: 999,
              background: `${statusMeta.color}18`,
              border: `1px solid ${statusMeta.color}30`,
              marginBottom: 4,
            }}>
              {statusMeta.label}
            </div>
          )}
          {job.llm_rank && (
            <div style={{ fontSize: 10, color: "rgba(0,245,212,0.6)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Rank #{job.llm_rank}
            </div>
          )}
        </div>
      </div>

      <ScoreBar score={score} />

      {/* Tags */}
      {job.matched_skills?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          {job.matched_skills.slice(0, 5).map((t) => (
            <span key={t} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 999, background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.15)", color: "#00F5D4" }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {job.llm_explanation && (
            <p style={{ fontSize: 12, color: "rgba(240,244,255,0.6)", lineHeight: 1.6, marginBottom: 12 }}>
              {job.llm_explanation}
            </p>
          )}
          {firstPlan && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.2)", fontSize: 12, color: "#00F5D4", marginBottom: 14 }}>
              ⚡ Next: {firstPlan.focus}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            {tracked ? (
              <select
                value={status}
                disabled={updating}
                onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,245,212,0.2)", color: "#F0F4FF", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} style={{ background: "#0C1428" }}>{STATUS_META[s].label}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={onAddToTracker}
                disabled={updating}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(0,245,212,0.3)", background: "rgba(0,245,212,0.08)", color: "#00F5D4", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Track role
              </button>
            )}
            {job.source_url && (
              <a
                href={job.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(240,244,255,0.6)", fontSize: 12, textDecoration: "none" }}
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
    <div style={{ background: "rgba(123,47,255,0.06)", border: "1px solid rgba(123,47,255,0.2)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(123,47,255,0.8)" }}>AI Career Tutor</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
              background: m.role === "user" ? "rgba(123,47,255,0.2)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${m.role === "user" ? "rgba(123,47,255,0.3)" : "rgba(255,255,255,0.08)"}`,
              fontSize: 12, color: "rgba(240,244,255,0.8)", lineHeight: 1.6,
            }}>{m.text}</div>
          </div>
        ))}
        {loading && <div style={{ fontSize: 12, color: "#A97FFF", padding: "4px 0" }}>Thinking…</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask your AI tutor anything…"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,47,255,0.25)", color: "#F0F4FF", fontSize: 12, outline: "none", fontFamily: "inherit" }}
        />
        <button
          onClick={send}
          style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(123,47,255,0.25)", border: "1px solid rgba(123,47,255,0.4)", color: "#A97FFF", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

function GapSkillCard({ skill }: { skill: { skill: string; gap_score: number; job_count_30d: number } }) {
  const pct = Math.round(skill.gap_score)
  const color = pct >= 70 ? "#A97FFF" : pct >= 40 ? "#FFB347" : "#00F5D4"
  return (
    <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#F0F4FF" }}>{skill.skill}</span>
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>Gap: {pct}</span>
      </div>
      <div style={{ height: 2, borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${color},${color}60)`, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 10, color: "rgba(240,244,255,0.35)", marginTop: 4 }}>
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

  const addToTracker = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  const topJobs = useMemo(() => (matchesQuery.data?.jobs ?? []).slice(0, 5), [matchesQuery.data])

  const appsByJobId = useMemo(() => {
    const map: Record<string, { status: ApplicationStatus; appliedAt: string | null }> = {}
    for (const app of appsQuery.data ?? []) {
      map[app.job_id] = { status: app.status, appliedAt: app.applied_at }
    }
    return map
  }, [appsQuery.data])

  const topGapSkills = useMemo(() => (scoresQuery.data?.gap_skills ?? []).slice(0, 4), [scoresQuery.data])

  if (!ready) return null

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(0,245,212,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Matched Jobs + Tracker
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 4 }}>
                Opportunities
              </h1>
              <p style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>
                Top matches · sorted by skill alignment
              </p>
            </div>
            <button
              onClick={() => refreshMatches.mutate()}
              disabled={refreshMatches.isPending}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.25)",
                color: "#00F5D4", cursor: "pointer", fontFamily: "inherit",
                opacity: refreshMatches.isPending ? 0.5 : 1,
              }}
            >
              {refreshMatches.isPending ? "…" : "⟳ Refresh matches"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
          {/* Job cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matchesQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", animation: "pulse 2s infinite" }} />
              ))
            ) : topJobs.length === 0 ? (
              <div style={{
                padding: "48px", textAlign: "center",
                borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.1)",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◆</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#F0F4FF", marginBottom: 6 }}>No matches yet</div>
                <div style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>
                  Upload your CV then click Refresh matches.
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
                    updating={updateStatus.isPending || addToTracker.isPending}
                    onStatusChange={(status) => updateStatus.mutate({ jobId: job.job_id, status })}
                    onAddToTracker={() => addToTracker.mutate(job.job_id)}
                  />
                )
              })
            )}
          </div>

          {/* AI Tutor sidebar */}
          <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <AITutor />
            {topGapSkills.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.1)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 14 }}>
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
  )
}
