/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 * Company-folder layout with an active pipeline rail.
 */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { ApplicationResponse, ApplicationStatus, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CompanyAvatar, StatTile, StatusDot, STAGE_META, stageRank } from "./library-shared"
import { APPLICATION_OUTCOMES } from "@/lib/api"
import { buildCVWorkspaceStats, latestCVVersionForJob } from "@/lib/cv/workspace"
import { cleanJobTitle } from "@/lib/text/strip-markdown"
import { MasterCVPanel } from "./library-master"
import { MemoryPanel } from "./memory-panel"
import { ReservoirProfile } from "./reservoir-profile"
import { I, LIcon } from "./library-icons"
import { WorkspacePipeline } from "../pipeline/workspace-pipeline"
import { MobileCVHub } from "../mobile/mobile-cv-hub"
import { useViewport } from "@/mobile"
import "./library-view.css"
import "../mobile/mobile-cv-hub.css"
import "../mobile/mobile-cv-editor.css"

// Top-level view switcher (market Jobs/Heatmap pill pattern). CV = master CV on
// its own full-width page; Active = stat strip + live pipeline + closed rail;
// Stories = the Career Story Reservoir (the dump-built profile behind the CV).
type View = "cv" | "active" | "stories" | "memory"

interface LibraryViewProps {
  token: string
  cv: CVStructured | null
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
  onEditMaster: () => void
}

// Display order only (presentation). Membership is the canonical predicate
// from lib/api — APPLICATION_OUTCOMES — so the rail count, the folder badge, and
// the main board can never disagree on what counts as closed.
const CLOSED_ORDER: ApplicationStatus[] = ["offer", "rejected", "ghosted"]

// CV ↔ Stories ↔ Memory mode pill (reuses the canonical .tm-lib-seg family).
// The master CV is the artifact; Stories is the reservoir it projects from;
// Memory is everything Myro remembers across the product.
function CvStoriesToggle({ view }: { view: View }) {
  return (
    <div className="tm-lib-seg tm-lib-cv-mode" aria-label="CV workspace mode">
      <Link href="/cv?view=cv" className={`tm-lib-seg-btn${view === "cv" ? " active" : ""}`}>CV</Link>
      <Link href="/cv?view=stories" className={`tm-lib-seg-btn${view === "stories" ? " active" : ""}`}>Stories</Link>
      <Link href="/cv?view=memory" className={`tm-lib-seg-btn${view === "memory" ? " active" : ""}`}>Memory</Link>
    </div>
  )
}

// Closed verdicts list — the right rail no longer toggles. It is a single
// always-closed surface (outcomes only). Active pursuits live in the main panel
// now, so the rail's job is purely "what already resolved". Rendered as an
// <aside> on desktop and an inline block on mobile (variant), since the aside is
// CSS-hidden below 1100px and closed work must stay reachable.
function ClosedRail({ applications, versions, onPickJob, variant = "aside" }: {
  applications: ApplicationResponse[]
  versions: CVVersion[]
  onPickJob: (jobId: string) => void
  variant?: "aside" | "inline"
}) {
  const scoped = applications
    .filter((application) => APPLICATION_OUTCOMES.includes(application.status))
    .sort((a, b) => stageRank(b.status) - stageRank(a.status))

  const grouped = CLOSED_ORDER
    .map((stage) => ({ stage, items: scoped.filter((application) => application.status === stage) }))
    .filter((group) => group.items.length > 0)

  const Wrapper = variant === "inline" ? "section" : "aside"

  return (
    <Wrapper className={variant === "inline" ? "tm-lib-rail tm-lib-closed-inline" : "tm-lib-rail"}>
      <div className="tm-lib-rail-head">
        <div className="tm-lib-rail-head-row">
          <div className="tm-lib-rail-head-eyebrow">
            <LIcon d={I.pulse} size={11}/>
            CLOSED
          </div>
          <span className="tm-lib-rail-count">{scoped.length}</span>
        </div>
      </div>

      <div className="tm-lib-rail-body">
        {grouped.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
            No closed applications yet.
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
                      <div className="tm-lib-rail-job-title">{cleanJobTitle(app.title)}</div>
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
    </Wrapper>
  )
}

export function LibraryView({
  token, cv, versions, currentBaseline, applications, profile, onOpenJob, onReplaceCV, onEditMaster,
}: LibraryViewProps) {
  const searchParams = useSearchParams()
  const { isDesktop } = useViewport()

  // Top-level view (market Jobs/Heatmap pill). CV leads by default — the master
  // CV is the source of truth, so it gets its own full-width page. Legacy deep
  // links resolve here: `?master=1` (dashboard "Door 2") and the old
  // `?filter=closed` /tracker redirect both land on a sensible view — master CV
  // for the former, the pipeline (closed now lives in the rail) for the latter.
  const legacyMaster = searchParams.get("master") === "1"
  const legacyClosed = searchParams.get("filter") === "closed"
  const viewParam = searchParams.get("view")
  const view: View =
    viewParam === "cv" || legacyMaster ? "cv"
    : viewParam === "active" || legacyClosed ? "active"
    : viewParam === "stories" ? "stories"
    : viewParam === "memory" ? "memory"
    : "cv"

  const stats = buildCVWorkspaceStats(versions, applications)
  const isNewUser = applications.length === 0

  if (!isDesktop) {
    if (view === "stories") {
      return (
        <div className="tm-mcv-stories">
          <CvStoriesToggle view={view} />
          <ReservoirProfile token={token} applications={applications} onOpenJob={onOpenJob} />
        </div>
      )
    }
    if (view === "memory") {
      return (
        <div className="tm-mcv-stories">
          <CvStoriesToggle view={view} />
          <MemoryPanel token={token} />
        </div>
      )
    }
    if (view === "cv" && cv) {
      return (
        <MobileCVHub
          token={token}
          cv={cv}
          currentBaseline={currentBaseline}
          profile={profile}
          onReplaceCV={onReplaceCV}
        />
      )
    }
    return (
      <div className="tm-mcv-applications">
        <header><h1>Applications</h1></header>
        <WorkspacePipeline filter="active" versions={versions} onOpenJob={onOpenJob} />
        <ClosedRail applications={applications} versions={versions} onPickJob={onOpenJob} variant="inline" />
      </div>
    )
  }

  return (
    <div className="tm-lib-scope">
      <div className="tm-lib-root">
        <div className="tm-lib-main">
          {/* Active/CV switching now lives in the top nav (CV + Applications
              tabs) on both shells, so the in-page ViewSwitch is retired. The
              head survives only to carry the Active-view stat strip; the empty
              head-main is a flex spacer that keeps the strip right-aligned as
              before. CV view needs no head. */}
          {view === "active" && (
            <div className="tm-lib-page-head">
              <div className="tm-lib-page-head-main">
                {cv && (
                  <Link href="/cv?view=cv" className="tm-lib-btn sm tm-lib-view-cv">
                    <LIcon d={I.file} size={13}/> View my 1-page CV
                  </Link>
                )}
              </div>
              <div className="tm-lib-header-stat-strip tm-lib-stat-strip-thin tm-lib-head-stats" aria-label="CV workspace summary">
                {stats.map((stat) => (
                  <StatTile key={stat.key} eyebrow={stat.eyebrow} value={stat.value} sub={stat.sub} />
                ))}
              </div>
            </div>
          )}

          {/* ── CV view: the Main CV is the whole point, full width ──────
              The panel is the surface — it always renders; its own head
              carries name / version / Edit / Replace. No close/collapse:
              this is a dedicated page, you leave via nav, not by hiding
              the one thing you came to see. */}
          {view === "cv" && (
            <div className="tm-lib-doc">
              {isNewUser && <WorkspaceIntroCard />}
              <CvStoriesToggle view={view} />
              <MasterCVPanel
                token={token}
                baseline={currentBaseline}
                cv={cv}
                profile={profile}
                onReplace={onReplaceCV}
                onEditMaster={onEditMaster}
              />
            </div>
          )}

          {/* ── Stories view: the Career Story Reservoir behind the CV ── */}
          {view === "stories" && (
            <>
              <CvStoriesToggle view={view} />
              <ReservoirProfile
                token={token}
                applications={applications}
                onOpenJob={onOpenJob}
              />
            </>
          )}

          {/* ── Memory view: what Myro remembers, yours to edit/forget ── */}
          {view === "memory" && (
            <>
              <CvStoriesToggle view={view} />
              <MemoryPanel token={token} />
            </>
          )}

          {/* ── Active view: thin stat strip + live pipeline ─────────── */}
          {view === "active" && (
            <>
              <WorkspacePipeline filter="active" versions={versions} onOpenJob={onOpenJob} />

              {/* Mobile fallback: the closed rail is CSS-hidden below 1100px,
                  so render the closed verdicts inline here to keep them reachable. */}
              <ClosedRail
                applications={applications}
                versions={versions}
                onPickJob={onOpenJob}
                variant="inline"
              />
            </>
          )}
        </div>

        {/* Right rail = closed verdicts only, and only on the Active view. */}
        {view === "active" && (
          <ClosedRail
            applications={applications}
            versions={versions}
            onPickJob={onOpenJob}
          />
        )}
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
