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
import { CV_TEMPLATES, type CVTemplate } from "@/lib/cv/templates"
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
  /** Download the sheet as a PDF in the given template variant. Omitted template
   *  → the last-picked / default variant (non-menu paths). */
  onDownload: (template?: CVTemplate) => void
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
  /** Suppress the meter entirely when no score exists yet (first-run skill
   *  confirmation). A zeroed meter is not a neutral placeholder — it reads as
   *  a score of 0. `scoreCaption` still renders, so the header can say why. */
  hideScore?: boolean
  /** Number shown in place of the meter when hideScore is set (e.g. skills kept). */
  statusValue?: number
  /** Hide the back crumb when this surface has nowhere behind it. */
  hideBack?: boolean
  /** Crumb label. Default matches the library/playground back action. */
  backLabel?: string
  /** When set (imported jobs only), the job line becomes editable — the parser
   *  occasionally reads a page tagline as the role. Resolves once persisted. */
  onSaveJobMeta?: (v: { title: string; company: string }) => Promise<void>
}

export function PlaygroundHeader({
  jobTitle, company, reqCount, ready, delta, canApply, applyHint, saveState,
  onBack, onReqPill, onApply, onDownload,
  variant = "job", masterMeta, onMeta, primaryLabel = "Apply with this CV", hideOverflow,
  brandLabel, scoreCaption, hideScore, statusValue, hideBack, backLabel = "Back to CV library",
  onSaveJobMeta,
}: PlaygroundHeaderProps) {
  const shown = useCountUp(ready)
  const [menuOpen, setMenuOpen] = useState(false)
  const isMaster = variant === "master"
  const knownCompany = company !== "Untitled company" ? company : ""
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(jobTitle)
  const [companyDraft, setCompanyDraft] = useState(knownCompany)
  const [savingMeta, setSavingMeta] = useState(false)

  const openEdit = () => { setTitleDraft(jobTitle); setCompanyDraft(knownCompany); setEditing(true) }
  const saveMeta = async () => {
    const title = titleDraft.trim()
    if (!title || !onSaveJobMeta) return
    setSavingMeta(true)
    try { await onSaveJobMeta({ title, company: companyDraft.trim() }); setEditing(false) }
    finally { setSavingMeta(false) }
  }

  return (
    <header className="cvb-v2-head">
      {!hideBack && (
        <button type="button" className="cvb-v2-crumb" onClick={onBack} aria-label={backLabel}>
          <Icon name="chevron-right" size={12} style={{ transform: "rotate(180deg)" }} />
        </button>
      )}
      <span className="cvb-v2-brand">{brandLabel ?? (isMaster ? "Main CV" : "CV Playground")}</span>
      <span className="cvb-v2-headrule" aria-hidden />
      {isMaster ? (
        masterMeta && (onMeta
          ? <button type="button" className="cvb-v2-reqpill cvb-v2-metacta mono" onClick={onMeta}>{masterMeta}</button>
          : <span className="cvb-v2-jobline mono" title={masterMeta}>{masterMeta}</span>)
      ) : (
        <>
          {editing ? (
            <span className="cvb-v2-jobedit">
              <input className="cvb-v2-jobinput" value={titleDraft} placeholder="Role title"
                aria-label="Role title" autoFocus
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void saveMeta(); if (e.key === "Escape") setEditing(false) }} />
              <input className="cvb-v2-jobinput" value={companyDraft} placeholder="Company"
                aria-label="Company"
                onChange={e => setCompanyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void saveMeta(); if (e.key === "Escape") setEditing(false) }} />
              <button type="button" className="cvb-v2-jobsave" onClick={() => void saveMeta()}
                disabled={savingMeta || !titleDraft.trim()}>{savingMeta ? "Saving…" : "Save"}</button>
              <button type="button" className="cvb-v2-jobcancel" onClick={() => setEditing(false)} aria-label="Cancel">
                <Icon name="x" size={12} />
              </button>
            </span>
          ) : onSaveJobMeta ? (
            <button type="button" className="cvb-v2-jobline cvb-v2-jobline--edit"
              onClick={openEdit} title="Edit role & company">
              {jobTitle}{knownCompany ? ` · ${knownCompany}` : ""}
              <Icon name="edit" size={11} />
            </button>
          ) : (
            <span className="cvb-v2-jobline" title={`${jobTitle} · ${company}`}>
              {jobTitle}{knownCompany ? ` · ${knownCompany}` : ""}
            </span>
          )}
          {reqCount > 0 && (
            <button type="button" className="cvb-v2-reqpill mono" onClick={onReqPill}>
              {reqCount} requirements extracted →
            </button>
          )}
        </>
      )}

      <span className="cvb-v2-headspacer" aria-hidden />

      {saveState && <span className="cvb-v2-savestate mono" role="status" aria-live="polite">{saveState}</span>}

      {hideScore ? (
        <div className="cvb-v2-score">
          <div className="cvb-v2-score-nums">
            {statusValue != null && (
              <span className="cvb-v2-score-num mono tabnum">{statusValue}</span>
            )}
            {scoreCaption && <span className="cvb-v2-score-cap mono">{scoreCaption}</span>}
          </div>
        </div>
      ) : (
        <div className="cvb-v2-score" data-band={scoreBand(shown)}>
          <div className="cvb-v2-score-nums">
            <span className="cvb-v2-score-num mono tabnum">{shown}</span>
            <span className="cvb-v2-score-cap mono">{scoreCaption ?? (isMaster ? "/100 · Myro Score" : "/100 · Match")}</span>
          </div>
          <div className="cvb-v2-score-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready}
            aria-label={isMaster ? "Myro Score" : "Match to this job"}>
            <div className="cvb-v2-score-fill" style={{ width: `${Math.max(0, Math.min(100, shown))}%` }} />
          </div>
        </div>
      )}

      {!isMaster && delta > 0 && <span className="cvb-v2-deltachip mono">▲ +{delta} raised</span>}

      <button
        type="button"
        className="cvb-v2-applybtn"
        onClick={onApply}
        disabled={!canApply}
        title={applyHint}
      >
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
              <div className="cvb-pgc-menu-label mono">Download as</div>
              {CV_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  title={t.description}
                  onClick={() => { setMenuOpen(false); onDownload(t.id) }}
                >
                  <Icon name="download" size={13} /> {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  )
}
