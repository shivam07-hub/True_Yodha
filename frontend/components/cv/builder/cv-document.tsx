/**
 * CvDocument — the whole CV, as the editor.
 *
 * Identity is pinned. Every other section is a droppable block. Role cards
 * reorder inside Experience. Hidden lines leave the paper; chrome restores them.
 */
"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { CVStructured, UserSkillsByDomain } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { collectHiddenLines } from "@/lib/cv/hidden-lines"
import { moveSection, normalizeSectionOrder, type SectionKey } from "@/lib/cv/section-order"
import { CvIdentityCard, type IdentityLines } from "./cv-identity-card"
import { CvLineRow } from "./cv-line-row"
import { CvHiddenChrome } from "./cv-hidden-chrome"
import { GripDots } from "./cv-grip"
import { PaperSection, sectionLabel, type PaperBind } from "./cv-paper-sections"
import { applyBulletMove, remapHiddenIids, type PointerKind } from "./cv-pointer-order"
import { verdictLabel, verdictLabelDense, type LineVerdict } from "./cv-severity"
import type { PointerRowModel } from "./cv-pointer-list"

export interface CvDocumentProps {
  cv: CVStructured
  identity: IdentityLines
  hidden: Set<string>
  verdicts: Map<string, LineVerdict>
  targeted: boolean
  openIid: string | null
  activeOffenders?: string[]
  renderRewrite: (iid: string, text: string) => ReactNode
  onOpenFix: (iid: string) => void
  onToggleHidden?: (iid: string) => void
  onEditLine: (oldText: string, newText: string) => void
  onCopyLine?: (text: string) => void
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
  identityEditable?: boolean
  onAddBullet?: (roleIndex: number, text: string) => void
  onReorderRoles?: (from: number, to: number) => void
  sectionOrder?: SectionKey[] | null
  onSectionOrder?: (order: SectionKey[]) => void
  userSkills?: UserSkillsByDomain | null
  flash?: { iid: string; n: number } | null
  editRequest?: { iid: string; n: number } | null
}

export function CvDocument(props: CvDocumentProps) {
  const {
    cv, identity, hidden, verdicts, targeted, openIid, activeOffenders, renderRewrite,
    onOpenFix, onToggleHidden, onEditLine, onCopyLine, onPatch, identityEditable,
    onAddBullet, onReorderRoles, sectionOrder, onSectionOrder, userSkills, flash, editRequest,
  } = props
  const [editingIid, setEditingIid] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [copiedIid, setCopiedIid] = useState<string | null>(null)
  const [drafting, setDrafting] = useState<Set<"summary" | "skills">>(() => new Set())
  const openDraft = (key: "summary" | "skills") =>
    setDrafting(prev => new Set(prev).add(key))
  const rows = useRef<Record<string, HTMLElement | null>>({})
  const order = normalizeSectionOrder(sectionOrder)
  const canDragSections = !!onSectionOrder

  useEffect(() => {
    if (!flash) return
    const el = rows.current[flash.iid]
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.remove("cvw-pulse")
    void el.offsetWidth
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  function model(iid: string, text: string): PointerRowModel {
    const v = verdicts.get(iid)
    return {
      iid, text, verdict: v,
      verdictLabel: v ? verdictLabel(v, targeted) : undefined,
      verdictDense: v ? verdictLabelDense(v, targeted) : undefined,
      hidden: hidden.has(iid),
      editing: editingIid === iid,
      editDraft: draft,
      copied: copiedIid === iid,
      rewrite: openIid === iid ? renderRewrite(iid, text) : null,
      activeOffenders: openIid === iid ? activeOffenders : undefined,
    }
  }

  function line(iid: string, text: string, opts: { mono?: boolean } = {}) {
    const row = model(iid, text)
    if (row.hidden) return null
    return (
      <CvLineRow
        key={iid}
        text={text}
        verdict={row.verdict}
        verdictLabel={row.verdictLabel}
        verdictDense={row.verdictDense}
        mono={opts.mono}
        userSkills={userSkills}
        hidden={false}
        editing={row.editing}
        editDraft={draft}
        copied={row.copied}
        activeOffenders={row.activeOffenders}
        rewrite={row.rewrite}
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

  function reorder(kind: PointerKind, groupIndex: number, from: number, to: number) {
    if (!onPatch || from === to) return
    const section = kind === "exp_bullet" ? "experience" : "projects"
    const bullets = section === "experience"
      ? cv.experience[groupIndex]?.bullets
      : cv.projects[groupIndex]?.bullets
    if (!bullets) return
    if (onToggleHidden) {
      const nextHidden = remapHiddenIids(hidden, kind, groupIndex, bullets, from, to)
      for (const id of hidden) if (!nextHidden.has(id)) onToggleHidden(id)
      for (const id of nextHidden) if (!hidden.has(id)) onToggleHidden(id)
    }
    onPatch(d => applyBulletMove(d, section, groupIndex, from, to))
  }

  const bind: PaperBind = {
    cv, openIid, userSkills, onPatch, onAddBullet, onReorderRoles, onOpenFix, onToggleHidden,
    onStartEdit: (iid, text) => { setEditingIid(iid); setDraft(text) },
    onEditDraftChange: setDraft,
    onSaveEdit: () => {
      if (!editingIid) return
      const text = lineTextFor(cv, editingIid)
      const next = draft.trim()
      if (text && next && next !== text) onEditLine(text, next)
      setEditingIid(null)
    },
    onCopy: onCopyLine ? (iid, text) => {
      onCopyLine(text)
      setCopiedIid(iid)
      setTimeout(() => setCopiedIid(c => (c === iid ? null : c)), 1500)
    } : undefined,
    rowRef: (iid, el) => { rows.current[iid] = el },
    model, line, reorder, drafting, openDraft,
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  function onSectionDrag(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !onSectionOrder) return
    const from = order.indexOf(String(active.id) as SectionKey)
    const to = order.indexOf(String(over.id) as SectionKey)
    if (from < 0 || to < 0) return
    onSectionOrder(moveSection(order, from, to))
  }

  const hiddenLines = onToggleHidden ? collectHiddenLines(cv, hidden) : []

  return (
    <div className="cvw-doc">
      <div id="cvw-sec-contact">
        <CvIdentityCard
          lines={identity}
          contact={cv.contact}
          onPatch={identityEditable ? onPatch : undefined}
        />
      </div>

      <DndContext id="cvw-sections" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDrag}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map(key => {
            if (key === "projects" && cv.projects.length === 0 && !canDragSections) return null
            return (
            <SortableSection key={key} id={key} disabled={!canDragSections} label={sectionLabel(key)}>
              <PaperSection section={key} bind={bind} />
            </SortableSection>
            )
          })}
        </SortableContext>
      </DndContext>

      {onToggleHidden && (
        <CvHiddenChrome lines={hiddenLines} onShow={onToggleHidden} />
      )}
    </div>
  )
}

function SortableSection({
  id, disabled, label, children,
}: {
  id: string
  disabled: boolean
  label: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition }}
    >
      <div className="cvw-sec" id={`cvw-sec-${id}`}>
        {!disabled && (
          <button type="button" className="cvw-drag" {...attributes} {...listeners} aria-label={`Reorder ${label}`}>
            <GripDots />
          </button>
        )}
        {label}
      </div>
      {children}
    </div>
  )
}

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
