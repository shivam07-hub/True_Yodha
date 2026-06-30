/**
 * ExperienceIntake — "Add from your experience" (CV Playground Option C).
 *
 * The user reads the JD, writes in their own words what they've done that fits,
 * and Mentor shapes it into JD-aligned bullets — each tagged with the gap skills
 * it covers and the best-fit role. Accepting a bullet writes it into the living
 * master (onAdd → saveMaster), so it surfaces on the CV and the matching gap
 * ticks green. Honest by construction: every bullet is built from the user's own
 * words; Mentor never invents a number (it flags needs_metric instead).
 *
 * Input layout: the role (left, recessed "brief") and the draft (right, active
 * surface) sit side by side so reading and writing happen in parallel — the
 * modal's own instruction is "read the role, then write," so the role stays
 * visible while you write. Mobile stacks the two; the JD collapses behind a
 * toggle there since side-by-side won't fit. Once Mentor returns bullets the
 * JD is no longer needed, so the results view drops back to a single column.
 */
"use client"

import { useState } from "react"
import { cv as cvApi, type IntakeBullet } from "@/lib/api"
import { Icon } from "./icons"

interface RoleRef { index: number; label: string }

interface ExperienceIntakeProps {
  token: string
  jdText: string
  gapSkills: string[]
  roles: RoleRef[]
  adding: boolean
  onAdd: (roleIndex: number | null, text: string) => Promise<void>
  onClose: () => void
}

export function ExperienceIntake({ token, jdText, gapSkills, roles, adding, onAdd, onClose }: ExperienceIntakeProps) {
  const [raw, setRaw] = useState("")
  const [bullets, setBullets] = useState<IntakeBullet[] | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showJd, setShowJd] = useState(false)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [busyIdx, setBusyIdx] = useState<number | null>(null)

  async function draft() {
    if (!raw.trim() || drafting) return
    setDrafting(true); setError(null)
    try {
      const res = await cvApi.intakeDraft(token, {
        raw_text: raw.trim(),
        jd_text: jdText || null,
        gap_skills: gapSkills,
        roles: roles.map(r => r.label),
      })
      if (res.mode !== "draft" || res.bullets.length === 0) {
        setError(res.rationale ?? "Couldn't draft a bullet — add more detail and retry.")
      } else {
        setBullets(res.bullets); setAdded(new Set())
      }
    } catch {
      setError("Drafting is unavailable right now. Try again.")
    } finally {
      setDrafting(false)
    }
  }

  async function add(i: number, b: IntakeBullet) {
    if (added.has(i) || busyIdx !== null) return
    setBusyIdx(i)
    try {
      await onAdd(b.role_index, b.text)
      setAdded(prev => new Set(prev).add(i))
    } catch {
      setError("Couldn't add that bullet. Try again.")
    } finally {
      setBusyIdx(null)
    }
  }

  function roleLabel(i: number | null): string {
    if (i == null) return "end of your experience"
    return roles.find(r => r.index === i)?.label ?? "your experience"
  }

  // Split read-while-write only when there's a role to read AND we're still
  // drafting. After bullets return, the JD is dead weight → single column.
  const splitMode = !bullets && !!jdText

  const writeFields = (
    <>
      <textarea
        className="cvb-intake-input"
        value={raw}
        rows={6}
        autoFocus
        placeholder="e.g. At Capgemini I led a 4-person team to win a GCC enterprise client in South Europe — owned discovery, mapped their needs to our product, closed the deal."
        onChange={e => setRaw(e.target.value)}
      />
      {error && <div className="cvb-intake-err" role="alert">{error}</div>}
      <div className="cvb-intake-foot">
        <span className="cvb-intake-nofab mono">Myro shapes your words — it never invents numbers.</span>
        <button type="button" className="cvb-pgc-apply cvb-intake-draft" onClick={draft} disabled={!raw.trim() || drafting}>
          {drafting ? "Drafting…" : "Draft with Mentor →"}
        </button>
      </div>
    </>
  )

  const chips = gapSkills.length > 0 && (
    <div className="cvb-intake-chips">
      <span className="cvb-pgc-eyebrow">This role wants</span>
      <div>{gapSkills.slice(0, 8).map(s => <span key={s} className="cvb-intake-chip">{s}</span>)}</div>
    </div>
  )

  // The scrollable JD. On desktop-split it's always open beside the draft; on
  // mobile (and the toggle) it collapses to keep the textarea reachable.
  const jdBlock = jdText && (
    <div className="cvb-intake-jd">
      <button
        type="button"
        className="cvb-intake-jd-toggle"
        onClick={() => setShowJd(v => !v)}
        aria-expanded={showJd}
        aria-controls="cvb-intake-jd-body"
      >
        <Icon name={showJd ? "chevron-down" : "chevron-right"} size={12}/> {showJd ? "Hide" : "Read"} the job description
      </button>
      <div id="cvb-intake-jd-body" className={`cvb-intake-jd-body${showJd ? " open" : ""}`}>{jdText}</div>
    </div>
  )

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add from your experience" onClick={onClose}>
      <div className={`cvb-modal cvb-intake${splitMode ? " cvb-intake--split" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <span><Icon name="sparkle" size={14}/> Add from your experience</span>
          <button type="button" className="cvb-intake-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cvb-modal-body cvb-intake-body">
          {bullets ? (
            <>
              <p className="cvb-intake-lede">Add the ones that ring true — each drops into your CV under the right role.</p>
              <div className="cvb-intake-results">
                {bullets.map((b, i) => {
                  const isAdded = added.has(i)
                  return (
                    <div key={i} className={`cvb-intake-card${isAdded ? " added" : ""}`}>
                      <div className="cvb-intake-card-text">{b.text}</div>
                      <div className="cvb-intake-card-meta">
                        {b.skills_covered.map(s => <span key={s} className="cvb-intake-tag ok">✓ {s}</span>)}
                        <span className="cvb-intake-tag role">→ {roleLabel(b.role_index)}</span>
                        {b.needs_metric && <span className="cvb-intake-tag warn">add a real number for more punch</span>}
                      </div>
                      <button
                        type="button"
                        className={`cvb-pgc-fix-btn${isAdded ? " done" : ""}`}
                        onClick={() => add(i, b)}
                        disabled={isAdded || busyIdx !== null || adding}
                      >{isAdded ? "Added ✓" : busyIdx === i ? "Adding…" : "Add"}</button>
                    </div>
                  )
                })}
              </div>
              {error && <div className="cvb-intake-err" role="alert">{error}</div>}
              <div className="cvb-intake-foot">
                <button type="button" className="cvb-btn sm" onClick={() => { setBullets(null); setRaw(""); setError(null) }}>
                  ← Write another
                </button>
                <button type="button" className="cvb-pgc-apply cvb-intake-draft" onClick={onClose}>Done</button>
              </div>
            </>
          ) : splitMode ? (
            <div className="cvb-intake-split">
              <aside className="cvb-intake-brief">
                {chips}
                {jdBlock}
              </aside>
              <div className="cvb-intake-write">
                <p className="cvb-intake-lede">
                  Read the role, then tell Myro — in your words — what you’ve done that fits. Mentor shapes it into
                  strong, ATS-ready bullets and works in the skills this job wants.
                </p>
                {writeFields}
              </div>
            </div>
          ) : (
            <>
              <p className="cvb-intake-lede">
                Tell Myro — in your words — what you’ve done that fits the roles you’re tailoring for. Mentor shapes it
                into strong, ATS-ready bullets and works in the skills these jobs want.
              </p>
              {chips}
              {writeFields}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
