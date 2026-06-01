/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 * Company-folder layout with an active pipeline rail.
 */
"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { ApplicationResponse, ApplicationStatus, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CompanyAvatar, StatTile, StatusDot, ACTIVE_STAGES, STAGE_META, stageRank } from "./library-shared"
import { buildCVWorkspaceStats, latestCVVersionForJob } from "@/lib/cv/workspace"
import { CompanyFolderRow } from "./library-company-row"
import { MasterCVHero, MasterCVPanel } from "./library-master"
import { I, LIcon } from "./library-icons"
import { WorkspacePipeline } from "../pipeline/workspace-pipeline"
import { APPLICATION_STAGES } from "@/lib/api"
import type { StageKey } from "../pipeline/useTrackerBoard"
import "./library-view.css"

type Lens = "stage" | "company"
type Filter = "active" | "closed"

interface LibraryViewProps {
  token: string
  cv: CVStructured | null
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
}

function ActivePipelineRail({ applications, versions, onPickJob }: {
  applications: ApplicationResponse[]
  versions: CVVersion[]
  onPickJob: (jobId: string) => void
}) {
  const active = applications
    .filter((application) => ACTIVE_STAGES.includes(application.status))
    .sort((a, b) => stageRank(b.status) - stageRank(a.status))

  const stageOrder: ApplicationStatus[] = ["final_round", "interviewing", "screening", "applied"]
  const grouped = stageOrder
    .map((stage) => ({ stage, items: active.filter((application) => application.status === stage) }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className="tm-lib-rail">
      <div className="tm-lib-rail-head">
        <div className="tm-lib-rail-head-row">
          <div className="tm-lib-rail-head-eyebrow">
            <LIcon d={I.pulse} size={11}/>
            ACTIVE · PIPELINE
          </div>
          <span className="tm-lib-rail-count">{active.length}</span>
        </div>
        <div className="tm-lib-rail-title">Jobs in pipeline</div>
        <div className="tm-lib-rail-sub">Open any job to create, save, preview, and download its CV.</div>
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
              {items.map((app) => {
                const cvVersion = app.job_id ? latestCVVersionForJob(app.job_id, versions) : null
                return (
                  <button key={app.id} className="tm-lib-rail-job-row"
                    onClick={() => app.job_id && onPickJob(app.job_id)}>
                    <CompanyAvatar name={app.company ?? "?"} size={22}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tm-lib-rail-job-title">{app.title}</div>
                      <div className="tm-lib-rail-job-meta">
                        <span>{app.company}</span>
                        {cvVersion && (
                          <>
                            <span className="tm-lib-rail-job-meta-sep">·</span>
                            <span style={{ color: "var(--tm-interactive)" }}>v{cvVersion.user_version_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <LIcon d={I.chevR} size={12}/>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="tm-lib-rail-footer">
        <Link href="/home#browse" className="tm-lib-btn" style={{ width: "100%", justifyContent: "center" }}>
          <LIcon d={I.target} size={14}/> Find a target job
        </Link>
      </div>
    </aside>
  )
}

export function LibraryView({
  token, cv, versions, currentBaseline, applications, profile, onOpenJob, onReplaceCV,
}: LibraryViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [masterOpen, setMasterOpen] = useState(false)

  // Lens (grouping) + filter (active/closed) drive the pursuit list — tracker→CV
  // merge grill 2026-06-02 (Q4/Q7). Default: By-stage board, Active. URL-synced
  // so the /tracker redirect (?lens=stage&stage=…, ?filter=closed) lands right.
  const lens: Lens = searchParams.get("lens") === "company" ? "company" : "stage"
  const filter: Filter = searchParams.get("filter") === "closed" ? "closed" : "active"
  const stageParam = searchParams.get("stage")
  const initialStage: StageKey = (APPLICATION_STAGES as readonly string[]).includes(stageParam ?? "")
    ? (stageParam as StageKey)
    : "applied"

  function setParams(next: Partial<{ lens: Lens; filter: Filter }>) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.lens) params.set("lens", next.lens)
    if (next.filter) params.set("filter", next.filter)
    router.replace(`/cv?${params.toString()}`, { scroll: false })
  }

  const companiesMap = new Map<string, ApplicationResponse[]>()
  for (const app of applications) {
    const key = app.company ?? "Unknown"
    const arr = companiesMap.get(key)
    if (arr) arr.push(app)
    else companiesMap.set(key, [app])
  }
  const companies = Array.from(companiesMap.entries()).sort(([a], [b]) => a.localeCompare(b))
  const stats = buildCVWorkspaceStats(versions, applications)
  const showRail = lens === "company" && filter === "active"

  const header = (
    <>
      <div className="tm-lib-page-head">
        <div className="tm-lib-page-head-main">
          <div className="tm-lib-eyebrow" style={{ marginBottom: 6 }}>CV &amp; APPLICATIONS</div>
          <h1 className="tm-lib-page-title">Your CV workspace</h1>
          <p className="tm-lib-page-sub">
            One Main CV. Tailor a copy for each job, then track every application — saved, applied, all the way to the offer — on one board.
          </p>
          <div className="tm-lib-header-stat-strip" aria-label="CV workspace summary">
            {stats.map((stat) => (
              <StatTile
                key={stat.key}
                eyebrow={stat.eyebrow}
                value={stat.value}
                sub={stat.sub}
                accent={stat.accent}
              />
            ))}
          </div>
        </div>
        <div className="tm-lib-page-actions">
          <Link href="/home#browse" className="tm-lib-btn">
            <LIcon d={I.target} size={14}/> Target job
          </Link>
        </div>
      </div>

      <div className="tm-lib-hero-strip">
        <MasterCVHero
          baseline={currentBaseline}
          profile={profile}
          onOpen={() => setMasterOpen(true)}
          onReplace={onReplaceCV}
        />
      </div>

      {masterOpen && (
        <MasterCVPanel
          token={token}
          baseline={currentBaseline}
          cv={cv}
          profile={profile}
          onClose={() => setMasterOpen(false)}
          onReplace={onReplaceCV}
        />
      )}

      <WorkspaceLensBar
        lens={lens}
        filter={filter}
        onLens={(l) => setParams({ lens: l })}
        onFilter={(f) => setParams({ filter: f })}
      />
    </>
  )

  // Body: lens=company+active → company folders (+rail). Else → the pipeline
  // board (active = kanban / mobile pills, closed = verdicts), full-width.
  const companyBody = companies.length === 0 ? (
    <div className="tm-lib-empty">
      <LIcon d={I.folder} size={28}/>
      <div className="tm-lib-empty-title">No tracked jobs yet</div>
      <div className="tm-lib-empty-sub">
        Save jobs from Live Job Data to build your library. Each saved job creates a folder for tailored CVs.
      </div>
      <Link href="/home#browse" className="tm-lib-empty-link">
        Browse jobs <LIcon d={I.chevR} size={12}/>
      </Link>
    </div>
  ) : (
    <>
      <div className="tm-lib-folders-head">
        <div className="tm-lib-folders-head-label">
          <LIcon d={I.folder}/>
          Company folders
        </div>
        <span className="tm-lib-folders-head-count">{companies.length}</span>
        <span className="tm-lib-folders-head-divider"/>
      </div>
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
    </>
  )

  const body =
    showRail ? companyBody : <WorkspacePipeline filter={filter} initialStage={initialStage} />

  return (
    <div className="tm-lib-scope">
      <div className={showRail ? "tm-lib-root" : "tm-lib-root tm-lib-root-single"}>
        <div className="tm-lib-main">
          {header}
          {body}
        </div>

        {showRail && (
          <ActivePipelineRail
            applications={applications}
            versions={versions}
            onPickJob={onOpenJob}
          />
        )}
      </div>
    </div>
  )
}

function WorkspaceLensBar({ lens, filter, onLens, onFilter }: {
  lens: Lens
  filter: Filter
  onLens: (l: Lens) => void
  onFilter: (f: Filter) => void
}) {
  return (
    <div className="tm-lib-lensbar" role="tablist" aria-label="Workspace view">
      <div className="tm-lib-seg">
        <button type="button" role="tab" aria-selected={lens === "stage"}
          className={`tm-lib-seg-btn${lens === "stage" ? " active" : ""}`}
          onClick={() => onLens("stage")}>By stage</button>
        <button type="button" role="tab" aria-selected={lens === "company"}
          className={`tm-lib-seg-btn${lens === "company" ? " active" : ""}`}
          onClick={() => onLens("company")}>By company</button>
      </div>
      <div className="tm-lib-seg">
        <button type="button" role="tab" aria-selected={filter === "active"}
          className={`tm-lib-seg-btn${filter === "active" ? " active" : ""}`}
          onClick={() => onFilter("active")}>Active</button>
        <button type="button" role="tab" aria-selected={filter === "closed"}
          className={`tm-lib-seg-btn${filter === "closed" ? " active" : ""}`}
          onClick={() => onFilter("closed")}>Closed</button>
      </div>
    </div>
  )
}
