/**
 * Sortable list of experience/project pointers.
 *
 * Pointer drag uses @dnd-kit (already in package.json, unused until now).
 * Keyboard reorder is ArrowUp/ArrowDown on the grip — KeyboardSensor skips
 * native buttons, so a custom path is the one that actually works.
 */
"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { UserSkillsByDomain } from "@/lib/api"
import { CvLineRow } from "./cv-line-row"
import {
  arrangeByText,
  collapseKey,
  defaultExpanded,
  moveItem,
  neighbourIndex,
  occurrences,
  type PointerKind,
} from "./cv-pointer-order"
import type { LineVerdict } from "./cv-severity"
import "./cv-pointer.css"

export interface PointerRowModel {
  iid: string
  text: string
  verdict?: LineVerdict
  verdictLabel?: string
  verdictDense?: string
  hidden: boolean
  editing: boolean
  editDraft: string
  copied: boolean
  rewrite: ReactNode
  activeOffenders?: string[]
}

interface CvPointerListProps {
  kind: PointerKind
  groupIndex: number
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
}

export function CvPointerList(props: CvPointerListProps) {
  const { kind, groupIndex, bullets, rows, canReorder, onReorder } = props
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const [userOpen, setUserOpen] = useState<Record<string, boolean>>({})
  const [announce, setAnnounce] = useState("")
  // Dropped order is shown immediately; saveMaster is the existing write and
  // is not optimistic, so without this the row would snap back until refetch.
  const [order, setOrder] = useState<string[] | null>(null)
  const parentOrder = rows.map(r => r.text)
  const parentSig = parentOrder.join("\0")
  useEffect(() => {
    if (order && parentSig === order.join("\0")) setOrder(null)
  }, [parentSig, order])
  const shown = arrangeByText(rows, order)
  const occ = occurrences(shown.map(r => r.text))
  const ids = shown.map(r => r.iid)

  function move(from: number, to: number) {
    const current = order ?? parentOrder
    setOrder(moveItem(current, from, to))
    onReorder(from, to)
    setAnnounce(`Pointer ${from + 1} of ${bullets.length} moved to ${to + 1}`)
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    move(from, to)
  }

  return (
    <>
      <DndContext
        id={`cvw-${kind}-${groupIndex}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="cvw-pointers" aria-label="Pointers">
            {shown.map((row, index) => {
              const key = collapseKey(row.text, occ[index])
              const forced = defaultExpanded({
                bulletCount: bullets.length,
                tone: row.verdict?.tone,
                isOpen: props.openIid === row.iid,
                isEditing: row.editing,
              })
              const collapsed = row.editing || props.openIid === row.iid
                ? false
                : !(userOpen[key] ?? forced)
              return (
                <SortablePointer
                  key={row.iid}
                  row={row}
                  index={index}
                  count={bullets.length}
                  collapsed={collapsed}
                  canReorder={canReorder && bullets.length > 1 && !row.editing}
                  bodyId={`cvw-ptr-${kind}-${groupIndex}-${index}`}
                  userSkills={props.userSkills}
                  onToggleCollapsed={() =>
                    setUserOpen(prev => ({ ...prev, [key]: collapsed }))}
                  onMove={delta => {
                    const to = neighbourIndex(index, delta, bullets.length)
                    if (to != null) move(index, to)
                  }}
                  onOpenFix={() => props.onOpenFix(row.iid)}
                  onToggleHidden={props.onToggleHidden
                    ? () => props.onToggleHidden?.(row.iid) : undefined}
                  onStartEdit={() => props.onStartEdit(row.iid, row.text)}
                  onEditDraftChange={props.onEditDraftChange}
                  onSaveEdit={props.onSaveEdit}
                  onCopy={props.onCopy
                    ? () => props.onCopy?.(row.iid, row.text) : undefined}
                  rowRef={el => props.rowRef(row.iid, el)}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
    </>
  )
}

function SortablePointer({
  row, index, count, collapsed, canReorder, bodyId, userSkills,
  onToggleCollapsed, onMove, onOpenFix, onToggleHidden, onStartEdit,
  onEditDraftChange, onSaveEdit, onCopy, rowRef,
}: {
  row: PointerRowModel
  index: number
  count: number
  collapsed: boolean
  canReorder: boolean
  bodyId: string
  userSkills?: UserSkillsByDomain | null
  onToggleCollapsed: () => void
  onMove: (delta: -1 | 1) => void
  onOpenFix: () => void
  onToggleHidden?: () => void
  onStartEdit: () => void
  onEditDraftChange: (value: string) => void
  onSaveEdit: () => void
  onCopy?: () => void
  rowRef: (el: HTMLElement | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.iid,
    disabled: !canReorder,
  })

  function setRef(el: HTMLElement | null) {
    setNodeRef(el)
    rowRef(el)
  }

  const handle = canReorder ? (
    <button
      type="button"
      className="cvw-drag"
      {...attributes}
      {...listeners}
      aria-label={`Reorder pointer ${index + 1} of ${count}`}
      aria-grabbed={isDragging}
      onKeyDown={e => {
        listeners?.onKeyDown?.(e)
        if (e.key === "ArrowUp") { e.preventDefault(); onMove(-1) }
        if (e.key === "ArrowDown") { e.preventDefault(); onMove(1) }
      }}
    >
      <GripDots />
    </button>
  ) : null

  return (
    <CvLineRow
      style={{
        transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
        transition,
      }}
      text={row.text}
      verdict={row.verdict}
      verdictLabel={row.verdictLabel}
      verdictDense={row.verdictDense}
      hidden={row.hidden}
      editing={row.editing}
      editDraft={row.editDraft}
      copied={row.copied}
      rewrite={row.rewrite}
      activeOffenders={row.activeOffenders}
      userSkills={userSkills}
      onOpenFix={onOpenFix}
      onToggleHidden={onToggleHidden}
      onStartEdit={onStartEdit}
      onEditDraftChange={onEditDraftChange}
      onSaveEdit={onSaveEdit}
      onCopy={onCopy}
      rowRef={setRef}
      pointer={{
        bodyId,
        collapsed,
        onToggleCollapsed,
        dragHandle: handle,
        isDragging,
      }}
    />
  )
}

function GripDots() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="4" cy="3" r="1.1" fill="currentColor" />
      <circle cx="8" cy="3" r="1.1" fill="currentColor" />
      <circle cx="4" cy="6" r="1.1" fill="currentColor" />
      <circle cx="8" cy="6" r="1.1" fill="currentColor" />
      <circle cx="4" cy="9" r="1.1" fill="currentColor" />
      <circle cx="8" cy="9" r="1.1" fill="currentColor" />
    </svg>
  )
}
