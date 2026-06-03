"use client"

import { useRouter } from "next/navigation"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { useCvPromise } from "@/lib/hooks/use-cv-promise"
import { AUTHED_NAV, isNavItemUnlocked } from "@/lib/nav-items"
import "./first-run-hero.css"

export interface FirstRunBestMatch {
  jobId: string
  title: string
  company: string | null
  location: string | null
  fit: number
}

export interface FirstRunHeroProps {
  firstName: string
  hasCv: boolean
  cvReadiness: "ready" | "missing" | "processing" | "failed"
  score: number
  domainsCount: number
  skillsDetected?: number | null
  bestMatch?: FirstRunBestMatch | null
}

type StepState = "done" | "active" | "locked" | "working" | "failed"

/** Locked-row copy for gated nav surfaces, keyed by nav id. Honest, gate-true
 *  (D1): the workspace really unlocks on baseline upload, not on a tailored count. */
const GROWS_HINT: Record<string, string> = {
  cv: "unlocks when you upload your CV",
}

function UploadGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

export function FirstRunHero({
  firstName,
  hasCv,
  cvReadiness,
  score,
  skillsDetected,
  bestMatch,
}: FirstRunHeroProps) {
  const router = useRouter()
  const { ctx } = useNavUnlocks()
  const { phase, mmss } = useCvPromise(true, hasCv)

  const processing = cvReadiness === "processing"
  const failed = cvReadiness === "failed"
  const scored = hasCv && score > 0

  const step1: StepState = hasCv ? "done" : processing ? "working" : failed ? "failed" : "active"
  const step2: StepState = scored ? "done" : hasCv ? "working" : "locked"
  const step3: StepState = scored ? "active" : "locked"

  // Score is still computing once the CV is parsed but no score has landed yet.
  const scoring = (step1 === "working") || (step1 === "done" && !scored)

  const eyebrowClock =
    phase === "running" ? mmss : phase === "finish" ? "00:00" : "10 min"

  function goUpload() {
    router.push("/cv?upload=1")
  }
  function goTailor() {
    router.push(bestMatch ? `/cv?jobId=${encodeURIComponent(bestMatch.jobId)}` : "/cv")
  }

  // One row per real gated nav surface (D1: derived from nav-items, so copy can
  // never drift from the actual unlock logic). Myrology (special) is omitted.
  const grows = AUTHED_NAV.filter(
    (i) => i.stage === "gated" && !i.special && i.surfaces.includes("desktop"),
  )

  return (
    <section className="frh" aria-label="Get to your first CV">
      <div className="frh-eyebrow">
        <span className="frh-eyebrow-clock">{eyebrowClock}</span>
        <span className="frh-eyebrow-dot" aria-hidden>·</span>
        <span className="frh-eyebrow-rest">to your first CV</span>
      </div>

      <h1 className="frh-title">
        {hasCv ? (
          <>You&apos;re one step from a <em>job-ready</em> CV.</>
        ) : (
          <>Hi {firstName}, your <em>job-ready</em> CV starts here.</>
        )}
      </h1>

      <p className="frh-lede">
        {hasCv
          ? "Myro read your CV and scored it. Tailor it to your best-matched role to download a scored, job-specific version."
          : "Drop in your CV. Myro reads it, scores it, and tailors a version for the exact role you want."}
      </p>

      {/* Primary action — the single focal point, Upload-first (Gap 1). When the
       *  CV is already scored, the best-match card below is the focal CTA. */}
      {step1 === "active" && (
        <div className="frh-primary">
          <button type="button" className="frh-primary-cta" onClick={goUpload}>
            <UploadGlyph />
            Upload your CV
          </button>
          <span className="frh-primary-hint">PDF or DOCX · read in seconds</span>
        </div>
      )}

      {step1 === "failed" && (
        <div className="frh-primary" data-tone="danger">
          <button type="button" className="frh-primary-cta frh-primary-cta--retry" onClick={goUpload}>
            <UploadGlyph />
            Try another file
          </button>
          <span className="frh-primary-hint">We couldn&apos;t read that one — try a PDF or DOCX export, under 10&nbsp;MB.</span>
        </div>
      )}

      {scoring && (
        <div className="frh-primary frh-primary--working" role="status" aria-live="polite">
          {/* Real-shape skeleton of the score that's landing — not a spinner (Gap 2). */}
          <span className="frh-skel frh-skel-ring" aria-hidden />
          <div className="frh-primary-working-body">
            <span className="frh-primary-working-title">
              {processing ? "Reading your CV" : "Scoring your CV"}
            </span>
            <span className="frh-primary-hint">
              {skillsDetected ? `${skillsDetected} skills detected · scoring now` : "scoring across your domains — a few seconds"}
            </span>
          </div>
        </div>
      )}

      {/* Slim progress rail — the journey, without the three fat cards. */}
      <ol className="frh-rail" role="list">
        <RailNode n={1} state={step1} label="Upload" />
        <RailNode n={2} state={step2} label="Score" detail={scored ? `${score}/100` : null} />
        <RailNode n={3} state={step3} label="Tailor" />
      </ol>

      {/* Best-match card → the tailor action (the focal CTA once scored). */}
      {scored && bestMatch && (
        <div className="frh-match">
          <div className="frh-match-head">
            <span className="frh-match-eyebrow">BEST MATCH · AUTO-SELECTED</span>
            <span className="frh-match-fit">{bestMatch.fit}% fit</span>
          </div>
          <div className="frh-match-title">{bestMatch.title}</div>
          <div className="frh-match-sub">
            {[bestMatch.company, bestMatch.location].filter(Boolean).join(" · ")}
          </div>
          <button type="button" className="frh-match-cta" onClick={goTailor}>
            Tailor for {bestMatch.company ?? "this role"} →
          </button>
        </div>
      )}

      {scored && !bestMatch && (
        <button type="button" className="frh-match-cta frh-match-cta--standalone" onClick={goTailor}>
          Tailor your first CV →
        </button>
      )}

      {/* What unlocks as you go — one row per real gated surface (D1). */}
      {grows.length > 0 && (
        <div className="frh-grows">
          <span className="frh-grows-label">UNLOCKS AS YOU GO</span>
          <div className="frh-grows-rows">
            {grows.map((item) => (
              <NavGrowsRow
                key={item.id}
                title={item.label}
                sub={item.desc}
                unlocked={isNavItemUnlocked(item, ctx)}
                unlockHint={GROWS_HINT[item.id] ?? "unlocks as you progress"}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RailNode({
  n,
  state,
  label,
  detail,
}: {
  n: number
  state: StepState
  label: string
  detail?: string | null
}) {
  return (
    <li className="frh-rail-node" data-state={state}>
      <span className="frh-rail-dot" aria-hidden>
        {state === "done" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : state === "failed" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          n
        )}
      </span>
      <span className="frh-rail-label">{label}</span>
      {detail && <span className="frh-rail-detail">{detail}</span>}
    </li>
  )
}

function NavGrowsRow({
  title,
  sub,
  unlocked,
  unlockHint,
}: {
  title: string
  sub: string
  unlocked: boolean
  unlockHint: string
}) {
  return (
    <div className="frh-grows-row" data-unlocked={unlocked}>
      <span className="frh-grows-icon" aria-hidden>
        {unlocked ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        )}
      </span>
      <div className="frh-grows-body">
        <span className="frh-grows-title">{title}</span>
        <span className="frh-grows-sub">{unlocked ? sub : unlockHint}</span>
      </div>
      {unlocked && <span className="frh-grows-pill">IN NAV</span>}
    </div>
  )
}
