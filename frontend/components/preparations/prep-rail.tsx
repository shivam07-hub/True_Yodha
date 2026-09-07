"use client"

/**
 * PrepRail — the standing column of Unified Prep v2 (artboard 2b).
 *
 *   Prep · N live       every room, with its four pips
 *   Training by Finlatics — the three matched to this board
 *   Skill path · Audit  — kept below the training block (Shivam, 2026-09-06)
 *
 * The pips are the whole idea: the same four steps the room shows, at a glance,
 * for every room at once. A room the user has not opened reads as four empty
 * pips, which is true — the ladder never infers progress from an unread room.
 */

import Link from "next/link"
import type { ApplicationResponse, LadderRoom, PrepLadderResponse } from "@/lib/api"
import { displayJobTitle } from "@/lib/jobs/clean-title"
import { CompanyAvatar, STAGE_META } from "@/components/cv/builder/library-shared"
import { SkillPathRail } from "./skill-path-rail"
import { TrainingCard } from "./training-card"
import { AuditCard } from "./audit-card"
import { STEP_LABELS, STEP_LEGEND, roomStage } from "./prep-model"

function StepPips({ steps, className }: { steps: number[]; className: string }) {
  return (
    <span className={className} aria-hidden>
      {STEP_LABELS.map((label, index) => (
        <span key={label} data-state={steps[index] ?? 0} />
      ))}
    </span>
  )
}

function RoomRow({
  app,
  room,
  selected,
}: {
  app: ApplicationResponse
  room: LadderRoom | undefined
  selected: boolean
}) {
  const steps = room?.steps ?? [0, 0, 0, 0]
  const meta = STAGE_META[app.status]
  const stage = meta?.label ?? app.status
  // A closed room has no ladder — the ladder covers live rooms only. Rendering
  // it at 0% with four empty pips would say "you never prepared" about a job
  // that is simply over, and the reader would have no way to tell the two
  // apart. Closed rooms keep their place and drop the progress claim.
  const closed = roomStage(app.status) === "closed"
  return (
    <Link
      href={`/preparations/${encodeURIComponent(app.job_id)}`}
      className={[
        "prp-lroom tm-control-focus",
        selected ? "is-open" : "",
        closed ? "is-closed" : "",
      ].filter(Boolean).join(" ")}
      aria-current={selected ? "true" : undefined}
    >
      <span className="prp-lroom-top">
        <CompanyAvatar name={app.company ?? "?"} size={28} />
        <span className="prp-lroom-main">
          <span className="prp-lroom-role">{displayJobTitle(app.title, app.company)}</span>
          <span className="prp-lroom-meta">
            {app.company ?? "Unknown company"} · {stage}
          </span>
        </span>
        {closed ? null : (
          <span className="prp-lroom-pct" data-lead={steps.filter((s) => s === 2).length >= 2}>
            {room ? `${room.pct}%` : "··"}
          </span>
        )}
      </span>
      {closed ? null : <StepPips steps={steps} className="prp-lroom-pips" />}
    </Link>
  )
}

export function PrepRail({
  token,
  apps,
  ladder,
  selectedJobId,
  live,
}: {
  token: string
  apps: ApplicationResponse[]
  ladder: PrepLadderResponse | undefined
  selectedJobId: string | null
  live: number
}) {
  const byJob = new Map((ladder?.rooms ?? []).map((room) => [room.job_id, room]))

  return (
    <aside className="mc-ws-rail prp-rail" aria-label="Your rooms, training and skill path">
      <div className="mc-rail">
        <div className="prp-rail-head">
          <div className="prp-rail-title">
            <h1>Prep</h1>
            {live > 0 ? <span className="prp-rail-live">{live} live</span> : null}
          </div>
          <p className="prp-rail-sub">
            Every room walks the same four steps. Clear a step once and it counts
            wherever it applies.
          </p>
          <div className="prp-legend">
            {STEP_LEGEND.map((label) => (
              <span className="prp-legend-col" key={label}>
                <span className="prp-legend-label">{label}</span>
                <span className="prp-legend-bar" aria-hidden />
              </span>
            ))}
          </div>
        </div>

        {apps.length > 0 ? (
          <div className="prp-lrooms">
            {apps.map((app) => (
              <RoomRow
                key={app.job_id}
                app={app}
                room={byJob.get(app.job_id)}
                selected={app.job_id === selectedJobId}
              />
            ))}
          </div>
        ) : null}

        <TrainingCard matches={ladder?.training} note={ladder?.training_note} />
        <SkillPathRail token={token} />
        <AuditCard token={token} />
      </div>
    </aside>
  )
}
