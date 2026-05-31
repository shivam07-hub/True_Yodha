"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  jobs as jobsApi,
  APPLICATION_STAGES,
  APPLICATION_OUTCOMES,
  type ApplicationStatus,
  type JobMatch,
  type SkillGapItem,
  type SkillGapResponse,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { LENSES, type LensKey } from "@/lib/dashboard/feed-model"
import { LensOverview, LensWhy, LensSkills } from "./lenses"
import { LensCompany, type OtherRole } from "./lens-company"
import { CommentThread } from "@/components/comments/comment-thread"

const STAGE_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  final_round: "Final Round",
  ghosted: "Ghosted",
  rejected: "Rejected",
  offer: "Offer 🎉",
  withdrew: "Withdrew",
}

export interface JobCardProps {
  job: JobMatch
  status: ApplicationStatus
  token: string
  active: boolean
  cartSkillNames: Set<string>
  otherRoles: OtherRole[]
  onStatus: (s: ApplicationStatus) => void
  onSkillToggle: (s: SkillGapItem) => void
  onJump?: (jobId: string) => void
}

/** Shared data + action model behind both the mobile slides and desktop tabs. */
function useCardModel({ job, token, active }: Pick<JobCardProps, "job" | "token" | "active">) {
  const { data, isLoading } = useQuery<SkillGapResponse>({
    queryKey: dataKeys.skillGap(job.job_id),
    queryFn: () => jobsApi.skillGap(token, job.job_id),
    enabled: !!token && !!job.job_id && active,
    staleTime: 10 * 60 * 1000,
  })
  return { skills: data?.skills ?? [], loadingSkills: isLoading }
}

function StatusBar({ status, fit, onStatus }: { status: ApplicationStatus; fit: number; onStatus: (s: ApplicationStatus) => void }) {
  return (
    <select
      aria-label="Application status"
      value={status}
      onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
      className="db-status tm-control-focus"
      style={{ ["--db-bar-w" as string]: `${fit}%` }}
    >
      <optgroup label="Progress">
        {APPLICATION_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </optgroup>
      <optgroup label="Outcome">
        {APPLICATION_OUTCOMES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </optgroup>
    </select>
  )
}

/** Per-lens secondary action (Q3: bar adapts to current lens). */
function LensAction({ lens, job, cartSize }: { lens: LensKey; job: JobMatch; cartSize: number }) {
  if (lens === "overview" || lens === "why") {
    return <Link className="db-act-btn" href={`/cv?jobId=${job.job_id}`}>Tailor CV</Link>
  }
  if (lens === "skills") {
    return cartSize > 0
      ? <Link className="db-act-btn accent" href="/forge">Open Forge · {cartSize}</Link>
      : <span className="db-act-hint">Tap a skill to lock it</span>
  }
  if (lens === "notes") {
    return <span className="db-act-hint">Private to you</span>
  }
  return <span className="db-act-hint">Dig deeper below</span>
}

function renderLens(key: LensKey, p: JobCardProps, model: ReturnType<typeof useCardModel>) {
  const lensProps = {
    job: p.job,
    skills: model.skills,
    loadingSkills: model.loadingSkills,
    token: p.token,
    active: p.active,
    cartSkillNames: p.cartSkillNames,
    onSkillToggle: p.onSkillToggle,
  }
  if (key === "overview") return <LensOverview job={p.job} skills={model.skills} />
  if (key === "why") return <LensWhy {...lensProps} />
  if (key === "skills") return <LensSkills {...lensProps} />
  if (key === "notes") {
    return (
      <div className="db-lens-notes">
        <CommentThread token={p.token} entityType="job" entityId={p.job.job_id} placeholder={`Note your progress on ${p.job.company ?? "this role"}…`} />
      </div>
    )
  }
  return <LensCompany job={p.job} token={p.token} active={p.active} otherRoles={p.otherRoles} onJump={p.onJump} />
}

/* ── Mobile: horizontal scroll-snap slides ────────────────────────────────── */

export function JobCardSlides(p: JobCardProps) {
  const model = useCardModel(p)
  const fit = Math.max(0, Math.min(100, Math.round(p.job.overlap_score)))
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [idx, setIdx] = React.useState(0)

  const onScroll = React.useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIdx((prev) => (prev === i ? prev : i))
  }, [])

  return (
    <div className="db-card db-card--slides">
      <div className="db-slide-track" ref={trackRef} onScroll={onScroll}>
        {LENSES.map((l) => (
          <div className="db-slide" key={l.key}>{renderLens(l.key, p, model)}</div>
        ))}
      </div>
      <div className="db-dots" aria-hidden>
        {LENSES.map((l, i) => <span key={l.key} className={i === idx ? "on" : ""} />)}
      </div>
      <div className="db-actionbar">
        <StatusBar status={p.status} fit={fit} onStatus={p.onStatus} />
        <LensAction lens={LENSES[idx]?.key ?? "overview"} job={p.job} cartSize={p.cartSkillNames.size} />
      </div>
    </div>
  )
}

/* ── Desktop: lens tabs ───────────────────────────────────────────────────── */

export function JobCardTabs(p: JobCardProps) {
  const model = useCardModel(p)
  const fit = Math.max(0, Math.min(100, Math.round(p.job.overlap_score)))
  const [lens, setLens] = React.useState<LensKey>("overview")
  return (
    <div className="db-card db-card--tabs">
      <div className="db-tabs" role="tablist">
        {LENSES.map((l) => (
          <button
            key={l.key}
            type="button"
            role="tab"
            aria-selected={lens === l.key}
            className={`db-tab tm-control-focus${lens === l.key ? " active" : ""}`}
            onClick={() => setLens(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="db-tab-panel">{renderLens(lens, p, model)}</div>
      <div className="db-actionbar">
        <StatusBar status={p.status} fit={fit} onStatus={p.onStatus} />
        <LensAction lens={lens} job={p.job} cartSize={p.cartSkillNames.size} />
      </div>
    </div>
  )
}
