"use client"

/**
 * PrepRoom — one application's mission room (grill Q4: a proper surface).
 *
 * Stage shapes the room (Q1/Q2/Q3):
 *   applied      → coverage panel + reach + follow-up timer
 *   interviewing → + rehearse + inline drill + day-of brief
 *   outcome      → closing mode (review + what-you-keep)
 * The ledger lives INSIDE the room: stage picker, CV-of-record, notes.
 */

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { cv as cvApi, type ApplicationResponse, type ApplicationStatus } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatDate } from "@/lib/format"
import { displayJobTitle } from "@/lib/jobs/clean-title"
import "@/components/dashboard/dashboard.css"
import { latestCVVersionForJob } from "@/lib/cv/workspace"
import { CompanyAvatar, STAGE_META } from "@/components/cv/builder/library-shared"
import { StatusPicker } from "@/components/cv/pipeline/StatusPicker"
import { NotesEditor } from "@/components/cv/pipeline/NotesEditor"
import { useTrackerBoard } from "@/components/cv/pipeline/useTrackerBoard"
import { ReachSection } from "@/components/dashboard/reach-section"
import { roomStage, needsStageCheck, followUpLine } from "./prep-model"
import { CoveragePanel } from "./coverage-panel"
import { RehearsePanel } from "./rehearse-panel"
import { DrillPanel } from "./drill-panel"
import { BriefCard } from "./brief-card"
import { ClosingPanel } from "./closing-panel"
import { PlanLine } from "./plan-line"

function Section({ label, note, children }: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="prp-sec" aria-label={label}>
      <div className="prp-sec-head">
        <span className="prp-sec-label">{label}</span>
        {note ? <span className="prp-sec-note">{note}</span> : null}
      </div>
      {children}
    </section>
  )
}

export function PrepRoom({ token, app }: { token: string; app: ApplicationResponse }) {
  const { updateStatus, updateNotes } = useTrackerBoard()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const now = new Date()

  const stage = roomStage(app.status)
  const stageMeta = STAGE_META[app.status]

  const versionsQ = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cvApi.versions.list(token, null),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const cvVersion = latestCVVersionForJob(app.job_id, versionsQ.data?.versions ?? [])

  function pickStage(status: ApplicationStatus) {
    setPickerOpen(false)
    if (status !== app.status) updateStatus.mutate({ jobId: app.job_id, status })
  }

  const followUp = stage === "applied" ? followUpLine(app, now) : null
  const stageCheck = stage === "applied" && needsStageCheck(app, now)

  return (
    <div className="prp-page">
      <Link href="/preparations" className="prp-back">← Preparations</Link>

      <div className="prp-room-head" style={{ marginTop: 10 }}>
        <CompanyAvatar name={app.company ?? "?"} size={40} />
        <div className="prp-room-title">
          <h1 className="prp-room-role">{displayJobTitle(app.title, app.company)}</h1>
          <p className="prp-room-company">{app.company ?? "Unknown company"}</p>
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="prp-stage-btn"
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <span style={{ color: stageMeta?.color }}>●</span> {stageMeta?.label ?? app.status} ▾
          </button>
          {pickerOpen && (
            <StatusPicker current={app.status} onPick={pickStage} onClose={() => setPickerOpen(false)} />
          )}
        </div>
      </div>

      {/* Quiet stage-check — one line, never a modal (grill Q10). */}
      {stageCheck && (
        <div className="prp-stagecheck">
          <span>Heard back?</span>
          <button type="button" onClick={() => setPickerOpen(true)}>Update the stage</button>
        </div>
      )}
      {followUp && !stageCheck && <div className="prp-stagecheck"><span>{followUp}</span></div>}

      {stage === "closed" ? (
        <Section label="How it ended">
          <ClosingPanel token={token} app={app} />
        </Section>
      ) : (
        <>
          <Section label="What this job wants">
            <CoveragePanel token={token} jobId={app.job_id} />
          </Section>

          {stage === "interviewing" && (
            <>
              <Section label="Rehearse">
                <RehearsePanel token={token} jobId={app.job_id} />
              </Section>
              <Section label="Skill drill">
                <DrillPanel token={token} jobId={app.job_id} />
              </Section>
              <Section label="Day-of brief">
                <BriefCard token={token} jobId={app.job_id} />
              </Section>
            </>
          )}

          {/* The floor: the raw JD, always here, zero LLM. When any surface
              above fails to parse, the user can still read the job and prep
              like a human — never a dead end. */}
          {app.job_description ? (
            <details className="prp-jd">
              <summary className="prp-jd-summary">The full job description</summary>
              <div className="prp-jd-body">{app.job_description}</div>
            </details>
          ) : null}

          {/* ReachSection carries its own head; the .db wrapper scopes the
              --db-* tokens it styles with (portal token-scope precedent). */}
          <section className="prp-sec db" aria-label="Reach the people" style={{ background: "transparent" }}>
            <ReachSection
              job={{ job_id: app.job_id, title: app.title, company: app.company, job_description: app.job_description }}
              token={token}
              active
            />
          </section>
        </>
      )}

      <Section label="On record">
        <div className="prp-record">
          {cvVersion ? (
            <>
              <span>
                CV they have: <Link href={`/cv?jobId=${encodeURIComponent(app.job_id)}`}>v{cvVersion.user_version_number}</Link>
              </span>
              <span className="sep">·</span>
            </>
          ) : null}
          {app.applied_at ? <span>Applied {formatDate(app.applied_at, "short")}</span> : null}
          {/* The post-apply moment: beside the CV they actually sent, which is
              where "is this right for the job" is a live question. */}
          {stage !== "closed" ? (
            <>
              <span className="sep">·</span>
              <PlanLine token={token} />
            </>
          ) : null}
        </div>
        <div style={{ marginTop: 8 }}>
          <NotesEditor
            initial={app.notes}
            onSave={(notes) => updateNotes.mutate({ jobId: app.job_id, notes })}
          />
        </div>
      </Section>
    </div>
  )
}
