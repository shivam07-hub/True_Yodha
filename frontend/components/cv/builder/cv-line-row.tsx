/**
 * CvLineRow — rank 2. One CV line, and everything that is true about it.
 *
 * `grid-template-columns: 3px 1fr auto` (handoff §3):
 *   col 1  a full-bleed severity gutter
 *   col 2  the line at 16/1.6 in --tm-cv-line, offending phrase underlined,
 *          and the inline rewrite when it is open
 *   col 3  ONE mono verdict — `fix ›` · `on target` · `2 fixes`
 *
 * The row background is the severity at 10%. That replaces `.cvb-pgc-row.flagged`,
 * which washed every flagged line the same amber whether it was a missing number
 * or a repeated phrase — the defect the whole redesign exists to fix.
 *
 * The line-level actions (copy / edit / hide) disclose on hover rather than
 * sitting in a permanent third column: they are chrome about the line, and rank
 * 4 chrome must not compete with rank 2 for the eye at rest.
 */
"use client"

import type { ReactNode } from "react"
import type { UserSkillsByDomain } from "@/lib/api"
import { CVPointSkillChips } from "./cv-point-skill-chips"
import type { LineVerdict } from "./cv-severity"
import { markOffenders } from "./offender-text"

interface CvLineRowProps {
  text: string
  /** Absent ⇒ no gutter, no verdict: nothing is wrong and nothing is claimed. */
  verdict?: LineVerdict
  /** Desktop verdict — `fix ›` · `on target` · `2 fixes`. */
  verdictLabel?: string
  /** Phone verdict — the severity in words, because the 3px gutter is doing
   *  less work at that size. CSS picks one; both are in the DOM so the choice
   *  survives SSR without a matchMedia read. */
  verdictDense?: string
  mono?: boolean
  hidden?: boolean
  /** Rendered under the line: the accent-ringed rewrite card. */
  rewrite?: ReactNode
  editing?: boolean
  editDraft?: string
  copied?: boolean
  /** ATS-extracted skills this line proves — rank 4 (handoff §1). They used to
   *  hide behind a per-row "ATS skills" disclosure, which meant the one thing
   *  the line demonstrably proves took a click to see. */
  userSkills?: UserSkillsByDomain | null
  /** Per-job projection only — the master has no hide. */
  onToggleHidden?: () => void
  onOpenFix?: () => void
  onStartEdit?: () => void
  onEditDraftChange?: (value: string) => void
  onSaveEdit?: () => void
  onCopy?: () => void
  rowRef?: (el: HTMLDivElement | null) => void
}

export function CvLineRow({
  text, verdict, verdictLabel, verdictDense, mono, hidden, rewrite,
  editing, editDraft, copied, userSkills,
  onToggleHidden, onOpenFix, onStartEdit, onEditDraftChange, onSaveEdit, onCopy, rowRef,
}: CvLineRowProps) {
  const actionable = !!onOpenFix && verdict != null && verdict.tone !== "on-target"
  return (
    <div
      ref={rowRef}
      className={`cvw-line${hidden ? " is-hidden" : ""}`}
      data-sev={verdict?.tone}
    >
      <span className="cvw-gutter" aria-hidden />
      <div className="cvw-linebody">
        {editing ? (
          <textarea
            className="cvw-edit"
            rows={3}
            autoFocus
            value={editDraft ?? ""}
            onChange={e => onEditDraftChange?.(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit?.() }
              if (e.key === "Escape") onSaveEdit?.()
            }}
          />
        ) : (
          <p className={`cvw-linetext${mono ? " mono" : ""}`}>
            {verdict && verdict.offenders.length > 0 ? markOffenders(text, verdict.offenders) : text}
          </p>
        )}

        {!editing && !mono && !hidden && (
          <CVPointSkillChips text={text} skills={userSkills} />
        )}

        {rewrite}

        {!editing && (
          <div className="cvw-lineacts">
            {onCopy && (
              <button type="button" className="cvw-lineact" onClick={onCopy}>
                {copied ? "copied" : "copy"}
              </button>
            )}
            {onStartEdit && (
              <button type="button" className="cvw-lineact" onClick={onStartEdit}>edit</button>
            )}
            {onToggleHidden && (
              <button
                type="button"
                className="cvw-lineact"
                aria-pressed={!!hidden}
                onClick={onToggleHidden}
              >{hidden ? "show" : "hide"}</button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <button type="button" className="cvw-verdict" onClick={onSaveEdit}>done</button>
      ) : verdictLabel ? (
        actionable
          ? <button type="button" className="cvw-verdict" onClick={onOpenFix}>{label(verdictLabel, verdictDense)}</button>
          : <span className="cvw-verdict">{label(verdictLabel, verdictDense)}</span>
      ) : <span aria-hidden />}
    </div>
  )
}

function label(wide: string, dense?: string) {
  if (!dense || dense === wide) return wide
  return (
    <>
      <span className="cvw-v-wide">{wide}</span>
      <span className="cvw-v-dense">{dense}</span>
    </>
  )
}
