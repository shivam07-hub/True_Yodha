/**
 * CvDocument — the whole CV, as the editor. Rank 2 of the hierarchy redesign.
 *
 * Experience and project bullets are sortable pointers. Order writes through
 * `onPatch` (the same living-master path as every other content edit).
 */
"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { CVStructured, UserSkillsByDomain } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { CvIdentityCard, type IdentityLines } from "./cv-identity-card"
import { CvLineRow } from "./cv-line-row"
import { CvRoleBlock } from "./cv-role-block"
import { SectionDraft } from "./cv-section-draft"
import { CvTailSections } from "./cv-tail-sections"
import { EmptySection } from "./cv-empty-section"
import { applyBulletMove, remapHiddenIids, type PointerKind } from "./cv-pointer-order"
import { verdictLabel, verdictLabelDense, type LineVerdict } from "./cv-severity"
import type { PointerRowModel } from "./cv-pointer-list"

export interface CvDocumentProps {
  cv: CVStructured
  identity: IdentityLines
  hidden: Set<string>
  verdicts: Map<string, LineVerdict>
  /** A job is in play, so "on target" means something. */
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
  userSkills?: UserSkillsByDomain | null
  flash?: { iid: string; n: number } | null
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
  const [drafting, setDrafting] = useState<Set<"summary" | "skills">>(() => new Set())
  const openDraft = (key: "summary" | "skills") =>
    setDrafting(prev => new Set(prev).add(key))
  const rows = useRef<Record<string, HTMLElement | null>>({})

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
    return (
      <CvLineRow
        key={iid}
        text={text}
        verdict={row.verdict}
        verdictLabel={row.verdictLabel}
        verdictDense={row.verdictDense}
        mono={opts.mono}
        userSkills={userSkills}
        hidden={row.hidden}
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

  const pointerBind = {
    openIid,
    userSkills,
    canReorder: !!onPatch,
    onOpenFix,
    onToggleHidden,
    onStartEdit: (iid: string, text: string) => { setEditingIid(iid); setDraft(text) },
    onEditDraftChange: setDraft,
    onSaveEdit: () => {
      if (!editingIid) return
      const text = lineTextFor(cv, editingIid)
      const next = draft.trim()
      if (text && next && next !== text) onEditLine(text, next)
      setEditingIid(null)
    },
    onCopy: onCopyLine ? (iid: string, text: string) => {
      onCopyLine(text)
      setCopiedIid(iid)
      setTimeout(() => setCopiedIid(c => (c === iid ? null : c)), 1500)
    } : undefined,
    rowRef: (iid: string, el: HTMLElement | null) => { rows.current[iid] = el },
  }

  return (
    <div className="cvw-doc">
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
        <CvRoleBlock
          key={`exp-${ei}`}
          kind="exp_bullet"
          groupIndex={ei}
          head={{ title: exp.role, company: exp.company, dates: exp.dates }}
          bullets={exp.bullets}
          rows={exp.bullets.map((b, bi) => model(itemId("exp_bullet", ei * 100 + bi, b), b))}
          onReorder={(from, to) => reorder("exp_bullet", ei, from, to)}
          onAddBullet={onAddBullet ? text => onAddBullet(ei, text) : undefined}
          {...pointerBind}
        />
      ))}

      {cv.projects.length > 0 && <div className="cvw-sec">Projects</div>}
      {cv.projects.map((p, pi) => (
        <CvRoleBlock
          key={`proj-${pi}`}
          kind="proj_bullet"
          groupIndex={pi}
          head={{ title: p.name }}
          bullets={p.bullets}
          rows={p.bullets.map((b, bi) => model(itemId("proj_bullet", pi * 100 + bi, b), b))}
          onReorder={(from, to) => reorder("proj_bullet", pi, from, to)}
          {...pointerBind}
        />
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
