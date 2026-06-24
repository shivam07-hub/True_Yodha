/**
 * TailorView — the unified per-job tailoring surface (CV journey, first slice).
 *
 * One live screen: a single readiness number you BUILD UP by clearing inline fixes,
 * over the projected CV (your real points, best phrasing for this job). The signature
 * is the mechanic — clear a fix → the number climbs → the gap becomes a check. Words
 * stay ≤3 and common (feedback_minimal_ui_words); the number, icons, and CV carry it.
 *
 * Phase: SHADOW — binds to TAILOR_FIXTURE (shaped like the future projection endpoint);
 * swapping to live changes only the data source. Reuses the cvb-* and --tm- system.
 * Spec: project_cv_endtoend_journey.md.
 */
"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "./icons"
import { TAILOR_FIXTURE, type FixKind, type TailorFix, type TailorView as TailorData } from "./tailor-fixture"
import "./tailor-view.css"

const VERB: Record<FixKind, string> = { sharpen: "Sharpen", add: "Add", practice: "Practice" }

function forgeHref(skill: string): string {
  return `/forge?skill=${encodeURIComponent(skill)}`
}

/** Count the number up to its target — the one orchestrated moment. Reduced-motion
    and same-value updates land instantly. */
function useCountUp(target: number): number {
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

export function TailorView({ data = TAILOR_FIXTURE }: { data?: TailorData }) {
  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const [showScores, setShowScores] = useState(false)

  const ready = useMemo(() => {
    let r = data.base
    for (const f of data.fixes) if (cleared.has(f.id)) r += f.delta
    return Math.min(100, r)
  }, [data, cleared])

  const shown = useCountUp(ready)
  const delta = ready - data.base
  const openFixes = data.fixes.filter(f => !cleared.has(f.id))
  const noInlineLeft = openFixes.every(f => f.kind === "practice")

  function clearFix(f: TailorFix) {
    setCleared(s => new Set(s).add(f.id))   // practice routes via its Link, never lands here
  }

  return (
    <div className="cvb-ts">
      <header className="cvb-ts-head">
        <div className="cvb-ts-job">
          <span className="cvb-ts-job-title">{data.job_title}</span>
          {data.org && <span className="cvb-ts-job-org">· {data.org}</span>}
        </div>
        {data.reused > 0 && (
          <span className="cvb-ts-reused mono"><Icon name="check" size={11} stroke={3} /> {data.reused} reused</span>
        )}
      </header>

      <section className="cvb-ts-anchor">
        <button
          type="button"
          className="cvb-ts-score"
          aria-expanded={showScores}
          aria-label={`Ready ${ready} of 100`}
          onClick={() => setShowScores(s => !s)}
        >
          <span className="cvb-ts-num tabnum">{shown}</span>
          <span className="cvb-ts-num-cap">
            Ready{delta > 0 && <em className="cvb-ts-delta">▲ {delta}</em>}
          </span>
        </button>
        <button type="button" className="cvb-ts-apply">Apply</button>
      </section>

      {showScores && (
        <div className="cvb-ts-scores mono" role="group" aria-label="Score detail">
          <span>Skill fit <b className="tabnum">{data.skill_fit}</b></span>
          <span>Recruiter read <b className="tabnum">{data.recruiter_read}</b></span>
        </div>
      )}

      {openFixes.length > 0 ? (
        <section className="cvb-ts-fixes" aria-label="Fixes">
          {openFixes.map(f => (
            <div key={f.id} className="cvb-ts-fix">
              <span className="cvb-ts-fix-skill">
                {f.skill}
                {f.kind === "sharpen" && f.to_level && (
                  <span className="cvb-ts-fix-lvl mono"> L{f.from_level}→L{f.to_level}</span>
                )}
              </span>
              {f.kind === "practice" ? (
                <Link href={forgeHref(f.skill)} className="cvb-ts-fix-btn">{VERB.practice}</Link>
              ) : (
                <button type="button" className="cvb-ts-fix-btn primary" onClick={() => clearFix(f)}>
                  {VERB[f.kind]}
                </button>
              )}
            </div>
          ))}
        </section>
      ) : (
        <div className="cvb-ts-clear mono"><Icon name="check" size={13} stroke={3} /> All set</div>
      )}
      {openFixes.length > 0 && noInlineLeft && (
        <div className="cvb-ts-clear mono"><Icon name="check" size={13} stroke={3} /> Ready to apply</div>
      )}

      <section className="cvb-ts-cv" aria-label="Projected CV">
        {data.summary && <p className="cvb-ts-summary">{data.summary}</p>}
        {data.roles.map(role => (
          <div key={role.role_id} className="cvb-ts-role">
            <div className="cvb-ts-role-head">
              <span className="cvb-ts-role-title">{role.title}</span>
              <span className="cvb-ts-role-meta mono">{[role.org, role.dates].filter(Boolean).join(" · ")}</span>
            </div>
            <ul className="cvb-ts-points">
              {role.points.map(p => {
                const canon = p.variants.find(v => v.is_canonical) ?? p.variants[0]
                return <li key={p.point_key} className="cvb-ts-point">{canon?.text}</li>
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}
