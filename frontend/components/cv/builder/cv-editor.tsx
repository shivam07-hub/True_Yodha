/**
 * CVEditor — Option C right pane: the rendered CV *is* the editor.
 *
 * Each line carries its own actions inline: Copy (drop the exact text into a
 * company career-page form), Rewrite (Mentor streams a stronger version as a
 * diff), Edit (inline textarea), Hide (drop it from this job's projection).
 * Rewrites/edits write a new Main-CV baseline via rewriteApply; hides toggle the
 * job projection (auto-saved by the playground hook). The left rail can target a
 * specific bullet's rewrite via `rewriteTarget`.
 */
"use client"

import { useEffect, useRef, useState } from "react"
import type { CVStructured, UserProfile } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { BulletRewrite } from "./bullet-rewrite"
import { bulletKeywordHits, type KeywordTarget } from "./keyword-utils"

export interface RewriteTarget { iid: string; keywords: string[] }

interface CVEditorProps {
  token: string
  cv: CVStructured
  profile: UserProfile | null
  hiddenItems: Set<string>
  toggleItem: (iid: string) => void
  targets: KeywordTarget[]
  missingKeywords: string[]
  applying: boolean
  onApply: (oldText: string, newText: string) => void
  visibleCount: number
  wordCount: number
  rewriteTarget: RewriteTarget | null
  onClearRewriteTarget: () => void
}

function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(text); return }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea")
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"
  document.body.appendChild(ta); ta.focus(); ta.select()
  try { document.execCommand("copy") } catch { /* noop */ }
  document.body.removeChild(ta)
}

export function CVEditor({
  token, cv, profile, hiddenItems, toggleItem, targets, missingKeywords,
  applying, onApply, visibleCount, wordCount, rewriteTarget, onClearRewriteTarget,
}: CVEditorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingIid, setEditingIid] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [rewriteIid, setRewriteIid] = useState<string | null>(null)
  const [rewriteKw, setRewriteKw] = useState<string[]>([])
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // A rail "Sharpen / Add" action targets one host bullet — open its rewrite and
  // bring it into view, then clear the request so re-targeting the same row works.
  useEffect(() => {
    if (!rewriteTarget) return
    setEditingIid(null)
    setRewriteIid(rewriteTarget.iid)
    setRewriteKw(rewriteTarget.keywords)
    rowRefs.current[rewriteTarget.iid]?.scrollIntoView({ behavior: "smooth", block: "center" })
    onClearRewriteTarget()
  }, [rewriteTarget, onClearRewriteTarget])

  function copy(id: string, text: string) {
    copyText(text)
    setCopiedId(id)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopiedId(null), 1500)
  }
  function startEdit(iid: string, text: string) {
    setRewriteIid(null); setEditingIid(iid); setEditDraft(text)
  }
  function saveEdit(original: string) {
    const next = editDraft.trim()
    if (next && next !== original) onApply(original, next)
    setEditingIid(null)
  }

  function copyAllText(): string {
    const parts: string[] = []
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) parts.push(cv.summary)
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) parts.push(b)
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) parts.push(b)
    }))
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) parts.push(cv.skills_line)
    return parts.join("\n\n")
  }

  const contactName = cv.contact?.name?.trim() || profile?.full_name?.trim() || "Your name"
  const contactTitle = cv.contact?.title?.trim() || cv.experience[0]?.role || ""
  const contactMeta = [cv.contact?.email || profile?.email, cv.contact?.linkedin || profile?.linkedin_url]
    .filter(Boolean).join(" · ")

  function row(iid: string, text: string, opts: { mono?: boolean } = {}) {
    const hidden = hiddenItems.has(iid)
    const editing = editingIid === iid
    const copied = copiedId === iid
    const hits = opts.mono ? [] : bulletKeywordHits(text, targets)
    return (
      <div
        key={iid}
        ref={el => { rowRefs.current[iid] = el }}
        className={`cvb-pgc-row${hidden ? " hidden" : ""}`}
      >
        <button
          type="button"
          className={`cvb-pgc-check${hidden ? "" : " on"}`}
          onClick={() => toggleItem(iid)}
          aria-pressed={!hidden}
          title={hidden ? "Show on this CV" : "Hide from this CV"}
        >{hidden ? "" : "✓"}</button>
        <div className="cvb-pgc-rowbody">
          {editing ? (
            <>
              <textarea
                className="cvb-pgc-edit"
                value={editDraft}
                rows={3}
                autoFocus
                onChange={e => setEditDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(text) } }}
              />
              <button type="button" className="cvb-pgc-done" onClick={() => saveEdit(text)}>Done</button>
            </>
          ) : (
            <div className={`cvb-pgc-text${opts.mono ? " mono" : ""}`}>
              {text}
              {hits.length > 0 && <span className="cvb-pgc-tag">✓ {hits.length} matched</span>}
            </div>
          )}
          {rewriteIid === iid && !editing && (
            <BulletRewrite
              token={token}
              bullet={text}
              missingKeywords={missingKeywords}
              seedKeywords={rewriteKw}
              auto
              applying={applying}
              onApply={onApply}
              onClose={() => setRewriteIid(null)}
            />
          )}
        </div>
        <div className="cvb-pgc-acts">
          <button
            type="button"
            className={`cvb-pgc-copy${copied ? " copied" : ""}`}
            onClick={() => copy(iid, text)}
            title="Copy this line"
          >⧉ {copied ? "Copied" : "Copy"}</button>
          {!opts.mono && (
            <button
              type="button"
              className={`cvb-pgc-icon${rewriteIid === iid ? " on" : ""}`}
              onClick={() => { setEditingIid(null); setRewriteKw(missingKeywords); setRewriteIid(p => p === iid ? null : iid) }}
              title="Rewrite stronger with Mentor"
              aria-label="Rewrite stronger"
            >↻</button>
          )}
          {!opts.mono && (
            <button
              type="button"
              className="cvb-pgc-icon"
              onClick={() => startEdit(iid, text)}
              title="Edit this line"
              aria-label="Edit"
            >✎</button>
          )}
        </div>
      </div>
    )
  }

  const allCopied = copiedId === "__all"
  return (
    <div>
      <div className="cvb-pgc-editor-head">
        <span className="cvb-pgc-eyebrow accent">Your CV · this job</span>
        <div className="cvb-pgc-editor-meta">
          <span className="mono">{visibleCount} bullets · ~{wordCount} words · one page</span>
          <button
            type="button"
            className={`cvb-pgc-copyall${allCopied ? " copied" : ""}`}
            onClick={() => copy("__all", copyAllText())}
          >⧉ {allCopied ? "Copied all" : "Copy all"}</button>
        </div>
      </div>

      <div className="cvb-pgc-paper">
        <div className="cvb-pgc-name">{contactName}</div>
        {contactTitle && <div className="cvb-pgc-role">{contactTitle}</div>}
        {contactMeta && <div className="cvb-pgc-contact mono">{contactMeta}</div>}
        <div className="cvb-pgc-rule" />

        {cv.summary && (
          <>
            <div className="cvb-pgc-section">SUMMARY</div>
            {row(itemId("summary", 0, cv.summary), cv.summary)}
          </>
        )}

        {cv.experience.length > 0 && <div className="cvb-pgc-section">EXPERIENCE</div>}
        {cv.experience.map((exp, ei) => (
          <div key={`exp-${ei}`} className="cvb-pgc-role-block">
            <div className="cvb-pgc-role-head">
              <span className="cvb-pgc-role-title">{exp.role} <span>· {exp.company}</span></span>
              {exp.dates && <span className="mono cvb-pgc-role-dates">{exp.dates}</span>}
            </div>
            {exp.bullets.map((b, bi) => row(itemId("exp_bullet", ei * 100 + bi, b), b))}
          </div>
        ))}

        {cv.projects.length > 0 && <div className="cvb-pgc-section">PROJECTS</div>}
        {cv.projects.map((p, pi) => (
          <div key={`proj-${pi}`} className="cvb-pgc-role-block">
            {p.name && <div className="cvb-pgc-role-head"><span className="cvb-pgc-role-title">{p.name}</span></div>}
            {p.bullets.map((b, bi) => row(itemId("proj_bullet", pi * 100 + bi, b), b))}
          </div>
        ))}

        {cv.skills_line && (
          <>
            <div className="cvb-pgc-section">SKILLS</div>
            {row(itemId("skills_line", 0, cv.skills_line), cv.skills_line, { mono: true })}
          </>
        )}
      </div>
    </div>
  )
}
