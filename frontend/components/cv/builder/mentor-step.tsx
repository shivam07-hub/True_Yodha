/**
 * MentorStep — one requirement in the "Fix your CV with Mentor" walk.
 *
 * Renders the current ask's verdict + proposed move, and owns the drafting:
 * covered/weak run the matched story through Mentor (cvApi.intakeDraft) so it
 * lands JD-aligned under its auto-matched role; gap takes the user's words,
 * banks a new career story (onBankAnswer), AND drafts an immediate bullet — the
 * both-outcomes loop. A drafted bullet auto-matches its role (role_index); when
 * Mentor is unsure the user picks the section. Adding one bullet resolves the ask.
 */
"use client"

import { useState } from "react"
import { cv as cvApi, type CoverageRow, type IntakeBullet } from "@/lib/api"

interface RoleRef { index: number; label: string }

interface MentorStepProps {
  token: string
  row: CoverageRow
  jdText: string
  roles: RoleRef[]
  onAddBullet: (roleIndex: number | null, text: string) => Promise<void>
  onBankAnswer: (requirement: string, answer: string) => void
  onResolved: () => void
}

const VERDICT_LABEL: Record<string, string> = { covered: "Covered", weak: "Partial", gap: "Missing" }

export function MentorStep({ token, row, jdText, roles, onAddBullet, onBankAnswer, onResolved }: MentorStepProps) {
  const [answer, setAnswer] = useState("")
  const [bullets, setBullets] = useState<IntakeBullet[] | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [busyIdx, setBusyIdx] = useState<number | null>(null)
  const [dest, setDest] = useState<Record<number, number | null>>({})
  const [metric, setMetric] = useState<Record<number, string>>({})

  async function draft(rawText: string) {
    if (!rawText.trim() || drafting) return
    setDrafting(true); setError(null)
    try {
      const res = await cvApi.intakeDraft(token, {
        raw_text: rawText.trim(), jd_text: jdText || null,
        gap_skills: [row.requirement], roles: roles.map(r => r.label),
      })
      if (res.mode !== "draft" || res.bullets.length === 0) {
        setError(res.rationale ?? "Couldn't shape that yet — add a little more and retry.")
      } else { setBullets(res.bullets); setAdded(new Set()) }
    } catch { setError("Mentor is unavailable right now. Try again.") }
    finally { setDrafting(false) }
  }

  function submitGap() {
    const a = answer.trim()
    if (a.length < 12) { setError("Tell me a bit more so I can capture it."); return }
    onBankAnswer(row.requirement, a)  // bank a reusable story (fire-and-forget)
    void draft(a)                      // …and draft a bullet for this CV now
  }

  async function add(i: number, b: IntakeBullet) {
    if (added.has(i) || busyIdx !== null) return
    setBusyIdx(i); setError(null)
    try {
      const roleIndex = i in dest ? dest[i] : b.role_index
      let text = b.text
      const m = (metric[i] || "").trim()
      if (b.needs_metric && m) {
        try { text = (await cvApi.intakePlaceMetric(token, { bullet: b.text, metric: m })).text } catch { /* keep */ }
      }
      await onAddBullet(roleIndex, text)
      setAdded(prev => new Set(prev).add(i))
      onResolved()
    } catch { setError("Couldn't add that line. Try again.") }
    finally { setBusyIdx(null) }
  }

  const destOptions = [...roles.map(r => ({ v: String(r.index), l: r.label })), { v: "end", l: "End of experience" }]

  return (
    <div className="mw-stage-scroll">
      <div className="mw-eyebrow">
        <span className="mw-verdict-pill" data-v={row.status}>{VERDICT_LABEL[row.status]}</span>
      </div>
      <h3 className="mw-req">{row.requirement}</h3>

      {row.status !== "gap" && row.story_pointer && (
        <>
          <p className="mw-read">
            {row.status === "covered"
              ? <>You already prove this. Drop the line in, aligned to how Google phrases the ask.</>
              : <>You’re close. Let Mentor sharpen your line to hit this ask head-on.</>}
          </p>
          <div className="mw-proof" data-v={row.status}>
            <div className="mw-proof-src">{row.story_title || "Your story"}</div>
            <div className="mw-proof-text">{row.story_pointer}</div>
          </div>
        </>
      )}

      {row.status === "gap" && !bullets && (
        <>
          <p className="mw-read">Nothing in your stories covers this yet. Tell me what you’ve done — I’ll bank it as a story you can reuse, and draft a line for this CV now.</p>
          <textarea
            className="mw-gap-input" value={answer} rows={4} autoFocus
            placeholder="In your words — a project, result, or experience that fits this ask."
            onChange={e => setAnswer(e.target.value)}
          />
          <span className="mw-nofab">Myro shapes your words — it never invents numbers.</span>
        </>
      )}

      {!bullets ? (
        <div className="mw-draft-row" style={{ marginTop: 18 }}>
          {row.status === "gap" ? (
            <button type="button" className="mw-btn mw-btn-primary" onClick={submitGap} disabled={drafting || answer.trim().length < 12}>
              {drafting ? "Shaping…" : "Add to my CV →"}
            </button>
          ) : (
            <button type="button" className="mw-btn mw-btn-primary" onClick={() => draft(row.story_pointer)} disabled={drafting}>
              {drafting ? "Shaping…" : row.status === "covered" ? "Use this line →" : "Sharpen with Mentor →"}
            </button>
          )}
        </div>
      ) : (
        <div className="mw-drafts">
          <p className="mw-draft-lede">Add the line that rings true.</p>
          {bullets.map((b, i) => {
            const isAdded = added.has(i)
            const d = i in dest ? dest[i] : b.role_index
            return (
              <div key={i} className={`mw-draft${isAdded ? " added" : ""}`}>
                <div className="mw-draft-text">{b.text}</div>
                {b.needs_metric && !isAdded && (
                  <label className="mw-metric">
                    <span className="mw-draft-dest">Add a real number (optional)</span>
                    <input type="text" placeholder="e.g. ₹2Cr · 10,000 users · 20%"
                      value={metric[i] || ""} onChange={e => setMetric(p => ({ ...p, [i]: e.target.value }))} />
                  </label>
                )}
                <div className="mw-draft-row">
                  <span className="mw-draft-dest">Lands under</span>
                  <select className="mw-draft-select" value={d == null ? "end" : String(d)} disabled={isAdded}
                    aria-label="Choose where this line lands"
                    onChange={e => setDest(p => ({ ...p, [i]: e.target.value === "end" ? null : Number(e.target.value) }))}>
                    {destOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <button type="button" className={`mw-btn mw-btn-add${isAdded ? " done" : ""}`}
                    onClick={() => add(i, b)} disabled={isAdded || busyIdx !== null}>
                    {isAdded ? "Added ✓" : busyIdx === i ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <div className="mw-err" role="alert">{error}</div>}
    </div>
  )
}
