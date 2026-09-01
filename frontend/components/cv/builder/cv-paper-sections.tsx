/**
 * One CV section body. Headings and section drag live in CvDocument.
 */
"use client"

import type { ReactNode } from "react"
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
import type { SectionKey } from "@/lib/cv/section-order"
import { CvRoleBlock } from "./cv-role-block"
import { SectionDraft } from "./cv-section-draft"
import { CvTailSections } from "./cv-tail-sections"
import { EmptySection } from "./cv-empty-section"
import { GripDots } from "./cv-grip"
import type { PointerKind } from "./cv-pointer-order"
import type { PointerRowModel } from "./cv-pointer-list"

export interface PaperBind {
  cv: CVStructured
  openIid: string | null
  userSkills?: UserSkillsByDomain | null
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
  onAddBullet?: (roleIndex: number, text: string) => void
  onReorderRoles?: (from: number, to: number) => void
  onOpenFix: (iid: string) => void
  onToggleHidden?: (iid: string) => void
  onStartEdit: (iid: string, text: string) => void
  onEditDraftChange: (value: string) => void
  onSaveEdit: () => void
  onCopy?: (iid: string, text: string) => void
  rowRef: (iid: string, el: HTMLElement | null) => void
  model: (iid: string, text: string) => PointerRowModel
  line: (iid: string, text: string, opts?: { mono?: boolean }) => ReactNode
  reorder: (kind: PointerKind, groupIndex: number, from: number, to: number) => void
  drafting: Set<"summary" | "skills">
  openDraft: (key: "summary" | "skills") => void
}

const HEAD: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  skills_line: "Skills",
  education: "Education",
  certs: "Certifications",
}

export function sectionLabel(key: SectionKey): string {
  return HEAD[key]
}

export function PaperSection({ section, bind }: { section: SectionKey; bind: PaperBind }) {
  if (section === "summary") return <SummaryBody bind={bind} />
  if (section === "experience") return <ExperienceBody bind={bind} />
  if (section === "projects") return <ProjectsBody bind={bind} />
  if (section === "skills_line") return <SkillsBody bind={bind} />
  if (section === "education") return <CvTailSections cv={bind.cv} onPatch={bind.onPatch} only="education" />
  return <CvTailSections cv={bind.cv} onPatch={bind.onPatch} only="certs" />
}

function pointerBind(bind: PaperBind) {
  return {
    openIid: bind.openIid,
    userSkills: bind.userSkills,
    canReorder: !!bind.onPatch,
    onOpenFix: bind.onOpenFix,
    onToggleHidden: bind.onToggleHidden,
    onStartEdit: bind.onStartEdit,
    onEditDraftChange: bind.onEditDraftChange,
    onSaveEdit: bind.onSaveEdit,
    onCopy: bind.onCopy,
    rowRef: bind.rowRef,
  }
}

function SummaryBody({ bind }: { bind: PaperBind }) {
  const { cv, onPatch, drafting, openDraft, line } = bind
  if (cv.summary?.trim()) {
    return <div className="cvw-card">{line(itemId("summary", 0, cv.summary), cv.summary)}</div>
  }
  if (drafting.has("summary") && onPatch) {
    return (
      <SectionDraft
        value={cv.summary ?? ""}
        placeholder="One paragraph on who you are."
        label="Summary"
        onChange={v => onPatch(d => ({ ...d, summary: v }))}
      />
    )
  }
  return (
    <EmptySection
      copy="Empty — one paragraph on who you are."
      severity="blocking"
      onAdd={onPatch ? () => openDraft("summary") : undefined}
    />
  )
}

function SkillsBody({ bind }: { bind: PaperBind }) {
  const { cv, onPatch, drafting, openDraft, line } = bind
  if (cv.skills_line?.trim()) {
    return (
      <div className="cvw-card">
        {line(itemId("skills_line", 0, cv.skills_line), cv.skills_line, { mono: true })}
      </div>
    )
  }
  if (drafting.has("skills") && onPatch) {
    return (
      <SectionDraft
        value={cv.skills_line ?? ""}
        placeholder="Comma-separated: the tools and methods you actually use."
        label="Skills"
        onChange={v => onPatch(d => ({ ...d, skills_line: v }))}
      />
    )
  }
  return (
    <EmptySection
      copy="Empty — the tools and methods you actually use."
      severity="optional"
      onAdd={onPatch ? () => openDraft("skills") : undefined}
    />
  )
}

function ExperienceBody({ bind }: { bind: PaperBind }) {
  const { cv } = bind
  const canDragRoles = !!(bind.onReorderRoles || bind.onPatch) && cv.experience.length > 1
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const ids = cv.experience.map((_, i) => `role-${i}`)

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    if (bind.onReorderRoles) bind.onReorderRoles(from, to)
    else bind.onPatch?.(d => ({ ...d, experience: move(d.experience, from, to) }))
  }

  return (
    <DndContext id="cvw-roles" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {cv.experience.map((exp, ei) => (
          <SortableRole key={`exp-${ei}`} id={ids[ei]} disabled={!canDragRoles}>
            {handle => (
              <CvRoleBlock
                kind="exp_bullet"
                groupIndex={ei}
                head={{ title: exp.role, company: exp.company, dates: exp.dates }}
                bullets={exp.bullets}
                rows={exp.bullets.map((b, bi) => bind.model(itemId("exp_bullet", ei * 100 + bi, b), b))}
                onReorder={(from, to) => bind.reorder("exp_bullet", ei, from, to)}
                onAddBullet={bind.onAddBullet ? text => bind.onAddBullet?.(ei, text) : undefined}
                dragHandle={handle}
                {...pointerBind(bind)}
              />
            )}
          </SortableRole>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function ProjectsBody({ bind }: { bind: PaperBind }) {
  if (bind.cv.projects.length === 0) return null
  return (
    <>
      {bind.cv.projects.map((p, pi) => (
        <CvRoleBlock
          key={`proj-${pi}`}
          kind="proj_bullet"
          groupIndex={pi}
          head={{ title: p.name }}
          bullets={p.bullets}
          rows={p.bullets.map((b, bi) => bind.model(itemId("proj_bullet", pi * 100 + bi, b), b))}
          onReorder={(from, to) => bind.reorder("proj_bullet", pi, from, to)}
          {...pointerBind(bind)}
        />
      ))}
    </>
  )
}

function SortableRole({
  id, disabled, children,
}: {
  id: string
  disabled: boolean
  children: (handle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled,
  })
  const handle = disabled ? null : (
    <button
      type="button"
      className="cvw-drag"
      {...attributes}
      {...listeners}
      aria-label="Reorder role"
      aria-grabbed={isDragging}
    >
      <GripDots />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition }}
    >
      {children(handle)}
    </div>
  )
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item === undefined) return list
  next.splice(to, 0, item)
  return next
}
