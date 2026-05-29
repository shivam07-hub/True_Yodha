"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApplyRow } from "@/components/jobs/apply-row"
import { GradeBadge, VerdictPill } from "@/components/jobs/match-brain"
import type { JobMatch } from "@/lib/api"
import { stripMarkdown } from "@/lib/text/strip-markdown"

function fitColor(score: number): string {
  if (score >= 75) return "var(--tm-success)"
  if (score >= 50) return "var(--tm-warning)"
  return "var(--tm-danger)"
}

function locationLabel(job: JobMatch): string {
  const explicit = (job.location || "").trim()
  if (explicit) return explicit
  const city = (job.location_city || "").trim()
  const country = (job.location_country || "").trim()
  if (city && country) return `${city}, ${country}`
  return city || country || "Location unknown"
}

function modeLabel(mode: JobMatch["location_mode"]): string | null {
  if (!mode || mode === "unknown") return null
  if (mode === "onsite") return "On-site"
  if (mode === "remote") return "Remote"
  return "Hybrid"
}

interface JobCardProps {
  job: JobMatch
  isTracked?: boolean
  onTrack: (jobId: string) => void
  onSelect?: (jobId: string) => void
}

export function JobCard({ job, isTracked, onTrack, onSelect }: JobCardProps) {
  const fit = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const fitTone = fitColor(fit)
  const location = locationLabel(job)
  const mode = modeLabel(job.location_mode)

  return (
    <article
      style={{
        border: "1.5px solid var(--tm-int-border)",
        borderRadius: 10,
        padding: "18px 18px 16px",
        background: "var(--tm-surface)",
        position: "relative",
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
      }}
      onClick={onSelect ? () => onSelect(job.job_id) : undefined}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at 100% 0%, var(--tm-int-bg-wash), transparent 50%)",
        }}
      />

      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--tm-font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--tm-interactive)",
              marginBottom: 6,
            }}
          >
            Focused on: <span style={{ color: "var(--tm-text)" }}>{job.company || "Unknown company"}</span>
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--tm-text)",
              lineHeight: 1.2,
            }}
          >
            {job.title}
          </h3>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--tm-font-mono)",
              fontSize: 11,
              color: "var(--tm-text-faint)",
            }}
          >
            <span>{location}</span>
            {mode ? <span style={{ color: "var(--tm-text-muted)" }}>{mode}</span> : null}
            {job.industry ? <span style={{ color: "var(--tm-text-muted)" }}>{job.industry}</span> : null}
            {job.llm_rank != null ? <span style={{ color: "var(--tm-interactive)" }}>Rank #{job.llm_rank}</span> : null}
          </div>
          {(job.grade || job.recommendation) ? (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <GradeBadge grade={job.grade} />
              <VerdictPill recommendation={job.recommendation} />
              {job.overall_score != null ? (
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
                  {job.overall_score.toFixed(1)}/5
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--tm-font-mono)",
              fontSize: 34,
              fontWeight: 700,
              color: fitTone,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {fit}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: "var(--tm-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--tm-text-faint)",
            }}
          >
            Fit
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <ApplyRow company={job.company} title={job.title} jobId={job.job_id} variant="compact" />
      </div>

      <div style={{ height: 4, borderRadius: 999, background: "var(--tm-border)", overflow: "hidden", marginTop: 12, position: "relative" }}>
        <div
          style={{
            height: "100%",
            width: `${fit}%`,
            borderRadius: 999,
            background: fitTone,
            boxShadow: `0 0 6px ${fitTone}40`,
            transition: "width 600ms var(--tm-ease)",
          }}
        />
      </div>

      {job.matched_skills?.length ? (
        <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", position: "relative" }}>
          {job.matched_skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--tm-success-border)",
                background: "var(--tm-success-wash)",
                color: "var(--tm-success)",
                fontSize: 11,
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 14, borderTop: "1px dashed var(--tm-border)", paddingTop: 12, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--tm-text-muted)",
              fontFamily: "var(--tm-font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {job.application_angle ? "How to position" : "Why this is a good fit"}
          </span>
          <span
            style={{
              minHeight: 20,
              borderRadius: 6,
              border: "1px solid var(--tm-int-border)",
              padding: "0 6px",
              display: "inline-flex",
              alignItems: "center",
              fontFamily: "var(--tm-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--tm-interactive)",
              background: "var(--tm-int-bg-wash)",
            }}
          >
            LLM
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--tm-text-muted)",
            lineHeight: 1.65,
            paddingLeft: 10,
            borderLeft: "2px solid var(--tm-interactive)",
          }}
        >
          {stripMarkdown(job.application_angle || job.summary || job.llm_explanation) || "No explanation available yet for this role."}
        </p>
        {job.job_description ? (
          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 12,
              color: "var(--tm-text-faint)",
              lineHeight: 1.55,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {job.job_description}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" onClick={() => onTrack(job.job_id)} disabled={isTracked}>
          {isTracked ? "Saved" : "+ Save"}
        </Button>
        {onSelect && (job.overall_score != null || job.summary) ? (
          <Button variant="outline" size="sm" onClick={() => onSelect(job.job_id)}>
            Breakdown
          </Button>
        ) : null}
        <Link
          href={`/cv?jobId=${job.job_id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          Tailor CV
        </Link>
        {job.source_url ? (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--tm-text-muted)",
              textDecoration: "none",
            }}
          >
            Open role <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        ) : null}
      </div>
    </article>
  )
}
