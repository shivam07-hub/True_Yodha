/**
 * CvLineRow — one CV line. Pointers (experience/project bullets) add quiet
 * chrome: a disclosure chevron and an optional drag handle. Severity is the
 * 3px gutter, not a wash of the whole row.
 *
 * Grid: gutter · chrome · body · verdict.
 * Non-pointers omit chrome and keep the original 3-column track.
 */
"use client"

import type { CSSProperties, ReactNode } from "react"
import type { UserSkillsByDomain } from "@/lib/api"
import { CVPointSkillChips } from "./cv-point-skill-chips"
import { Icon } from "./icons"
import type { LineVerdict } from "./cv-severity"
import { markOffenders } from "./offender-text"

export interface CvLineRowProps {
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
  /** The open fix's phrases — marked hot, the rest of the line's marks fade. */
  activeOffenders?: string[]
  /** Rendered under the line: the accent-ringed rewrite card. */
  rewrite?: ReactNode
  editing?: boolean
  editDraft?: string
  copied?: boolean
  /** ATS-extracted skills this line proves — rank 4. Hidden while collapsed. */
  userSkills?: UserSkillsByDomain | null
  /** Per-job projection only — the master has no hide. */
  onToggleHidden?: () => void
  onOpenFix?: () => void
  onStartEdit?: () => void
  onEditDraftChange?: (value: string) => void
  onSaveEdit?: () => void
  onCopy?: () => void
  rowRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  /** Pointer chrome. Absent on summary/skills — those are not reorderable. */
  pointer?: {
    bodyId: string
    collapsed: boolean
    onToggleCollapsed: () => void
    dragHandle?: ReactNode
    isDragging?: boolean
  }
}

export function CvLineRow({
  text, verdict, verdictLabel, verdictDense, mono, hidden, activeOffenders, rewrite,
  editing, editDraft, copied, userSkills,
  onToggleHidden, onOpenFix, onStartEdit, onEditDraftChange, onSaveEdit, onCopy, rowRef,
  style, pointer,
}: CvLineRowProps) {
  const actionable = !!onOpenFix && verdict != null && verdict.tone !== "on-target"
  const collapsed = !!pointer?.collapsed && !editing
  const open = pointer ? !collapsed : true
  const Tag = pointer ? "li" : "div"
  return (
    <Tag
      ref={rowRef as never}
      style={style}
      className={[
        "cvw-line",
        pointer ? "is-pointer" : "",
        collapsed ? "is-collapsed" : "",
        pointer?.isDragging ? "is-dragging" : "",
      ].filter(Boolean).join(" ")}
      data-sev={verdict?.tone}
      data-focus={!!activeOffenders?.length}
      aria-grabbed={pointer?.isDragging ? true : undefined}
    >
      <span className="cvw-gutter" aria-hidden />
      {pointer && (
        <div className="cvw-chrome">
          {pointer.dragHandle}
          <button
            type="button"
            className="cvw-disclose"
            aria-expanded={open}
            aria-controls={pointer.bodyId}
            aria-label={open ? "Collapse pointer" : "Expand pointer"}
            onClick={pointer.onToggleCollapsed}
          >
            <Icon name="chevron-down" size={12} aria-hidden />
          </button>
        </div>
      )}
      <div className="cvw-linebody" id={pointer?.bodyId}>
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
          <p className={`cvw-linetext${mono ? " mono" : ""}${collapsed ? " is-collapsed" : ""}`}>
            {verdict && verdict.offenders.length > 0
              ? markOffenders(text, verdict.offenders, activeOffenders)
              : text}
          </p>
        )}

        {open && !editing && !mono && !hidden && (
          <CVPointSkillChips text={text} skills={userSkills} />
        )}

        {open && rewrite}

        {open && !editing && (
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
    </Tag>
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
