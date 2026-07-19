"use client"

import { useState } from "react"
import type { UserSkillsByDomain } from "@/lib/api"
import { extractedSkillsForCvPoint } from "@/lib/skill-intelligence"
import { BulletRewrite } from "./bullet-rewrite"
import { CVPointSkillChips } from "./cv-point-skill-chips"
import { bulletKeywordHits, type KeywordTarget } from "./keyword-utils"
import type { ContentFinding } from "./content-checks"

export interface CVPointRewriteOption {
  iid: string
  label: string
}

export interface CVPointRewriteGroup {
  label: string
  opts: CVPointRewriteOption[]
}

export interface CVPointMeta {
  roleIndex: number
  kind: "exp" | "proj"
}

interface CVPointRowProps {
  token: string
  iid: string
  text: string
  hidden: boolean
  mono?: boolean
  editing: boolean
  editDraft: string
  copied: boolean
  targets: KeywordTarget[]
  userSkills?: UserSkillsByDomain | null
  /** Deterministic recruiter-check findings anchored to this bullet (#34 S2). */
  findings?: ContentFinding[]
  rewriteOpen: boolean
  rewriteKeywords: string[]
  missingKeywords: string[]
  applying: boolean
  meta?: CVPointMeta
  expGroups: CVPointRewriteGroup[]
  projOpts: CVPointRewriteOption[]
  rowRef: (element: HTMLDivElement | null) => void
  onToggle: () => void
  onEditDraftChange: (value: string) => void
  onSaveEdit: () => void
  onCopy: () => void
  onStartEdit: () => void
  onToggleRewrite: () => void
  onRetarget: (iid: string) => void
  onOpenComposer: (roleIndex: number) => void
  onApply: (oldText: string, newText: string) => void
  onCloseRewrite: () => void
  /** v2: this bullet's open fix — "{kind} +N" pill that opens the fix card. */
  fixPill?: { label: string; onClick: () => void }
  /** v2: session mark after a fix was applied here — "✓ +N". */
  appliedMark?: string
  /** Master surface: no per-job projection, so the hide toggle is meaningless —
   *  render an empty column keeper instead of a dead control. */
  hideToggle?: boolean
}

export function CVPointRow({
  token,
  iid,
  text,
  hidden,
  mono = false,
  editing,
  editDraft,
  copied,
  targets,
  userSkills,
  findings,
  rewriteOpen,
  rewriteKeywords,
  missingKeywords,
  applying,
  meta,
  expGroups,
  projOpts,
  rowRef,
  onToggle,
  onEditDraftChange,
  onSaveEdit,
  onCopy,
  onStartEdit,
  onToggleRewrite,
  onRetarget,
  onOpenComposer,
  onApply,
  onCloseRewrite,
  fixPill,
  appliedMark,
  hideToggle,
}: CVPointRowProps) {
  const [showDetails, setShowDetails] = useState(false)
  const hits = mono ? [] : bulletKeywordHits(text, targets)
  // Whole-bullet wash (#34 Q5-A): a flagged, visible, non-editing bullet gets a
  // soft tint + issue chips naming the offenders. No word-level marks — our
  // bullet is a live editor, span surgery would fight typing.
  const flags = !hidden && !editing ? (findings ?? []) : []
  const flagged = flags.length > 0
  // ATS-extracted skills the line proves. Diagnostics (flags + ATS chips) sit
  // behind one disclosure so the default view is just the line the user reads;
  // the soft wash still signals "this one has something to fix" at a glance.
  const atsSkills = mono || hidden || editing ? [] : extractedSkillsForCvPoint(text, userSkills)
  const hasDetails = flagged || atsSkills.length > 0

  return (
    <div ref={rowRef} className={`cvb-pgc-row${hidden ? " hidden" : ""}${flagged ? " flagged" : ""}`}>
      {hideToggle ? (
        <span aria-hidden />
      ) : (
        <button
          type="button"
          className={`cvb-pgc-check${hidden ? "" : " on"}`}
          onClick={onToggle}
          aria-pressed={!hidden}
          title={hidden ? "Show on this CV" : "Hide from this CV"}
        >{hidden ? "" : "✓"}</button>
      )}
      <div className="cvb-pgc-rowbody">
        {editing ? (
          <textarea
            className="cvb-pgc-edit"
            value={editDraft}
            rows={3}
            autoFocus
            onChange={(event) => onEditDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                onSaveEdit()
              }
            }}
          />
        ) : (
          <>
            <div className={`cvb-pgc-text${mono ? " mono" : ""}`}>
              {text}
              {hits.length > 0 && <span className="cvb-pgc-tag">✓ {hits.length} matched</span>}
            </div>
            {(fixPill || appliedMark || hasDetails) && (
              <div className="cvb-v2-metarow">
                {fixPill && (
                  <button
                    type="button"
                    className="cvb-v2-bulletpill mono"
                    onClick={e => { e.stopPropagation(); fixPill.onClick() }}
                    title="Open this fix"
                  >{fixPill.label}</button>
                )}
                {appliedMark && <span className="cvb-v2-bulletdone mono">{appliedMark}</span>}
                {hasDetails && (
                  <button
                    type="button"
                    className={`cvb-pgc-detailtoggle${flagged ? " flagged" : ""}`}
                    onClick={() => setShowDetails(v => !v)}
                    aria-expanded={showDetails}
                  >
                    {flagged
                      ? `${flags.length} to fix`
                      : showDetails ? "Hide ATS skills" : "ATS skills"}
                    <span className="cvb-pgc-detailcaret" aria-hidden>{showDetails ? "▾" : "▸"}</span>
                  </button>
                )}
              </div>
            )}
            {showDetails && flagged && (
              <div className="cvb-pgc-flags">
                {flags.map(f => (
                  <span key={f.id} className={`cvb-pgc-flag ${f.kind.toLowerCase()}`} title={f.detail}>
                    {f.kind}{f.offenders.length ? ` · ${f.offenders[0]}` : ""}
                  </span>
                ))}
              </div>
            )}
            {showDetails && <CVPointSkillChips text={text} skills={userSkills} />}
          </>
        )}
        {rewriteOpen && !editing && (
          <div className="cvb-pgc-rwwrap">
            {meta && (
              <div className="cvb-pgc-rw-target">
                <span className="mono cvb-pgc-rw-label">Rewrite</span>
                <select
                  className="cvb-pgc-rw-select"
                  value={iid}
                  onChange={(event) => onRetarget(event.target.value)}
                  aria-label="Choose which bullet to rewrite"
                >
                  {expGroups.map((group, index) => (
                    <optgroup key={`g-${index}`} label={group.label}>
                      {group.opts.map((option) => (
                        <option key={option.iid} value={option.iid}>{option.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  {projOpts.length > 0 && (
                    <optgroup label="Projects">
                      {projOpts.map((option) => (
                        <option key={option.iid} value={option.iid}>{option.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {meta.kind === "exp" && (
                  <button
                    type="button"
                    className="cvb-pgc-newpoint"
                    onClick={() => onOpenComposer(meta.roleIndex)}
                  >＋ New point</button>
                )}
              </div>
            )}
            <BulletRewrite
              token={token}
              bullet={text}
              missingKeywords={missingKeywords}
              seedKeywords={rewriteKeywords}
              auto
              applying={applying}
              onApply={onApply}
              onClose={onCloseRewrite}
            />
          </div>
        )}
      </div>
      <div className="cvb-pgc-acts">
        {editing ? (
          <button
            type="button"
            className="cvb-pgc-copy cvb-pgc-donebtn"
            onClick={onSaveEdit}
            title="Save this line"
          >✓ Done</button>
        ) : (
          <button
            type="button"
            className={`cvb-pgc-copy${copied ? " copied" : ""}`}
            onClick={onCopy}
            title="Copy this line"
          >⧉ {copied ? "Copied" : "Copy"}</button>
        )}
        {!mono && !editing && (
          <button
            type="button"
            className={`cvb-pgc-icon${rewriteOpen ? " on" : ""}`}
            onClick={onToggleRewrite}
            title="Rewrite stronger with Mentor"
            aria-label="Rewrite stronger"
          >↻</button>
        )}
        {!mono && !editing && (
          <button
            type="button"
            className="cvb-pgc-icon"
            onClick={onStartEdit}
            title="Edit this line"
            aria-label="Edit"
          >✎</button>
        )}
      </div>
    </div>
  )
}
