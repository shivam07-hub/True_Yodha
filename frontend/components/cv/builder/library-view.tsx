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
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { MasterCVPanel } from "./library-master"
import { FinishTailoringLane } from "./finish-tailoring-lane"
import { MemoryPanel } from "./memory-panel"
import { ReservoirProfile } from "./reservoir-profile"
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

export function LibraryView({
  token, cv, currentBaseline, applications, profile, onOpenJob, onReplaceCV, onEditMaster,
}: LibraryViewProps) {
  const searchParams = useSearchParams()
  const { isDesktop } = useViewport()

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
    if (!cv) return null
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
          {/* ── CV view: the Main CV is the whole point, full width ──────
              The panel is the surface — it always renders; its own head
              carries name / version / Edit / Replace. No close/collapse:
              this is a dedicated page, you leave via nav, not by hiding
              the one thing you came to see. */}
          {view === "cv" && (
            <div className="tm-lib-doc">
              {isNewUser && <WorkspaceIntroCard />}
              <CvStoriesToggle view={view} />
              <FinishTailoringLane applications={applications} onOpenJob={onOpenJob} />
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
