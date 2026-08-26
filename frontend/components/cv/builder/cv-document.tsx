/**
 * CvDocument — the whole CV, as the editor. Rank 2 of the hierarchy redesign.
 *
 * Handoff §3: renders the WHOLE CV — contact → summary → every role → skills →
 * education → certifications — with no fixed height and no `overflow:hidden`.
 * The previous pane stopped at experience and dropped every empty section, so a
 * CV with no summary and no education looked finished. Empty sections are now
 * dashed placeholders carrying their own severity.
 *
 * Every line is a CvLineRow (`3px 1fr auto`). The rewrite opens INSIDE the row,
 * under the line — the rail never expands one.
 *
 * One `onPatch` writes content through to the living master from whichever
 * surface is mounted (locked 2026-08-25). `identityEditable` is separate and
 * master-only: a tailored CV parents to the master, so name/email/phone have
 * exactly one home.
 */
"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { CVStructured, UserSkillsByDomain } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { CvIdentityCard, type IdentityLines } from "./cv-identity-card"
import { CvLineRow } from "./cv-line-row"
import { CvTailSections } from "./cv-tail-sections"
import { EmptySection } from "./cv-empty-section"
import { verdictLabel, verdictLabelDense, type LineVerdict } from "./cv-severity"

export interface CvDocumentProps {
  cv: CVStructured
  identity: IdentityLines
  hidden: Set<string>
  verdicts: Map<string, LineVerdict>
  /** A job is in play, so "on target" means something. */
  targeted: boolean
  /** The line whose rewrite is open. Owned above so the rail can drive it. */
  openIid: string | null
  /** The open fix's offending phrases — the mark on the line follows the brief
   *  being read, instead of leaving an unrelated finding's phrase underlined. */
  activeOffenders?: string[]
  renderRewrite: (iid: string, text: string) => ReactNode
  onOpenFix: (iid: string) => void
  onToggleHidden?: (iid: string) => void
  onEditLine: (oldText: string, newText: string) => void
  onCopyLine?: (text: string) => void
  /** Content write-through to the living master. */
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
  /** Master surface only — identity has one home. */
  identityEditable?: boolean
  onAddBullet?: (roleIndex: number, text: string) => void
  /** ATS-extracted skills, for the rank-4 chip line under each bullet. */
  userSkills?: UserSkillsByDomain | null
  /** Jump request from the rail: scroll to a line and pulse it. */
  flash?: { iid: string; n: number } | null
  /** "Edit it myself" — put this line straight into its textarea. Bump `n` to
   *  re-request the same line. */
  editRequest?: { iid: string; n: number } | null
}

export function CvDocument(props: CvDocumentProps) {
  const {
    cv, identity, hidden, verdicts, targeted, openIid, activeOffenders, renderRewrite,
    onOpenFix, onToggleHidden, onEditLine, onCopyLine, onPatch, identityEditable,
    onAddBullet, userSkills, flash, editRequest,
  } = props
  const [editingIid, setEditingIid] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [copiedIid, setCopiedIid] = useState<string | null>(null)
  const [composerRole, setComposerRole] = useState<number | null>(null)
  const [composerDraft, setComposerDraft] = useState("")
  // Sections the user opened from an `add ›` placeholder. A blank section has
  // no line to put into edit mode, so the placeholder hands over to a draft
  // field that patches the master on every keystroke.
  const [drafting, setDrafting] = useState<Set<"summary" | "skills">>(() => new Set())
  const openDraft = (key: "summary" | "skills") =>
    setDrafting(prev => new Set(prev).add(key))
  const rows = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!flash) return
    const el = rows.current[flash.iid]
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.remove("cvw-pulse")
    void el.offsetWidth // force reflow so re-jumping the same line replays it
    el.classList.add("cvw-pulse")
    const t = setTimeout(() => el.classList.remove("cvw-pulse"), 1600)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (!editRequest) return
    const el = rows.current[editRequest.iid]
    setEditingIid(editRequest.iid)
    setDraft(lineTextFor(cv, editRequest.iid) ?? "")
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    // `cv` is read once to seed the textarea; re-running when it changes would
    // clobber what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  function line(iid: string, text: string, opts: { mono?: boolean } = {}) {
    const editing = editingIid === iid
    const v = verdicts.get(iid)
    return (
      <CvLineRow
        key={iid}
        text={text}
        verdict={v}
        verdictLabel={v ? verdictLabel(v, targeted) : undefined}
        verdictDense={v ? verdictLabelDense(v, targeted) : undefined}
        mono={opts.mono}
        userSkills={userSkills}
        hidden={hidden.has(iid)}
        editing={editing}
        editDraft={draft}
        copied={copiedIid === iid}
        activeOffenders={openIid === iid ? activeOffenders : undefined}
        rewrite={openIid === iid ? renderRewrite(iid, text) : null}
        rowRef={el => { rows.current[iid] = el }}
        onOpenFix={() => onOpenFix(iid)}
        onToggleHidden={onToggleHidden ? () => onToggleHidden(iid) : undefined}
        onStartEdit={() => { setEditingIid(iid); setDraft(text) }}
        onEditDraftChange={setDraft}
        onSaveEdit={() => {
          const next = draft.trim()
          if (next && next !== text) onEditLine(text, next)
          setEditingIid(null)
        }}
        onCopy={onCopyLine ? () => {
          onCopyLine(text)
          setCopiedIid(iid)
          setTimeout(() => setCopiedIid(c => (c === iid ? null : c)), 1500)
        } : undefined}
      />
    )
  }

  return (
    <div className="cvw-doc">
      {/* No CONTACT heading — the block is self-evidently the contact block, and
          a label above a name is the "disabled field says cannot be edited" of
          section headers. The anchor an ATS row jumps to lives on the card. */}
      <div id="cvw-sec-contact">
        <CvIdentityCard
          lines={identity}
          contact={cv.contact}
          onPatch={identityEditable ? onPatch : undefined}
        />
      </div>

      <div className="cvw-sec" id="cvw-sec-summary">Summary</div>
      {cv.summary?.trim() ? (
        <div className="cvw-card">{line(itemId("summary", 0, cv.summary), cv.summary)}</div>
      ) : drafting.has("summary") && onPatch ? (
        <SectionDraft
          value={cv.summary ?? ""}
          placeholder="One paragraph on who you are."
          label="Summary"
          onChange={v => onPatch(d => ({ ...d, summary: v }))}
        />
      ) : (
        <EmptySection
          copy="Empty — one paragraph on who you are."
          severity="blocking"
          onAdd={onPatch ? () => openDraft("summary") : undefined}
        />
      )}

      <div className="cvw-sec" id="cvw-sec-experience">Experience</div>
      {cv.experience.map((exp, ei) => (
        <div key={`exp-${ei}`} className="cvw-card">
          <div className="cvw-rolehead">
            <span className="cvw-roletitle">{exp.role}</span>
            {exp.company && <span className="cvw-roleco">{exp.company}</span>}
            {exp.dates && <span className="cvw-roledates">{exp.dates}</span>}
          </div>
          {exp.bullets.map((b, bi) => line(itemId("exp_bullet", ei * 100 + bi, b), b))}
          {onAddBullet && (composerRole === ei ? (
            <div className="cvw-line">
              <span className="cvw-gutter" aria-hidden />
              <div className="cvw-linebody">
                <textarea
                  className="cvw-edit"
                  rows={3}
                  autoFocus
                  value={composerDraft}
                  placeholder="What you actually did here"
                  aria-label="New bullet"
                  onChange={e => setComposerDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (composerDraft.trim()) onAddBullet(ei, composerDraft.trim())
                      setComposerRole(null); setComposerDraft("")
                    }
                  }}
                />
                <div className="cvw-lineacts" style={{ opacity: 1 }}>
                  <button type="button" className="cvw-lineact" onClick={() => setComposerRole(null)}>cancel</button>
                </div>
              </div>
              <button
                type="button"
                className="cvw-verdict"
                disabled={!composerDraft.trim()}
                onClick={() => {
                  if (composerDraft.trim()) onAddBullet(ei, composerDraft.trim())
                  setComposerRole(null); setComposerDraft("")
                }}
              >add ›</button>
            </div>
          ) : (
            <div className="cvw-line">
              <span className="cvw-gutter" aria-hidden />
              <div className="cvw-linebody">
                <button
                  type="button"
                  className="cvw-lineact"
                  onClick={() => { setComposerDraft(""); setComposerRole(ei) }}
                >＋ add a point</button>
              </div>
              <span aria-hidden />
            </div>
          ))}
        </div>
      ))}

      {cv.projects.length > 0 && <div className="cvw-sec">Projects</div>}
      {cv.projects.map((p, pi) => (
        <div key={`proj-${pi}`} className="cvw-card">
          {p.name && (
            <div className="cvw-rolehead"><span className="cvw-roletitle">{p.name}</span></div>
          )}
          {p.bullets.map((b, bi) => line(itemId("proj_bullet", pi * 100 + bi, b), b))}
        </div>
      ))}

      <div className="cvw-sec" id="cvw-sec-skills">Skills</div>
      {cv.skills_line?.trim() ? (
        <div className="cvw-card">
          {line(itemId("skills_line", 0, cv.skills_line), cv.skills_line, { mono: true })}
        </div>
      ) : drafting.has("skills") && onPatch ? (
        <SectionDraft
          value={cv.skills_line ?? ""}
          placeholder="Comma-separated: the tools and methods you actually use."
          label="Skills"
          onChange={v => onPatch(d => ({ ...d, skills_line: v }))}
        />
      ) : (
        <EmptySection
          copy="Empty — the tools and methods you actually use."
          severity="optional"
          onAdd={onPatch ? () => openDraft("skills") : undefined}
        />
      )}

      <CvTailSections cv={cv} onPatch={onPatch} />
    </div>
  )
}

/** A blank section, opened from its `add ›` placeholder. Writes through on every
 *  keystroke — the surface's own autosave is the save, so there is no second
 *  "done" step to forget. */
function SectionDraft({
  value, placeholder, label, onChange,
}: {
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <div className="cvw-card">
      <div className="cvw-line">
        <span className="cvw-gutter" aria-hidden />
        <div className="cvw-linebody">
          <textarea
            className="cvw-edit"
            rows={3}
            autoFocus
            value={value}
            placeholder={placeholder}
            aria-label={label}
            onChange={e => onChange(e.target.value)}
          />
        </div>
        <span aria-hidden />
      </div>
    </div>
  )
}

/** The current text of a line, by its editor iid. Used to seed the textarea when
 *  the edit is requested from elsewhere (the rail's "Edit it myself"). */
function lineTextFor(cv: CVStructured, iid: string): string | null {
  if (cv.summary && itemId("summary", 0, cv.summary) === iid) return cv.summary
  for (const [ei, e] of cv.experience.entries()) {
    for (const [bi, b] of e.bullets.entries()) {
      if (itemId("exp_bullet", ei * 100 + bi, b) === iid) return b
    }
  }
  for (const [pi, p] of cv.projects.entries()) {
    for (const [bi, b] of p.bullets.entries()) {
      if (itemId("proj_bullet", pi * 100 + bi, b) === iid) return b
    }
  }
  if (cv.skills_line && itemId("skills_line", 0, cv.skills_line) === iid) return cv.skills_line
  return null
}
