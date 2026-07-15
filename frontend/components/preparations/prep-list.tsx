"use client"

/**
 * PrepList — /preparations: every live room grouped by stage (grill Q4:
 * interviewing first, then applied, closed compact at the bottom). One row =
 * one application; the room is one tap away. Saved jobs never appear —
 * Collections owns pre-apply.
 */

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { cleanJobTitle } from "@/lib/text/strip-markdown"
import { CompanyAvatar, STAGE_META } from "@/components/cv/builder/library-shared"
import {
  daysInStage, followUpLine, groupForList, liveRoomCount, needsStageCheck,
} from "./prep-model"

function Row({ app, now }: { app: ApplicationResponse; now: Date }) {
  const meta = STAGE_META[app.status]
  const days = daysInStage(app, now)
  const needsYou = needsStageCheck(app, now) || followUpLine(app, now) !== null
  const hot = app.status === "interviewing"
  return (
    <Link href={`/preparations/${encodeURIComponent(app.job_id)}`} className="prp-row">
      <CompanyAvatar name={app.company ?? "?"} size={34} />
      <div className="prp-row-main">
        <div className="prp-row-role">{cleanJobTitle(app.title)}</div>
        <div className="prp-row-meta">
          <span>{app.company ?? "Unknown company"}</span>
          <span className="sep">·</span>
          <span>{days === 0 ? "today" : `${days}d in stage`}</span>
        </div>
      </div>
      {needsYou ? <span className="prp-attn">needs you</span> : null}
      <span className={`prp-stage-chip${hot ? " hot" : ""}`} style={!hot ? { color: meta?.color } : undefined}>
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

export function PrepList({ token }: { token: string }) {
  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  if (appsQ.isLoading) {
    return (
      <div className="prp-page">
        <h1 className="prp-title">Preparations</h1>
        <p className="prp-quiet" style={{ marginTop: 16 }}>Loading your rooms…</p>
      </div>
    )
  }

  const now = new Date()
  const apps = appsQ.data ?? []
  const groups = groupForList(apps)
  const live = liveRoomCount(apps)

  return (
    <div className="prp-page">
      <div className="prp-head">
        <h1 className="prp-title">Preparations</h1>
        {live > 0 && <span className="prp-count">{live} live</span>}
      </div>
      <p className="prp-sub">Every job you applied to gets a room — Myro preps you for it.</p>

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
    </div>
  )
}
