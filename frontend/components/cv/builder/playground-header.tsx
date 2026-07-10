/**
 * PlaygroundHeader — CV Playground v2 sticky header: job context + live score.
 *
 * [← crumb · CV Playground | job · company | "N requirements extracted →"]
 * [score /100 + bar · ▲ +N raised · Apply with this CV · ⋯]
 *
 * The requirements pill opens the Skills tab (the extracted requirements ARE
 * that checklist); the raw JD lives behind the editor toolbar's Job Description
 * button — three affordances, three distinct destinations. The score counts up
 * on every applied fix (~480ms, reduced-motion lands instantly).
 */
"use client"

import { useEffect, useRef, useState } from "react"
import type { JobMatch } from "@/lib/api"
import { verdictLabel } from "@/lib/jobs/match-verdict"
import { Icon } from "./icons"

/** Count the number up to its target — the one orchestrated moment. */
export function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce || fromRef.current === target) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    const span = target - from
    let raf = 0
    let startTs = 0
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const p = Math.min(1, (ts - startTs) / 480)
      const eased = 1 - (1 - p) * (1 - p)
      setDisplay(Math.round(from + span * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return display
}

export function scoreBand(score: number): "high" | "mid" | "low" {
  return score >= 80 ? "high" : score >= 65 ? "mid" : "low"
}

interface PlaygroundHeaderProps {
  jobTitle: string
  company: string
  reqCount: number
  ready: number
  delta: number
  canApply: boolean
  applyHint: string
  saveState: string
  onBack: () => void
  onReqPill: () => void
  onApply: () => void
  onDownload: () => void
  /** "master" reshapes the SAME header for the Main-CV surface: brand "Main CV",
   *  a plain context line (no JD requirements pill), the score capped as the Myro
   *  Score, no delta chip, and the primary button labelled by primaryLabel. */
  variant?: "job" | "master"
  /** Master/anon context line, e.g. "v78 · autosaves" or "Free preview". */
  masterMeta?: string
  /** When set, masterMeta renders as a clickable pill (anon → sign-in invite). */
  onMeta?: () => void
  /** Primary button label (default "Apply with this CV"; master → "Done"). */
  primaryLabel?: string
  /** Hide the ⋯ overflow (master keeps download in the view-mode surface). */
  hideOverflow?: boolean
  /** Brand override (default per variant: "CV Playground" / "Main CV"). */
  brandLabel?: string
  /** Score caption override (default per variant). */
  scoreCaption?: string
  /** The job's Worth-it verdict — the OTHER axis (prize) beside Ready (winnability).
   *  Read from the matches cache; omit when unknown/"checking" so we never invent
   *  a judgment. Shows "Strong · 76" alongside the job context. */
  worthIt?: { verdict: JobMatch["verdict"]; score: number }
}

export function PlaygroundHeader({
  jobTitle, company, reqCount, ready, delta, canApply, applyHint, saveState,
  onBack, onReqPill, onApply, onDownload,
  variant = "job", masterMeta, onMeta, primaryLabel = "Apply with this CV", hideOverflow,
  brandLabel, scoreCaption, worthIt,
}: PlaygroundHeaderProps) {
  const shown = useCountUp(ready)
  const [menuOpen, setMenuOpen] = useState(false)
  const isMaster = variant === "master"

  return (
    <header className="cvb-v2-head">
      <button type="button" className="cvb-v2-crumb" onClick={onBack} aria-label="Back to CV library">
        <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />
      </button>
      <span className="cvb-v2-brand">{brandLabel ?? (isMaster ? "Main CV" : "CV Playground")}</span>
      <span className="cvb-v2-headrule" aria-hidden />
      {isMaster ? (
        masterMeta && (onMeta
          ? <button type="button" className="cvb-v2-reqpill mono" onClick={onMeta}>{masterMeta}</button>
          : <span className="cvb-v2-jobline mono" title={masterMeta}>{masterMeta}</span>)
      ) : (
        <>
          <span className="cvb-v2-jobline" title={`${jobTitle} · ${company}`}>
            {jobTitle}{company !== "Untitled company" ? ` · ${company}` : ""}
          </span>
          {reqCount > 0 && (
            <button type="button" className="cvb-v2-reqpill mono" onClick={onReqPill}>
              {reqCount} requirements extracted →
            </button>
          )}
          {worthIt && worthIt.verdict !== "checking" && worthIt.score > 0 && (
            // The prize axis beside Ready (winnability) — "this job is a strong
            // match; now get your CV ready for it."
            <span className={`cvb-v2-worth mono cvb-v2-worth-${worthIt.verdict}`}>
              {verdictLabel(worthIt.verdict)} · {worthIt.score}
            </span>
          )}
        </>
      )}

      <span className="cvb-v2-headspacer" aria-hidden />

      {saveState && <span className="cvb-v2-savestate mono" role="status" aria-live="polite">{saveState}</span>}

      <div className="cvb-v2-score" data-band={scoreBand(shown)}>
        <div className="cvb-v2-score-nums">
          <span className="cvb-v2-score-num mono tabnum">{shown}</span>
          <span className="cvb-v2-score-cap mono">{scoreCaption ?? (isMaster ? "/100 · Myro Score" : "/100 · Ready")}</span>
        </div>
        <div className="cvb-v2-score-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready}
          aria-label={isMaster ? "Myro Score" : "Readiness for this job"}>
          <div className="cvb-v2-score-fill" style={{ width: `${Math.max(0, Math.min(100, shown))}%` }} />
        </div>
      </div>

      {!isMaster && delta > 0 && <span className="cvb-v2-deltachip mono">▲ +{delta} raised</span>}

      <button type="button" className="cvb-v2-applybtn" onClick={onApply} disabled={!canApply} title={applyHint}>
        {primaryLabel}
      </button>

      {!hideOverflow && (
        <div className="cvb-pgc-overflow">
          <button
            type="button"
            className="cvb-pgc-overflow-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="More actions"
            aria-expanded={menuOpen}
          >⋯</button>
          {menuOpen && (
            <div className="cvb-pgc-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDownload() }}>
                <Icon name="download" size={13} /> Download PDF
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
