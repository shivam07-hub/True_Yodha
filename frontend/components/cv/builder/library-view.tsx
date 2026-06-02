/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 * Company-folder layout with an active pipeline rail.
 */
"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { ApplicationResponse, ApplicationStatus, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CompanyAvatar, StatTile, StatusDot, STAGE_META, stageRank } from "./library-shared"
import { APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"
import { buildCVWorkspaceStats, latestCVVersionForJob } from "@/lib/cv/workspace"
import { MasterCVHero, MasterCVPanel } from "./library-master"
import { I, LIcon } from "./library-icons"
import { WorkspacePipeline } from "../pipeline/workspace-pipeline"
import "./library-view.css"

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

// Display order only (presentation). Membership is the canonical predicate
// from lib/api — APPLICATION_STAGES / APPLICATION_OUTCOMES — so the rail count,
// the folder badge, and the main board can never disagree on "active vs closed".
const ACTIVE_ORDER: ApplicationStatus[] = ["final_round", "interviewing", "screening", "applied", "saved"]
const CLOSED_ORDER: ApplicationStatus[] = ["offer", "rejected", "ghosted", "withdrew"]

function PipelineRail({ applications, versions, onPickJob, filter, onFilter }: {
  applications: ApplicationResponse[]
  versions: CVVersion[]
  onPickJob: (jobId: string) => void
  filter: Filter
  onFilter: (f: Filter) => void
}) {
  const stages = filter === "closed" ? CLOSED_ORDER : ACTIVE_ORDER
  const stageSet = filter === "closed" ? APPLICATION_OUTCOMES : APPLICATION_STAGES
  const scoped = applications
    .filter((application) => stageSet.includes(application.status))
    .sort((a, b) => stageRank(b.status) - stageRank(a.status))

  const grouped = stages
    .map((stage) => ({ stage, items: scoped.filter((application) => application.status === stage) }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className="tm-lib-rail">
      <div className="tm-lib-rail-head">
        <div className="tm-lib-rail-head-row">
          <div className="tm-lib-rail-head-eyebrow">
            <LIcon d={I.pulse} size={11}/>
            PIPELINE
          </div>
          <span className="tm-lib-rail-count">{scoped.length}</span>
        </div>
        <div className="tm-lib-seg tm-lib-rail-seg" role="tablist" aria-label="Pipeline filter">
          <button type="button" role="tab" aria-selected={filter === "active"}
            className={`tm-lib-seg-btn${filter === "active" ? " active" : ""}`}
            onClick={() => onFilter("active")}>Active</button>
          <button type="button" role="tab" aria-selected={filter === "closed"}
            className={`tm-lib-seg-btn${filter === "closed" ? " active" : ""}`}
            onClick={() => onFilter("closed")}>Closed</button>
        </div>
      </div>

      <div className="tm-lib-rail-body">
        {grouped.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
            {filter === "closed" ? "No closed applications yet." : "No active applications yet."}
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

  // Lens-collapse (tracker→CV merge, 2026-06-02): the By-stage / By-company toggle
  // was dropped — company folders already show each pursuit's stage + an inline
  // stage picker, so there is ONE arrangement. Only the Active | Closed filter
  // survives (live work vs verdicts). URL-synced so the /tracker redirect
  // (?filter=closed) still lands right.
  const filter: Filter = searchParams.get("filter") === "closed" ? "closed" : "active"

  function setFilter(f: Filter) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("filter", f)
    router.replace(`/cv?${params.toString()}`, { scroll: false })
  }

  const stats = buildCVWorkspaceStats(versions, applications)

  return (
    <div className="tm-lib-scope">
      <div className="tm-lib-root">
        <div className="tm-lib-main">
          {/* Desktop toggle lives in the pipeline rail head; this mobile-only
              bar carries it when the rail is hidden (<1100px). */}
          <WorkspaceFilterBar filter={filter} onFilter={setFilter} />

          <div className="tm-lib-page-head">
            <div className="tm-lib-page-head-main">
              <div className="tm-lib-eyebrow" style={{ marginBottom: 6 }}>CV &amp; APPLICATIONS</div>
              <h1 className="tm-lib-page-title">Your CV workspace</h1>
              <p className="tm-lib-page-sub">
                One Main CV. Tailor a copy for each job, then track every application — saved, applied, all the way to the offer.
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

          <WorkspacePipeline filter={filter} versions={versions} onOpenJob={onOpenJob} />
        </div>

        <PipelineRail
          applications={applications}
          versions={versions}
          onPickJob={onOpenJob}
          filter={filter}
          onFilter={setFilter}
        />
      </div>
    </div>
  )
}

function WorkspaceFilterBar({ filter, onFilter }: {
  filter: Filter
  onFilter: (f: Filter) => void
}) {
  return (
    <div className="tm-lib-lensbar tm-lib-lensbar-mobile" role="tablist" aria-label="Pipeline filter">
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
