"use client"

/**
 * PrepList — /preparations: every live room grouped by stage (grill Q4:
 * interviewing first, then applied, closed compact at the bottom). One row =
 * one application; the room is one tap away. Saved jobs never appear —
 * Collections owns pre-apply.
 *
 * Desktop: tm-intel-page (1480) + mc-workspace 2:3 (standing column · rooms).
 * Standing column: compact Skill path (radar as mark) then Training by Finlatics.
 */

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { displayJobTitle } from "@/lib/jobs/clean-title"
import { CompanyAvatar, STAGE_META } from "@/components/cv/builder/library-shared"
import { PrepSkeleton } from "./prep-skeleton"
import { SkillPathRail } from "./skill-path-rail"
import { TrainingCard } from "./training-card"
import {
  daysInStage, followUpLine, groupForList, liveRoomCount, needsStageCheck,
} from "./prep-model"
import "@/app/(authed)/home/mission-control.css"

function Row({ app, now }: { app: ApplicationResponse; now: Date }) {
  const meta = STAGE_META[app.status]
  const days = daysInStage(app, now)
  const needsYou = needsStageCheck(app, now) || followUpLine(app, now) !== null
  const hot = app.status === "interviewing"
  return (
    <Link href={`/preparations/${encodeURIComponent(app.job_id)}`} className="prp-row tm-control-focus">
      <CompanyAvatar name={app.company ?? "?"} size={34} />
      <div className="prp-row-main">
        <div className="prp-row-role">{displayJobTitle(app.title, app.company)}</div>
        <div className="prp-row-meta">
          <span>{app.company ?? "Unknown company"}</span>
          <span className="sep">·</span>
          <span>{days === 0 ? "today" : `${days}d in stage`}</span>
        </div>
      </div>
      {needsYou ? <span className="prp-attn">needs you</span> : null}
      <span className={`prp-stage-chip${hot ? " hot" : ""}`}>
        {meta?.label ?? app.status}
      </span>
      <span className="prp-row-chev" aria-hidden>›</span>
    </Link>
  )
}

function Group({ label, items, now }: { label: string; items: ApplicationResponse[]; now: Date }) {
  if (items.length === 0) return null
  return (
    <div className="prp-group">
      <div className="prp-group-head">
        <span>{label}</span>
        <span className="n">{items.length}</span>
        <span className="prp-group-line" />
      </div>
      {items.map((app) => <Row key={app.id} app={app} now={now} />)}
    </div>
  )
}

function PrepFrame({
  token, live, children,
}: {
  token: string
  live?: number
  children: ReactNode
}) {
  return (
    <div className="tm-intel-page prp-workspace-page">
      <div className="prp-head">
        <h1 className="prp-title">Preparations</h1>
        {live ? <span className="prp-count">{live} live</span> : null}
      </div>
      <div className="mc-workspace">
        <aside className="mc-ws-rail" aria-label="Skill path and training">
          <div className="mc-rail">
            <SkillPathRail token={token} />
            <TrainingCard />
          </div>
        </aside>
        <div className="mc-ws-main">{children}</div>
      </div>
    </div>
  )
}

export function PrepList({ token }: { token: string }) {
  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  if (appsQ.isLoading) return <PrepSkeleton />

  const now = new Date()
  const apps = appsQ.data ?? []
  const groups = groupForList(apps)
  const live = liveRoomCount(apps)

  return (
    <PrepFrame token={token} live={live}>
      {live === 0 && groups.closed.length === 0 ? (
        <div className="prp-empty">
          Nothing to prep yet.{" "}
          <Link href="/collections">Apply to a job in Collections</Link> and its room opens here.
        </div>
      ) : (
        <>
          <Group label="Interviewing" items={groups.interviewing} now={now} />
          <Group label="Applied" items={groups.applied} now={now} />
          <Group label="Closed" items={groups.closed} now={now} />
        </>
      )}
    </PrepFrame>
  )
}
