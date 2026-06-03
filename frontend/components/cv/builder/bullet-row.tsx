/**
 * Single bullet row inside the experience pane.
 * Toggle = include/exclude. Hits = keyword chips matching JD targets.
 */
"use client"

import { useEffect, useRef } from "react"
import { Icon } from "./icons"
import { formatKeywordChipLabel, type KeywordTarget } from "./keyword-utils"

interface BulletRowProps {
  text: string
  hits: KeywordTarget[]
  hidden: boolean
  editable: boolean
  onToggle: () => void
  onEdit?: (next: string) => void
}

export function BulletRow({ text, hits, hidden, editable, onToggle, onEdit }: BulletRowProps) {
  const editableRef = useRef<HTMLDivElement>(null)

  // Sync DOM text with prop text when the prop changes from outside.
  useEffect(() => {
    if (editableRef.current && editableRef.current.innerText !== text) {
      editableRef.current.innerText = text
    }
  }, [text])

  return (
    <div className={`cvb-bullet${hidden ? " hidden" : ""}`}>
      <button
        type="button"
        className={`cvb-checkbox${hidden ? "" : " checked"}`}
        onClick={onToggle}
        role="checkbox"
        aria-checked={!hidden}
        aria-label={hidden ? "Include this bullet" : "Hide this bullet"}
      >
        <Icon name="check" size={11} stroke={3} />
      </button>

      <div style={{ minWidth: 0 }}>
        <div
          ref={editableRef}
          className="cvb-bullet-text"
          contentEditable={editable && !hidden}
          suppressContentEditableWarning
          onBlur={(e) => {
            const next = e.currentTarget.innerText.trim()
            if (next && next !== text && onEdit) onEdit(next)
          }}
        >
          {text}
        </div>
        <div className="cvb-bullet-meta">
          {hits.length > 0 ? (
            hits.slice(0, 4).map(h => (
              <span key={h.kw} className="cvb-kw-chip match" style={{ fontSize: 10.5 }}>
                <span className="dot"/>{formatKeywordChipLabel(h.kw)}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontFamily: "var(--cvb-font-mono)", padding: "1px 7px" }}>
              ○ no target match
            </span>
          )}
          {hits.length > 4 && (
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontFamily: "var(--cvb-font-mono)" }}>
              +{hits.length - 4}
            </span>
          )}
        </div>
      </div>

      {editable && (
        <div className="cvb-bullet-actions">
          <button
            type="button"
            className="cvb-bullet-action"
            onClick={() => editableRef.current?.focus()}
            aria-label="Edit bullet inline"
            title="Edit"
          >
            <Icon name="edit" size={12}/>
          </button>
        </div>
      )}
    </div>
  )
}
