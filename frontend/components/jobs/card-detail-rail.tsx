"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Sparkles, CheckCheck, Users, FileText } from "lucide-react"
import { jobs as jobsApi, type JobMatch } from "@/lib/api"

/**
 * CardDetailRail — the per-section disclosure on a collection card. Four chips
 * (Why fit · Match · Reach · JD); clicking one opens ONLY its panel inline, one
 * at a time (never the whole drawer, never all sections). Fills the card's dead
 * space with CTAs, not filler.
 *
 * Three panels render from the cached brain fields already on the JobMatch (no
 * fetch); Reach lazy-loads the free deterministic search (ADR-0018) on first
 * open. Every panel handles missing data honestly — a card the brain hasn't
 * ranked shows a "run a search" nudge, never an empty shell.
 */

type Tab = "why" | "match" | "reach" | "jd"

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "why", label: "Why you fit", icon: <Sparkles size={15} aria-hidden /> },
  { key: "match", label: "Match", icon: <CheckCheck size={15} aria-hidden /> },
  { key: "reach", label: "Reach", icon: <Users size={15} aria-hidden /> },
  { key: "jd", label: "JD", icon: <FileText size={15} aria-hidden /> },
]

export function CardDetailRail({ token, jobId, job }: { token: string; jobId: string; job: JobMatch }) {
  const [tab, setTab] = React.useState<Tab | null>(null)
  const matched = job.matched_skills ?? []
  const missing = job.missing_skills ?? []
  const matchCount = matched.length + missing.length

  return (
    <div className="fc-rail" onClick={(e) => e.stopPropagation()}>
      <div className="fc-rail-tabs">
        {TABS.map((t) => {
          const count = t.key === "match" && matchCount > 0 ? ` ${matched.length}/${matchCount}` : ""
          return (
            <button
              key={t.key}
              type="button"
              className={`fc-rail-tab tm-control-focus${tab === t.key ? " is-on" : ""}`}
              aria-expanded={tab === t.key}
              onClick={() => setTab((cur) => (cur === t.key ? null : t.key))}
            >
              {t.icon}
              {t.label}
              {count}
            </button>
          )
        })}
      </div>
      {tab ? (
        <div className="fc-rail-panel" role="region">
          {tab === "why" ? <WhyPanel job={job} /> : null}
          {tab === "match" ? <MatchPanel matched={matched} missing={missing} /> : null}
          {tab === "reach" ? <ReachPanel token={token} jobId={jobId} job={job} /> : null}
          {tab === "jd" ? <JdPanel job={job} /> : null}
        </div>
      ) : null}
    </div>
  )
}

function WhyPanel({ job }: { job: JobMatch }) {
  const strengths = job.strengths ?? []
  if (!job.summary && strengths.length === 0 && !job.application_angle) {
    return <p style={{ color: "var(--tm-text-muted)" }}>Run a Myro Search to see why this role fits you.</p>
  }
  return (
    <>
      <h4>Why you fit</h4>
      {job.summary ? <p>{job.summary}</p> : null}
      {strengths.length > 0 ? (
        <ul>
          {strengths.slice(0, 4).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : null}
      {job.application_angle ? (
        <p style={{ marginTop: 8, color: "var(--tm-text-muted)" }}>
          <span style={{ color: "var(--tm-text)", fontWeight: 500 }}>How to position: </span>
          {job.application_angle}
        </p>
      ) : null}
    </>
  )
}

function MatchPanel({ matched, missing }: { matched: string[]; missing: string[] }) {
  if (matched.length === 0 && missing.length === 0) {
    return <p style={{ color: "var(--tm-text-muted)" }}>No skill data for this role yet.</p>
  }
  return (
    <>
      <h4>You already match {matched.length}/{matched.length + missing.length}</h4>
      <div className="fc-rail-chips">
        {matched.map((s) => (
          <span key={s} className="fc-chip fc-chip-count">{s}</span>
        ))}
        {missing.map((s) => (
          <a key={s} href={`/forge?skill=${encodeURIComponent(s)}`} className="fc-chip is-gap" title={`Practice ${s} in Forge`}>
            {s}
          </a>
        ))}
      </div>
    </>
  )
}

function ReachPanel({ token, jobId, job }: { token: string; jobId: string; job: JobMatch }) {
  const q = useQuery({
    queryKey: ["reachSearch", jobId],
    queryFn: () =>
      jobsApi.reachSearch(token, {
        job_title: job.title,
        company: job.company,
        job_description: job.job_description ?? job.job_summary ?? undefined,
      }),
    staleTime: 30 * 60 * 1000,
  })
  if (q.isLoading) return <p className="fc-rail-loading">Finding the people to reach…</p>
  if (q.isError || !q.data) return <p style={{ color: "var(--tm-text-muted)" }}>People search for {job.company ?? "this company"} isn’t ready yet.</p>
  const links = [q.data.primary, ...q.data.alternates].filter(Boolean) as { label: string; url: string; kind: string }[]
  if (links.length === 0) return <p style={{ color: "var(--tm-text-muted)" }}>No reach search for this role.</p>
  return (
    <>
      <h4>Reach the people</h4>
      <div className="fc-rail-reach">
        {links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
            <span>{l.label}</span>
            <span className="fc-rail-reach-kind">{l.kind === "linkedin" ? "in ↗" : "web ↗"}</span>
          </a>
        ))}
      </div>
    </>
  )
}

function JdPanel({ job }: { job: JobMatch }) {
  const text = (job.job_summary?.trim() || job.job_description?.trim()) ?? ""
  if (!text) return <p style={{ color: "var(--tm-text-muted)" }}>No description on file for this role.</p>
  return (
    <>
      <h4>Job description</h4>
      <div className="fc-rail-jd">{text}</div>
    </>
  )
}
