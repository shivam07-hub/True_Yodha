/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 * Company-folder layout with an active pipeline rail.
 */
"use client"

import { useEffect, useRef, useState } from "react"
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
    </aside>
  )
}

export function LibraryView({
  token, cv, versions, currentBaseline, applications, profile, onOpenJob, onReplaceCV,
}: LibraryViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?master=1` is the dashboard "Door 2" — land here with the master CV already
  // open, ready to download without tailoring.
  const [masterOpen, setMasterOpen] = useState(() => searchParams.get("master") === "1")
  const masterPanelRef = useRef<HTMLDivElement>(null)

  // Bring the panel into view when it opens — the hero button changing state
  // alone wasn't enough signal that the CV had opened (reported confusion).
  useEffect(() => {
    if (!masterOpen) return
    requestAnimationFrame(() =>
      masterPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    )
  }, [masterOpen])

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
  const isNewUser = applications.length === 0

  return (
    <div className="tm-lib-scope">
      <div className="tm-lib-root">
        <div className="tm-lib-main">
          <div className="tm-lib-page-head">
            <div className="tm-lib-page-head-main">
              <h1 className="tm-lib-page-title">Your CV workspace</h1>
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
          </div>

          {isNewUser && <WorkspaceIntroCard />}

          <div className="tm-lib-hero-strip">
            <MasterCVHero
              baseline={currentBaseline}
              profile={profile}
              open={masterOpen}
              onOpen={() => setMasterOpen(v => !v)}
              onReplace={onReplaceCV}
            />
          </div>

          {masterOpen && (
            <div ref={masterPanelRef}>
              <MasterCVPanel
                token={token}
                baseline={currentBaseline}
                cv={cv}
                profile={profile}
                onClose={() => setMasterOpen(false)}
                onReplace={onReplaceCV}
              />
            </div>
          )}

          {/* Desktop toggle lives in the pipeline rail head; this mobile-only
              bar carries it when the rail is hidden (<1100px). It sits directly
              above the board it controls, not at the page top. */}
          <WorkspaceFilterBar filter={filter} onFilter={setFilter} />

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

// One-time orientation for new users (no applications yet). Persisted per-device
// via localStorage — mirrors the market feed PEEK-hint pattern. Established users
// never see it (gated on applications.length === 0 by the caller).
const INTRO_SEEN_KEY = "tm-cv-intro-seen-v1"

const INTRO_STEPS: { d: string; title: string; body: string }[] = [
  { d: I.file, title: "Keep one Main CV", body: "Your source of truth. Edit it once — every tailored copy starts from here." },
  { d: I.target, title: "Target a job", body: "Open a job from Browse and we spin up a copy tuned to that role." },
  { d: I.pulse, title: "Track to the offer", body: "Each copy moves through saved → applied → interviewing → offer." },
]

function WorkspaceIntroCard() {
  // Start hidden so SSR and first client paint agree; reveal in an effect once
  // we can read localStorage. Avoids a hydration flash and an SSR mismatch.
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (!window.localStorage.getItem(INTRO_SEEN_KEY)) setShow(true)
    } catch { /* private mode — skip the card rather than crash */ }
  }, [])

  function dismiss() {
    setShow(false)
    try { window.localStorage.setItem(INTRO_SEEN_KEY, "1") } catch { /* quota / private mode */ }
  }

  if (!show) return null

  return (
    <section className="tm-lib-intro tm-lib-fade-in" aria-label="How the CV workspace works">
      <div className="tm-lib-intro-head">
        <h2 className="tm-lib-intro-title">Welcome to your CV workspace</h2>
        <button type="button" className="tm-lib-intro-close" onClick={dismiss} aria-label="Dismiss intro">
          <LIcon d={I.close} size={15}/>
        </button>
      </div>
      <ol className="tm-lib-intro-steps">
        {INTRO_STEPS.map((step, i) => (
          <li key={step.title} className="tm-lib-intro-step">
            <span className="tm-lib-intro-step-icon"><LIcon d={step.d} size={16}/></span>
            <div>
              <div className="tm-lib-intro-step-title">
                <span className="tm-lib-intro-step-num">{i + 1}</span>{step.title}
              </div>
              <p className="tm-lib-intro-step-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="tm-lib-intro-foot">
        <button type="button" className="tm-lib-btn primary sm" onClick={dismiss}>Got it</button>
      </div>
    </section>
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
