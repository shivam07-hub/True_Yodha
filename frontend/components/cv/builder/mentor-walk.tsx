/**
 * MentorWalk — "Fix your CV with Mentor": the JD, one ask at a time (Lane C).
 *
 * A focused guided walk over the JD's real requirements (jd-coverage). Left spine
 * = every ask as a verdict-dotted checklist you complete; right = the focused
 * step (MentorStep owns the drafting). A "Job fit" meter up top climbs as asks
 * resolve — covered asks count from the start, weak/gap count once you act. When
 * every ask is addressed, a completion card closes the loop.
 *
 * Design lives entirely in the canonical --tm-* system; the one bold moment is
 * the climbing meter + spine ticks flipping toward covered.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import type { CoverageRow, JDCoverageResponse } from "@/lib/api"
import { Icon } from "./icons"
import { MentorStep } from "./mentor-step"

interface RoleRef { index: number; label: string }

interface MentorWalkProps {
  token: string
  coverage: JDCoverageResponse
  initialStep?: number
  jdText: string
  roles: RoleRef[]
  onAddBullet: (roleIndex: number | null, text: string) => Promise<void>
  onBankAnswer: (requirement: string, answer: string) => void
  onClose: () => void
}

const DOT: Record<string, string> = { covered: "✓", weak: "◐", gap: "" }

/** Shown while jd-coverage is still parsing the JD (LLM), so the walk opens
 *  instantly on click instead of after a 1-2s wait. */
export function MentorWalkLoading({ error, onRetry, onClose }: { error: boolean; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="mw-backdrop" role="dialog" aria-modal="true" aria-label="Fix your CV with Mentor" onClick={onClose}>
      <div className="mw-modal" onClick={e => e.stopPropagation()}>
        <div className="mw-head">
          <span className="mw-head-title"><Icon name="sparkle" size={14} className="mw-spark" /> Fix your CV with Mentor</span>
          <div className="mw-meter" />
          <button type="button" className="mw-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mw-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="mw-stage"><div className="mw-stage-scroll">
            {error ? (
              <>
                <p className="mw-read">Couldn’t read what this job wants.</p>
                <button type="button" className="mw-btn mw-btn-ghost" onClick={onRetry}>Try again</button>
              </>
            ) : <p className="mw-read">Reading what this job wants…</p>}
          </div></div>
        </div>
      </div>
    </div>
  )
}

export function MentorWalk({ token, coverage, initialStep, jdText, roles, onAddBullet, onBankAnswer, onClose }: MentorWalkProps) {
  const reqs = coverage.requirements
  // Start where the rail row was clicked, else the first ask that needs work
  // (covered asks are already done).
  const firstOpen = Math.max(0, reqs.findIndex(r => r.status !== "covered"))
  const [step, setStep] = useState(initialStep ?? firstOpen)
  const [resolved, setResolved] = useState<Set<number>>(new Set())
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const isDone = (i: number) => reqs[i].status === "covered" || resolved.has(i)
  const addressed = useMemo(
    () => reqs.reduce((n, r, i) => n + (r.status === "covered" || resolved.has(i) ? 1 : 0), 0),
    [reqs, resolved],
  )
  const pct = reqs.length ? Math.round((addressed / reqs.length) * 100) : 0

  const row: CoverageRow | undefined = reqs[step]

  function resolveCurrent() {
    setResolved(prev => new Set(prev).add(step))
  }

  return (
    <div className="mw-backdrop" role="dialog" aria-modal="true" aria-label="Fix your CV with Mentor" onClick={onClose}>
      <div className="mw-modal" onClick={e => e.stopPropagation()}>
        <div className="mw-head">
          <span className="mw-head-title"><Icon name="sparkle" size={14} className="mw-spark" /> Fix your CV with Mentor</span>
          <div className="mw-meter">
            <div className="mw-meter-top">
              <span>Job fit</span>
              <span><b>{addressed}</b> / {reqs.length} asks addressed</span>
            </div>
            <div className="mw-meter-track"><div className="mw-meter-fill" style={{ width: `${pct}%` }} /></div>
          </div>
          <button type="button" className="mw-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mw-body">
          <nav className="mw-spine" aria-label="Requirements">
            {reqs.map((r, i) => (
              <button
                key={i} type="button" className="mw-spine-item"
                data-done={isDone(i)} aria-current={i === step && !done}
                onClick={() => { setDone(false); setStep(i) }}
              >
                <span className="mw-dot" data-v={isDone(i) ? "covered" : r.status}>{isDone(i) ? "✓" : DOT[r.status]}</span>
                <span className="mw-spine-label">{r.requirement}</span>
              </button>
            ))}
          </nav>

          <div className="mw-stage">
            {done ? (
              <div className="mw-stage-scroll">
                <div className="mw-done-card">
                  <div className="mw-done-badge">✓</div>
                  <div className="mw-done-h">{addressed} of {reqs.length} asks addressed</div>
                  <p className="mw-done-p">
                    Every line traces to your real experience. Review your CV, then apply — and the stories you added are banked for next time.
                  </p>
                  <button type="button" className="mw-btn mw-btn-primary" onClick={onClose}>Back to my CV</button>
                </div>
              </div>
            ) : row ? (
              <MentorStep
                key={step}
                token={token}
                row={row}
                jdText={jdText}
                roles={roles}
                onAddBullet={onAddBullet}
                onBankAnswer={onBankAnswer}
                onResolved={resolveCurrent}
              />
            ) : null}

            {!done && (
              <div className="mw-foot">
                <button type="button" className="mw-btn mw-btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
                  ← Back
                </button>
                <div className="mw-foot-spacer" />
                <span className="mw-count">{step + 1} / {reqs.length}</span>
                <button
                  type="button" className={`mw-btn mw-btn-ghost${isDone(step) ? " mw-btn-next" : ""}`}
                  onClick={() => { if (step >= reqs.length - 1) setDone(true); else setStep(s => s + 1) }}
                >
                  {step >= reqs.length - 1 ? "Finish" : isDone(step) ? "Next →" : "Skip →"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
