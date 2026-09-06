"use client"

/**
 * PrepRoom — one application, walked as four steps (Unified Prep v2, 2b).
 *
 *   ring + "Step 1 clear — you're on step 2 of 4"
 *   1 Evidence · 2 Skill level · 3 Rehearsal · 4 Day-of brief
 *
 * The same four steps the rail shows as pips, from the same read. The panels
 * that used to be free-standing sections are now the bodies of their steps —
 * the work did not change, its order became legible.
 *
 * Deviation from 2b, deliberate: the ledger the design does not draw — the raw
 * JD, Reach, the CV of record and notes — stays below the ladder. 2b is a
 * drawing of the ladder, not an instruction to delete the room's floor.
 */

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  cv as cvApi,
  type ApplicationResponse,
  type ApplicationStatus,
  type LadderRoom,
  type LadderTotals,
} from "@/lib/api"
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
import { daysInStage, roomStage, needsStageCheck, followUpLine, STEP_LABELS } from "./prep-model"
import { CoveragePanel } from "./coverage-panel"
import { RehearsePanel } from "./rehearse-panel"
import { DrillPanel } from "./drill-panel"
import { BriefCard } from "./brief-card"
import { ClosingPanel } from "./closing-panel"
import { PlanLine } from "./plan-line"
import { LevelRows } from "./level-rows"
import { StepCard, CLEAR } from "./step-card"

const RING_CIRCUMFERENCE = 195

function ReadinessRing({ pct, size = 76 }: { pct: number; size?: number }) {
  const filled = Math.round((RING_CIRCUMFERENCE * Math.max(0, Math.min(100, pct))) / 100)
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" className="prp-ring" aria-hidden>
      <circle cx="38" cy="38" r="31" fill="none" strokeWidth="6" className="prp-ring-track" />
      <circle
        cx="38" cy="38" r="31" fill="none" strokeWidth="6" strokeLinecap="round"
        className="prp-ring-fill"
        strokeDasharray={`${filled} ${RING_CIRCUMFERENCE}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="43" textAnchor="middle" className="prp-ring-text">{pct}%</text>
    </svg>
  )
}

function stepSubs(app: ApplicationResponse, room: LadderRoom | undefined): string[] {
  const levels = room?.levels ?? []
  const open = levels.filter((l) => l.held < l.required).length
  return [
    "Every requirement this job states, against the stories you have banked",
    open > 0
      ? `${open} of ${levels.length} levels this job tests are still open`
      : "The levels this job tests, and where you actually are",
    "Your answers, asked back as the interview questions they become",
    "One page: lead-with stories, likely questions, a plan",
  ]
}

export function PrepRoom({
  token,
  app,
  room,
  totals,
}: {
  token: string
  app: ApplicationResponse
  room: LadderRoom | undefined
  totals: LadderTotals | undefined
}) {
  const { updateStatus, updateNotes } = useTrackerBoard()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [openStep, setOpenStep] = React.useState<number | null>(null)
  const now = new Date()

  const stage = roomStage(app.status)
  const stageMeta = STAGE_META[app.status]
  const steps = room?.steps ?? [0, 0, 0, 0]
  const current = room?.current_step ?? 1
  // Until the user opens one themselves, the room opens the step it is on —
  // the answer to "what do I do next" should not need a click.
  const expanded = openStep ?? current - 1

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
  const days = daysInStage(app, now)
  const subs = stepSubs(app, room)
  const bodies = [
    <CoveragePanel key="c" token={token} jobId={app.job_id} />,
    <div key="l">
      <LevelRows rows={room?.levels ?? []} />
      <div className="prp-step-drill"><DrillPanel token={token} jobId={app.job_id} /></div>
    </div>,
    <RehearsePanel key="r" token={token} jobId={app.job_id} />,
    <BriefCard key="b" token={token} jobId={app.job_id} />,
  ]

  return (
    <div className="prp-room">
      <div className="prp-room-head">
        <CompanyAvatar name={app.company ?? "?"} size={40} />
        <div className="prp-room-title">
          <h1 className="prp-room-role">{displayJobTitle(app.title, app.company)}</h1>
          <p className="prp-room-company">
            {app.company ?? "Unknown company"} · {stageMeta?.label ?? app.status} ·{" "}
            {days === 0 ? "today" : `${days} days in stage`}
            {cvVersion ? (
              <>
                {" · CV they have "}
                <Link href={`/cv?jobId=${encodeURIComponent(app.job_id)}`}>
                  v{cvVersion.user_version_number}
                </Link>
              </>
            ) : null}
          </p>
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

      {stageCheck && (
        <div className="prp-stagecheck">
          <span>Heard back?</span>
          <button type="button" onClick={() => setPickerOpen(true)}>Update the stage</button>
        </div>
      )}
      {followUp && !stageCheck && <div className="prp-stagecheck"><span>{followUp}</span></div>}

      {stage === "closed" ? (
        <section className="prp-sec" aria-label="How it ended">
          <div className="prp-sec-head"><span className="prp-sec-label">How it ended</span></div>
          <ClosingPanel token={token} app={app} />
        </section>
      ) : (
        <>
          <div className="prp-band">
            <ReadinessRing pct={room?.pct ?? 0} />
            <div className="prp-band-copy">
              <div className="prp-band-kicker">
                Ready for this {stage === "interviewing" ? "interview" : "application"}
              </div>
              <div className="prp-band-line">
                {current === 1 && steps[0] === 0
                  ? "Nothing cleared yet — start at step 1 of 4"
                  : steps.every((s) => s === CLEAR)
                    ? "All four steps clear"
                    : `Step ${current - 1 || 1} ${current > 1 ? "clear" : "open"} — you're on step ${current} of 4`}
              </div>
              <div className="prp-band-sub">
                Same four steps as every other room — <b>what you clear here carries</b>.
              </div>
            </div>
            <div className="prp-band-pips">
              {STEP_LABELS.map((label, i) => (
                <span className="prp-band-pip" key={label}>
                  <span className="prp-band-pip-n" data-state={steps[i] ?? 0}>{i + 1}</span>
                  <span className="prp-band-pip-l" data-state={steps[i] ?? 0}>{label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="prp-steps">
            {STEP_LABELS.map((label, i) => (
              <StepCard
                key={label}
                index={i}
                value={steps[i] ?? 0}
                currentStep={current}
                sub={subs[i]}
                open={expanded === i}
                onToggle={() => setOpenStep(expanded === i ? -1 : i)}
              >
                {bodies[i]}
              </StepCard>
            ))}
          </div>

          {totals && totals.rooms > 1 ? (
            <div className="prp-across">
              <span>
                Across all {totals.rooms} rooms:{" "}
                {totals.step_pct.map((pct, i) => (
                  <React.Fragment key={STEP_LABELS[i]}>
                    {i > 0 ? ", " : null}
                    {i + 1 === totals.bottleneck_step ? <b>step {i + 1} is {pct}%</b> : `step ${i + 1} is ${pct}%`}
                  </React.Fragment>
                ))}
                . The bottleneck is step {totals.bottleneck_step}.
              </span>
            </div>
          ) : null}

          {app.job_description ? (
            <details className="prp-jd">
              <summary className="prp-jd-summary">The full job description</summary>
              <div className="prp-jd-body">{app.job_description}</div>
            </details>
          ) : null}

          <section className="prp-sec db" aria-label="Reach the people" style={{ background: "transparent" }}>
            <ReachSection
              job={{ job_id: app.job_id, title: app.title, company: app.company, job_description: app.job_description }}
              token={token}
              active
            />
          </section>
        </>
      )}

      <section className="prp-sec" aria-label="On record">
        <div className="prp-sec-head"><span className="prp-sec-label">On record</span></div>
        <div className="prp-record">
          {app.applied_at ? <span>Applied {formatDate(app.applied_at, "short")}</span> : null}
          {stage !== "closed" ? (
            <>
              {app.applied_at ? <span className="sep">·</span> : null}
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
      </section>
    </div>
  )
}
