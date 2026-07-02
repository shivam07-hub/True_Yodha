"use client"

import type { UserSkillsByDomain } from "@/lib/api"
import { BulletRewrite } from "./bullet-rewrite"
import { CVPointSkillChips } from "./cv-point-skill-chips"
import { bulletKeywordHits, type KeywordTarget } from "./keyword-utils"

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
}: CVPointRowProps) {
  const hits = mono ? [] : bulletKeywordHits(text, targets)

  return (
    <div ref={rowRef} className={`cvb-pgc-row${hidden ? " hidden" : ""}`}>
      <button
        type="button"
        className={`cvb-pgc-check${hidden ? "" : " on"}`}
        onClick={onToggle}
        aria-pressed={!hidden}
        title={hidden ? "Show on this CV" : "Hide from this CV"}
      >{hidden ? "" : "✓"}</button>
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
            <CVPointSkillChips text={text} skills={userSkills} />
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
