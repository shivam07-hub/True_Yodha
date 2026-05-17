"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { JobMatch } from "@/lib/api"

function scoreColor(score: number): string {
  if (score >= 75) return "var(--tm-success)"
  if (score >= 50) return "var(--tm-warning)"
  return "var(--tm-text-faint)"
}

interface JobCardProps {
  job: JobMatch
  isTracked?: boolean
  onTrack: (jobId: string) => void
  onSelect?: (jobId: string) => void
}

export function JobCard({ job, isTracked, onTrack, onSelect }: JobCardProps) {
  const [showExplanation, setShowExplanation] = useState(false)
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const color = scoreColor(score)
  const explanationId = `job-explanation-${job.id}`

  return (
    <article
      style={{
        borderRadius: "var(--tm-radius)",
        border: "1px solid var(--tm-border-soft)",
        background: "rgba(255,255,255,0.02)",
        padding: "var(--tm-card-pad)",
        transition: "border-color var(--tm-dur) var(--tm-ease)",
        cursor: onSelect ? "pointer" : "default",
      }}
      onClick={onSelect ? () => onSelect(job.job_id) : undefined}
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
        <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExplanation((v) => !v)}
            aria-expanded={showExplanation}
            aria-controls={explanationId}
          >
            {showExplanation ? <ChevronUp /> : <ChevronDown />}
            {showExplanation ? "Hide explanation" : "Show explanation"}
          </Button>
          {showExplanation && (
            <p id={explanationId} style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
              {job.llm_explanation}
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrack(job.job_id)}
          disabled={isTracked}
        >
          {isTracked ? "Saved" : "+ Save"}
        </Button>
        <Link
          href={`/cv?jobId=${job.job_id}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 13, fontWeight: 600,
            color: "var(--tm-accent)", textDecoration: "none",
            transition: "opacity var(--tm-dur) var(--tm-ease)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.75" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1" }}
        >
          Open CV Builder →
        </Link>
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
