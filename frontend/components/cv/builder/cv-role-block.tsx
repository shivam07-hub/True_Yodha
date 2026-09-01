/**
 * One experience or project block: role head, sortable pointers, add-a-point.
 */
"use client"

import { useState, type ReactNode } from "react"
import type { UserSkillsByDomain } from "@/lib/api"
import { CvPointerList, type PointerRowModel } from "./cv-pointer-list"
import type { PointerKind } from "./cv-pointer-order"

interface RoleHead {
  title: string
  company?: string
  dates?: string
}

interface CvRoleBlockProps {
  kind: PointerKind
  groupIndex: number
  head: RoleHead
  bullets: string[]
  rows: PointerRowModel[]
  openIid: string | null
  userSkills?: UserSkillsByDomain | null
  canReorder: boolean
  onReorder: (from: number, to: number) => void
  onOpenFix: (iid: string) => void
  onToggleHidden?: (iid: string) => void
  onStartEdit: (iid: string, text: string) => void
  onEditDraftChange: (value: string) => void
  onSaveEdit: () => void
  onCopy?: (iid: string, text: string) => void
  rowRef: (iid: string, el: HTMLElement | null) => void
  onAddBullet?: (text: string) => void
  dragHandle?: ReactNode
}

export function CvRoleBlock(props: CvRoleBlockProps) {
  const { head, onAddBullet } = props
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState("")

  function add() {
    if (!draft.trim() || !onAddBullet) return
    onAddBullet(draft.trim())
    setComposing(false)
    setDraft("")
  }

  return (
    <div className="cvw-card">
      <div className="cvw-rolehead">
        {props.dragHandle}
        <span className="cvw-roletitle">{head.title}</span>
        {head.company && <span className="cvw-roleco">{head.company}</span>}
        {head.dates && <span className="cvw-roledates">{head.dates}</span>}
      </div>
      <CvPointerList
        kind={props.kind}
        groupIndex={props.groupIndex}
        bullets={props.bullets}
        rows={props.rows}
        openIid={props.openIid}
        userSkills={props.userSkills}
        canReorder={props.canReorder}
        onReorder={props.onReorder}
        onOpenFix={props.onOpenFix}
        onToggleHidden={props.onToggleHidden}
        onStartEdit={props.onStartEdit}
        onEditDraftChange={props.onEditDraftChange}
        onSaveEdit={props.onSaveEdit}
        onCopy={props.onCopy}
        rowRef={props.rowRef}
      />
      {onAddBullet && (composing ? (
        <div className="cvw-line">
          <span className="cvw-gutter" aria-hidden />
          <div className="cvw-linebody">
            <textarea
              className="cvw-edit"
              rows={3}
              autoFocus
              value={draft}
              placeholder="What you actually did here"
              aria-label="New bullet"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add() }
                if (e.key === "Escape") { setComposing(false); setDraft("") }
              }}
            />
            <div className="cvw-lineacts" style={{ opacity: 1 }}>
              <button type="button" className="cvw-lineact" onClick={() => { setComposing(false); setDraft("") }}>
                cancel
              </button>
            </div>
          </div>
          <button type="button" className="cvw-verdict" disabled={!draft.trim()} onClick={add}>
            add ›
          </button>
        </div>
      ) : (
        <div className="cvw-line">
          <span className="cvw-gutter" aria-hidden />
          <div className="cvw-linebody">
            <button
              type="button"
              className="cvw-lineact"
              onClick={() => { setDraft(""); setComposing(true) }}
            >＋ add a point</button>
          </div>
          <span aria-hidden />
        </div>
      ))}
    </div>
  )
}
