"use client"

import { useMemo, useState } from "react"
import { APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus, CVVersion } from "@/lib/api"
import {
  CompanyAvatar, StatusDot, Pill,
  STAGE_META, timeAgoShort,
} from "./library-shared"
import { getJobWorkspaceAction, latestCVVersionForJob, pickNewCvJobId } from "@/lib/cv/workspace"
import { I, LIcon } from "./library-icons"
import { StatusPicker } from "../pipeline/StatusPicker"

function CVJobCard({ app, cv, onOpen, onStageChange }: {
  app: ApplicationResponse
  cv: CVVersion | null
  onOpen: () => void
  onStageChange?: (jobId: string, status: ApplicationStatus) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const stage = STAGE_META[app.status] ?? STAGE_META.saved
  const action = getJobWorkspaceAction(cv)

  return (
    <div className="tm-lib-job-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
      <div className="tm-lib-job-card-top">
        {/* Company monogram + name omitted — the folder header already names the
            company; repeating it per card was a redundant second mark. */}
        {onStageChange && app.job_id ? (
          <div className="tm-lib-job-stage-control" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="tm-lib-job-stage tm-lib-job-stage-btn"
              style={{ color: stage.color }}
              onClick={() => setPickerOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              title="Change stage"
            >
              <StatusDot stage={app.status}/>{stage.label} ▾
            </button>
            {pickerOpen && (
              <StatusPicker
                current={app.status}
                onPick={(s) => { setPickerOpen(false); onStageChange(app.job_id, s) }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
        ) : (
          <div className="tm-lib-job-stage" style={{ color: stage.color }}>
            <StatusDot stage={app.status}/>{stage.label}
          </div>
        )}
      </div>

      <div>
        <div className="tm-lib-job-title">{app.title}</div>
        <div className="tm-lib-job-location" style={{ marginTop: 3 }}>
          {app.source ?? ""}
        </div>
      </div>

      <div className="tm-lib-job-meta">
        {cv ? (
          <div>
            <div className="tm-lib-job-meta-label">LATEST CV</div>
            <div className="tm-lib-cv-status-row">
              <LIcon d={I.file} size={12}/>
              <span className="tm-lib-mono">v{cv.user_version_number}</span>
              <span style={{ color: "var(--tm-text-faint)" }}>
                · saved <span className="tm-lib-mono">{timeAgoShort(cv.created_at)}</span> ago
              </span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--tm-warning)", fontWeight: 500 }}>No tailored CV yet</div>
        )}
      </div>

      <div className="tm-lib-job-card-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`tm-lib-btn sm tm-lib-job-card-action-primary${action.tone === "primary" ? " primary" : ""}`}
          onClick={onOpen}
        >
          <LIcon d={cv ? I.file : I.plus} size={12}/> {action.label}
        </button>
      </div>
    </div>
  )
}

export function CompanyFolderRow({ companyName, apps, versions, defaultOpen, onOpenJob, onStageChange }: {
  companyName: string
  apps: ApplicationResponse[]
  versions: CVVersion[]
  defaultOpen?: boolean
  onOpenJob: (jobId: string) => void
  onStageChange?: (jobId: string, status: ApplicationStatus) => void
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const cvsCount = apps.filter((app) => app.job_id && latestCVVersionForJob(app.job_id, versions)).length
  const activeCount = apps.filter((app) => APPLICATION_STAGES.includes(app.status)).length
  const newCvJobId = useMemo(() => pickNewCvJobId(apps, versions), [apps, versions])
  const hasUntailoredRole = apps.some((app) => app.job_id && !latestCVVersionForJob(app.job_id, versions))
  const newCvLabel = hasUntailoredRole ? "Create CV" : "Open role CV"

  function openNewCvTarget() {
    if (newCvJobId) onOpenJob(newCvJobId)
  }

  return (
    <div className="tm-lib-folder-row">
      <div className="tm-lib-folder-header" onClick={() => setOpen(!open)}>
        <button className="tm-lib-folder-chevron" onClick={(e) => { e.stopPropagation(); setOpen(!open) }} aria-label={open ? "Collapse" : "Expand"}>
          <LIcon d={open ? I.chevD : I.chevR}/>
        </button>
        <CompanyAvatar name={companyName} size={32}/>
        <div className="tm-lib-folder-info">
          <div className="tm-lib-folder-name">
            <span className="tm-lib-folder-name-text">{companyName}</span>
            {activeCount > 0 && (
              <Pill>
                <span className="tm-lib-stage-dot" style={{ background: "var(--tm-interactive)", boxShadow: "0 0 4px var(--tm-accent-glow)" }}/>
                {activeCount} active
              </Pill>
            )}
          </div>
          <div className="tm-lib-folder-sub">
            {apps.length} tracked role{apps.length !== 1 ? "s" : ""} · {cvsCount} tailored CV{cvsCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="tm-lib-folder-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="tm-lib-btn sm" onClick={openNewCvTarget} disabled={!newCvJobId}>
            <LIcon d={hasUntailoredRole ? I.plus : I.file} size={12}/> {newCvLabel}
          </button>
        </div>
      </div>

      {open && (
        <div className="tm-lib-folder-body tm-lib-fade-in">
          <div className="tm-lib-job-grid">
            {apps.map((app) => (
              <CVJobCard
                key={app.id}
                app={app}
                cv={app.job_id ? latestCVVersionForJob(app.job_id, versions) : null}
                onOpen={() => app.job_id && onOpenJob(app.job_id)}
                onStageChange={onStageChange}
              />
            ))}
            <button className="tm-lib-new-cv-card" onClick={openNewCvTarget} disabled={!newCvJobId}>
              <LIcon d={hasUntailoredRole ? I.plus : I.file} size={20}/>
              <div className="tm-lib-new-cv-card-title">{newCvLabel} for {companyName}</div>
              <div className="tm-lib-new-cv-card-sub">
                {hasUntailoredRole ? "Starts from Main CV" : "All tracked roles have CVs"}
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
