/**
 * CV Library Atelier — main workspace surface for /cv (no jobId).
 *
 * Views: CV (the Main CV, full width) · Stories (the Career Story Reservoir) ·
 * Memory (what Myro remembers). The old "Active" applications view moved to its
 * own surface — /preparations (grill 2026-07-15); the /cv page redirects the
 * legacy ?view=active / ?filter=closed deep links there.
 */
"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CvDocumentSkeleton } from "@/components/loading/page-skeletons"
import { CvTabView } from "./cv-tab-view"
import { MemoryPanel } from "./memory-panel"
import { ReservoirProfile } from "./reservoir-profile"
import { FlowRibbon } from "./flow-ribbon"
import { I, LIcon } from "./library-icons"
import { MobileCVHub } from "../mobile/mobile-cv-hub"
import { useViewport } from "@/mobile"
import "./library-view.css"
import "../mobile/mobile-cv-hub.css"
import "../mobile/mobile-cv-editor.css"

type View = "cv" | "stories" | "memory"

interface LibraryViewProps {
  token: string
  cv: CVStructured | null
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
  onEditMaster: () => void
}

export function LibraryView({
  token, cv, currentBaseline, applications, profile, onOpenJob, onReplaceCV, onEditMaster,
}: LibraryViewProps) {
  const searchParams = useSearchParams()
  const { isDesktop } = useViewport()
  const [showHistory, setShowHistory] = useState(false)
  const canEditMaster = !!currentBaseline && !!cv

  // `?master=1` (dashboard "Door 2") lands on the CV view; ?view=active and the
  // old ?filter=closed are redirected to /preparations by the page before this
  // renders, so they need no branch here.
  const viewParam = searchParams.get("view")
  const view: View =
    viewParam === "stories" ? "stories"
    : viewParam === "memory" ? "memory"
    : "cv"

  const isNewUser = applications.length === 0

  if (!isDesktop) {
    if (view === "stories") {
      return (
        <div className="tm-mcv-stories">
          <FlowRibbon view={view} />
          <ReservoirProfile token={token} applications={applications} onOpenJob={onOpenJob} />
        </div>
      )
    }
    if (view === "memory") {
      return (
        <div className="tm-mcv-stories">
          <FlowRibbon view={view} />
          <MemoryPanel token={token} />
        </div>
      )
    }
    // Defensive fallback for any future caller that does not gate structured
    // loading at the page boundary.
    if (!cv) return <div className="tm-mcv-stories"><CvDocumentSkeleton /></div>
    return (
      <MobileCVHub
        token={token}
        cv={cv}
        currentBaseline={currentBaseline}
        profile={profile}
        applications={applications}
        onOpenJob={onOpenJob}
        onReplaceCV={onReplaceCV}
      />
    )
  }

  return (
    <div className="tm-lib-scope">
      <div className="tm-lib-root">
        <div className="tm-lib-main">
          <FlowRibbon
            view={view}
            actions={view === "cv" ? (
              <>
                <button type="button" className="tm-lib-btn sm" onClick={onEditMaster} disabled={!canEditMaster}>
                  <LIcon d={I.edit ?? I.file} size={12}/> Edit
                </button>
                <button
                  type="button"
                  className={`tm-lib-btn sm${showHistory ? " primary" : ""}`}
                  onClick={() => setShowHistory(v => !v)}
                  aria-expanded={showHistory}
                >
                  <LIcon d={I.pulse} size={12}/> Version history
                </button>
                <button type="button" className="tm-lib-btn sm" onClick={onReplaceCV}>
                  <LIcon d={I.upload} size={12}/> Replace
                </button>
              </>
            ) : undefined}
          />

          {/* ── CV view: the Main CV, or a per-job tailored copy ────────── */}
          {view === "cv" && (
            <div className="tm-lib-doc">
              {isNewUser && <WorkspaceIntroCard />}
              <CvTabView
                token={token}
                cv={cv}
                currentBaseline={currentBaseline}
                applications={applications}
                profile={profile}
                onEditMaster={onEditMaster}
                onOpenJob={onOpenJob}
                showHistory={showHistory}
              />
            </div>
          )}

          {/* ── Stories view: the Career Story Reservoir behind the CV ── */}
          {view === "stories" && (
            <ReservoirProfile
              token={token}
              applications={applications}
              onOpenJob={onOpenJob}
            />
          )}

          {/* ── Memory view: what Myro remembers, yours to edit/forget ── */}
          {view === "memory" && <MemoryPanel token={token} />}
        </div>
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
