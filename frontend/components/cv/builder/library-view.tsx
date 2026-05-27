/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 * Company-folder layout with an active pipeline rail.
 */
"use client"

import Link from "next/link"
import { useState } from "react"
import type { ApplicationResponse, ApplicationStatus, CVVersion, UserProfile } from "@/lib/api"
import {
  CompanyAvatar, StatTile, StatusDot, Pill,
  ApertureMark, STAGE_META, ACTIVE_STAGES, stageRank,
  latestVersionForJob, timeAgoShort,
} from "./library-shared"
import "./library-view.css"

interface LibraryViewProps {
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onOpenMaster: () => void
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
}

// ── Icon (inline SVG – keeps tree-shaking tight) ─────────────────
function LIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>
    </svg>
  )
}
const I = {
  folder:   "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  plus:     "M12 5v14M5 12h14",
  chevR:    "M9 6l6 6-6 6",
  chevD:    "M6 9l6 6 6-6",
  edit:     "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  share:    "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  target:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  pulse:    "M3 12h4l2-6 4 12 2-6h6",
  file:     "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z M14 3v6h6",
  upload:   "M12 21V9m0 0L7 14m5-5l5 5 M4 5h16",
}

// ── Master CV hero card ───────────────────────────────────────────
function MasterCVHero({ baseline, profile, onOpen, onReplace }: {
  baseline: CVVersion | null
  profile: UserProfile | null
  onOpen: () => void
  onReplace: () => void
}) {
  const vNum = baseline ? `v${baseline.user_version_number}` : "v0"
  const updatedAgo = baseline ? timeAgoShort(baseline.created_at) : "—"
  const displayName = profile?.full_name ?? "Your Name"
  const previewLines = [78, 92, 64, 88, 70, 95, 82, 60]

  return (
    <div className="tm-lib-master-card">
      <div className="tm-lib-master-preview">
        <div className="tm-lib-master-preview-name">{displayName.split(" ")[0].toUpperCase()}</div>
        {previewLines.map((w, i) => (
          <div key={i} className="tm-lib-master-preview-line" style={{
            height: i === 0 ? 6 : 3,
            width: `${w}%`,
            background: i === 0 ? "var(--tm-text-muted)" : "var(--tm-border-soft)",
          }}/>
        ))}
        <div className="tm-lib-master-aperture">
          <ApertureMark size={10}/>
        </div>
      </div>

      <div className="tm-lib-master-body">
        <div className="tm-lib-master-header">
          <div style={{ minWidth: 0 }}>
            <div className="tm-lib-eyebrow" style={{ color: "var(--tm-interactive)" }}>
              MAIN CV · SOURCE OF TRUTH
            </div>
            <div className="tm-lib-master-name">{displayName}</div>
            <div className="tm-lib-master-role">
              {(profile?.target_roles?.[0]) ?? "Senior Product Manager"}
              {profile?.target_location ? ` · ${profile.target_location}` : ""}
            </div>
          </div>
          <span className="tm-lib-master-version">{vNum}</span>
        </div>

        <div className="tm-lib-master-stats">
          {baseline && (
            <>
              <span>updated <span className="tm-lib-master-stats-val tm-lib-mono">{updatedAgo}</span> ago</span>
              <span className="tm-lib-master-stats-sep">·</span>
            </>
          )}
          {!baseline && (
            <span style={{ color: "var(--tm-text-faint)" }}>No CV uploaded yet</span>
          )}
        </div>

        <div className="tm-lib-master-actions">
          <button className="tm-lib-btn primary sm" onClick={onOpen}>
            <LIcon d={I.edit} size={13}/> Open Master CV
          </button>
          <button className="tm-lib-btn ghost sm" onClick={onReplace}>
            <LIcon d={I.upload} size={13}/> Replace upload
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CV Job card ───────────────────────────────────────────────────
function CVJobCard({ app, cv, onOpen }: {
  app: ApplicationResponse
  cv: CVVersion | null
  onOpen: () => void
}) {
  const stage = STAGE_META[app.status] ?? STAGE_META.saved
  return (
    <div className="tm-lib-job-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onOpen()}>
      <div className="tm-lib-job-card-top">
        <CompanyAvatar name={app.company ?? "?"} size={22}/>
        <span className="tm-lib-eyebrow" style={{ fontSize: 10 }}>{app.company}</span>
        <div className="tm-lib-job-stage" style={{ color: stage.color }}>
          <StatusDot stage={app.status}/>{stage.label}
        </div>
      </div>

      <div>
        <div className="tm-lib-job-title">{app.title}</div>
        <div className="tm-lib-job-location" style={{ marginTop: 3 }}>
          {app.source ?? ""}
        </div>
      </div>

      <div className="tm-lib-job-meta">
        {cv && (
          <>
            <div>
              <div className="tm-lib-job-meta-label">CV STATUS</div>
              <div className="tm-lib-cv-status-row">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/>
                  <path d="M14 3v6h6 M8 13h8M8 17h5"/>
                </svg>
                <span className="tm-lib-mono">v{cv.user_version_number}</span>
                <span style={{ color: "var(--tm-text-faint)" }}>
                  · updated <span className="tm-lib-mono">{timeAgoShort(cv.created_at)}</span>
                </span>
              </div>
            </div>
          </>
        )}
        {!cv && (
          <div style={{ fontSize: 12, color: "var(--tm-warning)", fontWeight: 500 }}>No CV yet</div>
        )}
      </div>

      <div className="tm-lib-job-card-actions" onClick={e => e.stopPropagation()}>
        {cv ? (
          <>
            <button className="tm-lib-btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={onOpen}>
              <LIcon d={I.edit} size={12}/> Edit
            </button>
            <button className="tm-lib-btn primary sm" style={{ flex: 1.4, justifyContent: "center" }} onClick={onOpen}>
              <LIcon d={I.download} size={12}/> Download & Apply
            </button>
          </>
        ) : (
          <button className="tm-lib-btn primary sm" style={{ flex: 1, justifyContent: "center" }} onClick={onOpen}>
            <LIcon d={I.plus} size={12}/> Start CV for this role
          </button>
        )}
      </div>
    </div>
  )
}

// ── Company folder row ────────────────────────────────────────────
function CompanyFolderRow({ companyName, apps, versions, defaultOpen, onOpenJob }: {
  companyName: string
  apps: ApplicationResponse[]
  versions: CVVersion[]
  defaultOpen?: boolean
  onOpenJob: (jobId: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const cvsCount = apps.filter(a => a.job_id && latestVersionForJob(a.job_id, versions)).length
  const activeCount = apps.filter(a => ACTIVE_STAGES.includes(a.status)).length

  return (
    <div className="tm-lib-folder-row">
      <div className="tm-lib-folder-header" onClick={() => setOpen(!open)}>
        <button className="tm-lib-folder-chevron" onClick={e => { e.stopPropagation(); setOpen(!open) }} aria-label={open ? "Collapse" : "Expand"}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={open ? I.chevD : I.chevR}/>
          </svg>
        </button>
        <CompanyAvatar name={companyName} size={32}/>
        <div className="tm-lib-folder-info">
          <div className="tm-lib-folder-name">
            <span className="tm-lib-folder-name-text">{companyName}</span>
            {activeCount > 0 && (
              <Pill accent>
                <span className="tm-lib-stage-dot" style={{ background: "var(--tm-interactive)", boxShadow: "0 0 4px var(--tm-accent-glow)" }}/>
                {activeCount} active
              </Pill>
            )}
          </div>
          <div className="tm-lib-folder-sub">
            {apps.length} tracked role{apps.length !== 1 ? "s" : ""} · {cvsCount} tailored CV{cvsCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="tm-lib-folder-actions" onClick={e => e.stopPropagation()}>
          <button className="tm-lib-btn sm" onClick={() => onOpenJob(apps[0]?.job_id ?? "")}>
            <LIcon d={I.plus} size={12}/> New CV
          </button>
        </div>
      </div>

      {open && (
        <div className="tm-lib-folder-body tm-lib-fade-in">
          <div className="tm-lib-job-grid">
            {apps.map(app => (
              <CVJobCard
                key={app.id}
                app={app}
                cv={app.job_id ? latestVersionForJob(app.job_id, versions) : null}
                onOpen={() => app.job_id && onOpenJob(app.job_id)}
              />
            ))}
            <button className="tm-lib-new-cv-card" onClick={() => onOpenJob(apps[0]?.job_id ?? "")}>
              <LIcon d={I.plus} size={20}/>
              <div className="tm-lib-new-cv-card-title">New CV for {companyName}</div>
              <div className="tm-lib-new-cv-card-sub">Forks from Main CV &middot; pick a role</div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Active pipeline rail ──────────────────────────────────────────
function ActivePipelineRail({ applications, versions, onPickJob }: {
  applications: ApplicationResponse[]
  versions: CVVersion[]
  onPickJob: (jobId: string) => void
}) {
  const active = applications
    .filter(a => ACTIVE_STAGES.includes(a.status))
    .sort((a, b) => stageRank(b.status) - stageRank(a.status))

  const stageOrder: ApplicationStatus[] = ["final_round", "interviewing", "screening", "applied"]
  const grouped = stageOrder
    .map(stage => ({ stage, items: active.filter(a => a.status === stage) }))
    .filter(g => g.items.length > 0)

  return (
    <aside className="tm-lib-rail">
      <div className="tm-lib-rail-head">
        <div className="tm-lib-rail-head-row">
          <div className="tm-lib-rail-head-eyebrow">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l2-6 4 12 2-6h6"/>
            </svg>
            ACTIVE · PIPELINE
          </div>
          <span className="tm-lib-rail-count">{active.length}</span>
        </div>
        <div className="tm-lib-rail-title">Jobs in pipeline</div>
        <div className="tm-lib-rail-sub">Click any job to tailor CV → download → apply.</div>
      </div>

      <div className="tm-lib-rail-body">
        {grouped.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
            No active applications yet.
          </div>
        )}
        {grouped.map(({ stage, items }) => {
          const meta = STAGE_META[stage]
          return (
            <div key={stage} className="tm-lib-stage-group">
              <div className="tm-lib-stage-group-head">
                <StatusDot stage={stage}/>
                <span className="tm-lib-stage-group-label" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="tm-lib-stage-group-count">{items.length}</span>
                <span className="tm-lib-stage-group-line"/>
              </div>
              {items.map(app => {
                const cv = app.job_id ? latestVersionForJob(app.job_id, versions) : null
                return (
                  <button key={app.id} className="tm-lib-rail-job-row"
                    onClick={() => app.job_id && onPickJob(app.job_id)}>
                    <CompanyAvatar name={app.company ?? "?"} size={22}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tm-lib-rail-job-title">{app.title}</div>
                      <div className="tm-lib-rail-job-meta">
                        <span>{app.company}</span>
                        {cv && (
                          <>
                            <span className="tm-lib-rail-job-meta-sep">·</span>
                            <span style={{ color: "var(--tm-interactive)" }}>v{cv.user_version_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--tm-text-faint)", flexShrink: 0 }}>
                      <path d={I.chevR}/>
                    </svg>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="tm-lib-rail-footer">
        <Link href="/jobs" className="tm-lib-btn" style={{ width: "100%", justifyContent: "center" }}>
          <LIcon d={I.target} size={14}/> Find a target job
        </Link>
      </div>
    </aside>
  )
}

// ── Main LibraryView ──────────────────────────────────────────────
export function LibraryView({
  versions, currentBaseline, applications, profile, onOpenMaster, onOpenJob, onReplaceCV
}: LibraryViewProps) {
  // Group applications by company
  const companiesMap = new Map<string, ApplicationResponse[]>()
  for (const app of applications) {
    const key = app.company ?? "Unknown"
    const arr = companiesMap.get(key)
    if (arr) arr.push(app)
    else companiesMap.set(key, [app])
  }
  const companies = Array.from(companiesMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  // Stats
  const tailoredCount = versions.filter(v => v.kind !== "baseline_upload").length
  const companiesWithCv = new Set(
    versions.filter(v => v.kind !== "baseline_upload" && v.company_name).map(v => v.company_name)
  ).size
  const pipelineCount = applications.filter(a => ACTIVE_STAGES.includes(a.status)).length

  return (
    <div className="tm-lib-scope">
      <div className="tm-lib-root">
        <div className="tm-lib-main">
          {/* Page header */}
          <div className="tm-lib-page-head">
            <div>
              <div className="tm-lib-eyebrow" style={{ marginBottom: 6 }}>CV LIBRARY · BUILDER</div>
              <h1 className="tm-lib-page-title">Your CV workspace</h1>
              <p className="tm-lib-page-sub">
                One Main CV. Every job-specific copy lives in its company&apos;s folder. Open, tailor, download, apply — all in one loop.
              </p>
            </div>
            <div className="tm-lib-page-actions">
              <Link href="/jobs" className="tm-lib-btn">
                <LIcon d={I.target} size={14}/> Target job
              </Link>
              <button className="tm-lib-btn primary" onClick={onReplaceCV}>
                <LIcon d={I.upload} size={14}/> Update Master
              </button>
            </div>
          </div>

          {/* Hero strip: Master CV + stat tiles */}
          <div className="tm-lib-hero-strip">
            <MasterCVHero
              baseline={currentBaseline}
              profile={profile}
              onOpen={onOpenMaster}
              onReplace={onReplaceCV}
            />
            <div className="tm-lib-stat-grid">
              <StatTile eyebrow="TAILORED"  value={tailoredCount} sub="copies forked" accent/>
              <StatTile eyebrow="COMPANIES" value={companiesWithCv} sub="with CVs"/>
              <StatTile eyebrow="PIPELINE"  value={pipelineCount} sub="active apps"/>
              <StatTile eyebrow="DOWNLOADS" value="—" sub="last 30 days"/>
            </div>
          </div>

          {/* Folders */}
          <div className="tm-lib-folders-head">
            <div className="tm-lib-folders-head-label">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={I.folder}/>
              </svg>
              Company folders
            </div>
            <span className="tm-lib-folders-head-count">{companies.length}</span>
            <span className="tm-lib-folders-head-divider"/>
          </div>

          {companies.length === 0 ? (
            <div className="tm-lib-empty">
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--tm-text-faint)" }}>
                <path d={I.folder}/>
              </svg>
              <div className="tm-lib-empty-title">No tracked jobs yet</div>
              <div className="tm-lib-empty-sub">
                Save jobs from the jobs page to build your library. Each saved job creates a folder for tailored CVs.
              </div>
              <Link href="/jobs" className="tm-lib-empty-link">
                Browse jobs <LIcon d={I.chevR} size={12}/>
              </Link>
            </div>
          ) : (
            <div className="tm-lib-folder-list">
              {companies.map(([name, apps], i) => (
                <CompanyFolderRow
                  key={name}
                  companyName={name}
                  apps={apps}
                  versions={versions}
                  defaultOpen={i < 2}
                  onOpenJob={onOpenJob}
                />
              ))}
            </div>
          )}
        </div>

        <ActivePipelineRail
          applications={applications}
          versions={versions}
          onPickJob={onOpenJob}
        />
      </div>
    </div>
  )
}
