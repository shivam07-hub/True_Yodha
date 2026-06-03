"use client"

import { useRouter } from "next/navigation"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import { useCvPromise } from "@/lib/hooks/use-cv-promise"
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

function StepIcon({ state, n }: { state: StepState; n: number }) {
  if (state === "failed") {
    return (
      <span className="frh-step-chip frh-step-chip--failed" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </span>
    )
  }
  if (state === "done") {
    return (
      <span className="frh-step-chip frh-step-chip--done" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    )
  }
  if (state === "working") {
    return <span className="frh-step-chip frh-step-chip--working" aria-hidden />
  }
  return <span className="frh-step-chip" aria-hidden>{n}</span>
}

export function FirstRunHero({
  firstName,
  hasCv,
  cvReadiness,
  score,
  domainsCount,
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

  const eyebrowClock =
    phase === "running" ? mmss : phase === "finish" ? "00:00" : "10 min"

  function goUpload() {
    router.push("/cv?upload=1")
  }
  function goTailor() {
    router.push(bestMatch ? `/cv?jobId=${encodeURIComponent(bestMatch.jobId)}` : "/cv")
  }

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

      {/* Checklist */}
      <ol className="frh-steps" role="list">
        <li className="frh-step" data-state={step1}>
          <StepIcon state={step1} n={1} />
          <div className="frh-step-body">
            <span className="frh-step-title">
              {hasCv
                ? "CV uploaded"
                : processing
                  ? "Reading your CV"
                  : failed
                    ? "We couldn't read that file"
                    : "Upload your CV"}
            </span>
            <span className="frh-step-meta">
              {hasCv
                ? skillsDetected
                  ? `${skillsDetected} skills detected`
                  : "parsed and ready"
                : processing
                  ? "Myro is reading every line"
                  : failed
                    ? "Try a PDF or DOCX export, under 10 MB"
                    : "PDF or DOCX · read in seconds"}
            </span>
          </div>
          {(step1 === "active" || step1 === "failed") && (
            <button type="button" className="frh-step-cta" onClick={goUpload}>
              {step1 === "failed" ? "Try another" : "Upload"}
            </button>
          )}
          {step1 === "working" && <span className="frh-step-working-dots" aria-hidden />}
        </li>

        <li className="frh-step" data-state={step2}>
          <StepIcon state={step2} n={2} />
          <div className="frh-step-body">
            <span className="frh-step-title">Myro Score computed</span>
            <span className="frh-step-meta">
              {scored
                ? domainsCount
                  ? `${score} / 100 · across ${domainsCount} domains`
                  : `${score} / 100`
                : hasCv
                  ? "scoring your domains now"
                  : "unlocks the moment your CV lands"}
            </span>
          </div>
        </li>

        <li className="frh-step" data-state={step3}>
          <StepIcon state={step3} n={3} />
          <div className="frh-step-body">
            <span className="frh-step-title">Tailor your first CV</span>
            <span className="frh-step-meta">
              {scored
                ? "best match pre-selected · download before the clock runs out"
                : "the finish line — a CV built for one specific role"}
            </span>
          </div>
          {step3 === "active" && <span className="frh-step-now" aria-hidden>NOW</span>}
        </li>
      </ol>

      {/* Best-match card → the tailor action */}
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

      {/* Nav grows with you */}
      <div className="frh-grows">
        <span className="frh-grows-label">YOUR NAV GROWS WITH YOU</span>
        <div className="frh-grows-rows">
          <NavGrowsRow
            title="CV Library"
            sub="every tailored version, in its own company folder"
            unlocked={ctx.tailoredCount >= 1}
            unlockHint="unlocks when you tailor your first CV"
          />
          <NavGrowsRow
            title="Tracker"
            sub="fit score and outcome for every application"
            unlocked={ctx.tailoredCompanies >= 2}
            unlockHint="unlocks at 2 tailored companies"
          />
        </div>
      </div>
    </section>
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
