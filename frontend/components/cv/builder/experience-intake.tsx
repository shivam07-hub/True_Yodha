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

import { useEffect, useRef, useState } from "react"
import { cv as cvApi, privateNotes, type IntakeBullet } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"

interface RoleRef { index: number; label: string }

// Scraped JDs arrive with raw HTML entities (GitHub&rsquo;s&nbsp;fastest…). Decode
// the common ones so the reference reads as prose, not markup (journey 2b / ND3).
const _ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘",
  "&rdquo;": "”", "&ldquo;": "“", "&mdash;": "—", "&ndash;": "–",
  "&hellip;": "…", "&#x27;": "'", "&#x2F;": "/",
}
function decodeEntities(s: string): string {
  return s
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos|rsquo|lsquo|rdquo|ldquo|mdash|ndash|hellip|#x27|#x2F);/g, m => _ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

interface ExperienceIntakeProps {
  token: string
  jobId: string
  jdText: string
  gapSkills: string[]
  roles: RoleRef[]
  adding: boolean
  onAdd: (roleIndex: number | null, text: string) => Promise<void>
  onClose: () => void
}

export function ExperienceIntake({ token, jobId, jdText, gapSkills, roles, adding, onAdd, onClose }: ExperienceIntakeProps) {
  const [raw, setRaw] = useState("")
  const [bullets, setBullets] = useState<IntakeBullet[] | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showJd, setShowJd] = useState(false)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [busyIdx, setBusyIdx] = useState<number | null>(null)
  // Per-card user edits before Add: the real number they supply (3.5) and the
  // destination role they choose, overriding Mentor's default pick (4.2).
  const [metricInput, setMetricInput] = useState<Record<number, string>>({})
  const [roleOverride, setRoleOverride] = useState<Record<number, number | null>>({})

  // The raw story is the most valuable thing the user writes — never lose it
  // (journey Entry 3.1/3.2). It's saved as a PRIVATE per-job note (PV1-safe):
  // restored on reopen, autosaved as they type, and never wiped by "Write another".
  const savedRef = useRef<string>("")   // last body flushed to the server
  const restored = useRef(false)

  useEffect(() => {
    let alive = true
    void privateNotes.get(token, "cv", jobId)
      .then(note => {
        if (alive && note.body && !restored.current) {
          restored.current = true
          savedRef.current = note.body
          setRaw(prev => prev || note.body!)   // don't clobber anything already typed
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [token, jobId])

  function flushNote(text: string) {
    const body = text.trim()
    if (body === savedRef.current) return
    savedRef.current = body
    void privateNotes.put(token, "cv", jobId, body).catch(() => { savedRef.current = "" })
  }

  // Debounced autosave while typing; a final flush happens on close/draft too.
  useEffect(() => {
    if (!restored.current && !raw) return
    const t = setTimeout(() => flushNote(raw), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])

  function closeAndSave() {
    flushNote(raw)
    onClose()
  }

  async function draft() {
    if (!raw.trim() || drafting) return
    flushNote(raw)   // the story is worth keeping the moment they draft
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
      const destination = i in roleOverride ? roleOverride[i] : b.role_index
      const metric = (metricInput[i] || "").trim()
      let text = b.text
      if (b.needs_metric && metric) {
        // User gave the real number → Mentor places it. Falls back to the plain
        // bullet if placement fails, so Add never blocks on the LLM.
        try { text = (await cvApi.intakePlaceMetric(token, { bullet: b.text, metric })).text }
        catch { /* keep original */ }
      }
      await onAdd(destination, text)
      setAdded(prev => new Set(prev).add(i))
    } catch {
      setError("Couldn't add that bullet. Try again.")
    } finally {
      setBusyIdx(null)
    }
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
      <div id="cvb-intake-jd-body" className={`cvb-intake-jd-body${showJd ? " open" : ""}`}>{decodeEntities(jdText)}</div>
    </div>
  )

  const destOptions = [
    ...roles.map(r => ({ value: String(r.index), label: r.label })),
    { value: "end", label: "End of your experience" },
  ]

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Add from your experience" onClick={closeAndSave}>
      <div className={`cvb-modal cvb-intake${splitMode ? " cvb-intake--split" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <span><Icon name="sparkle" size={14}/> Add from your experience</span>
          <button type="button" className="cvb-intake-x" onClick={closeAndSave} aria-label="Close">✕</button>
        </div>

        <div className="cvb-modal-body cvb-intake-body">
          {bullets ? (
            <>
              <p className="cvb-intake-lede">Add the ones that ring true.</p>
              <div className="cvb-intake-results">
                {bullets.map((b, i) => {
                  const isAdded = added.has(i)
                  const dest = i in roleOverride ? roleOverride[i] : b.role_index
                  return (
                    <div key={i} className={`cvb-intake-card${isAdded ? " added" : ""}`}>
                      <div className="cvb-intake-card-text">{b.text}</div>

                      {b.skills_covered.length > 0 && (
                        <div className="cvb-intake-card-skills">
                          {b.skills_covered.map(s => <span key={s} className="cvb-intake-tag ok">✓ {s}</span>)}
                        </div>
                      )}

                      {/* 3.5: user supplies the real number → Mentor places it on Add */}
                      {b.needs_metric && !isAdded && (
                        <label className="cvb-intake-metric">
                          <span className="mono cvb-intake-metric-label">Add a real number</span>
                          <input
                            type="text"
                            className="cvb-intake-metric-input"
                            placeholder="e.g. ₹2Cr · 10,000 users · 20%"
                            value={metricInput[i] || ""}
                            onChange={e => setMetricInput(p => ({ ...p, [i]: e.target.value }))}
                          />
                        </label>
                      )}

                      {/* 3.4 + 4.2: destination is its own line, and it's the user's to change */}
                      <div className="cvb-intake-card-dest">
                        <span className="mono cvb-intake-dest-label">Lands under</span>
                        <select
                          className="cvb-intake-dest-select"
                          value={dest == null ? "end" : String(dest)}
                          disabled={isAdded}
                          aria-label="Choose where this point lands"
                          onChange={e => setRoleOverride(p => ({ ...p, [i]: e.target.value === "end" ? null : Number(e.target.value) }))}
                        >
                          {destOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      <button
                        type="button"
                        className={`cvb-pgc-fix-btn cvb-intake-add${isAdded ? " done" : ""}`}
                        onClick={() => add(i, b)}
                        disabled={isAdded || busyIdx !== null || adding}
                      >{isAdded ? "Added ✓" : busyIdx === i ? "Adding…" : "Add"}</button>
                    </div>
                  )
                })}
              </div>
              {error && <div className="cvb-intake-err" role="alert">{error}</div>}
              <div className="cvb-intake-foot">
                {/* Keep the story — never wipe raw (Entry 3.2). Just return to the writer. */}
                <Button variant="neutral" size="sm" onClick={() => { setBullets(null); setError(null) }}>
                  ← Write another
                </Button>
                <button type="button" className="cvb-pgc-apply cvb-intake-draft" onClick={closeAndSave}>Done</button>
              </div>
            </>
          ) : splitMode ? (
            <div className="cvb-intake-split">
              <aside className="cvb-intake-brief">
                {chips}
                {jdBlock}
              </aside>
              <div className="cvb-intake-write">
                <p className="cvb-intake-lede">In your words — what you’ve done that fits.</p>
                {writeFields}
              </div>
            </div>
          ) : (
            <>
              <p className="cvb-intake-lede">In your words — what you’ve done that fits.</p>
              {chips}
              {writeFields}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
