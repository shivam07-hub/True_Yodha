"use client"

/**
 * A settled line. Rail if you said it yourself, no rail if Myro guessed.
 *
 * Tap the plate — or the trailing pencil — to edit inline. `Enter` saves,
 * `Escape` cancels, `Delete` (the action, not the key) drops the line.
 * The three-buttoned action row only shows while editing; at rest the
 * plate reads as text with a whispered pencil.
 *
 * Editing a guess PROMOTES it. `onReword` is the same server call the old
 * `<GuessRow>` used, so the source flips to `user_reworded` on the next
 * order fetch and the rail appears without a client-side prediction.
 */

import { useEffect, useId, useRef, useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SOURCE_LABEL, type LineSource, type OrderLine } from "@/lib/preflight/types"

import "./plate.css"

const USER_SOURCES: readonly LineSource[] = ["user_said", "user_reworded"]

export function Plate({
  line,
  eyebrow,
  onReword,
  onDrop,
  busy,
}: {
  line: OrderLine
  /** WHERE · WON'T TAKE · LEANS — the slot the line answers. */
  eyebrow?: string
  onReword: (text: string) => void
  onDrop: () => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(line.text)
  const ta = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const said = USER_SOURCES.includes(line.source) ? "user" : "myro"

  // Fresh line text arriving from the server (a save landing, another tab
  // rewording) overwrites the draft only when we're not currently editing.
  useEffect(() => { if (!editing) setDraft(line.text) }, [editing, line.text])

  useEffect(() => {
    if (!editing) return
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
    el.focus()
    el.select()
  }, [editing])

  function grow() {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  function save() {
    const text = draft.trim()
    if (!text || text === line.text) { setEditing(false); return }
    setEditing(false)
    onReword(text)
  }

  function cancel() {
    setEditing(false)
    setDraft(line.text)
  }

  const meta = line.source_note || SOURCE_LABEL[line.source]

  return (
    <div
      className="pf-plate"
      data-said={said}
      data-editing={editing ? "true" : undefined}
      role="group"
      aria-labelledby={`${id}-line`}
      onClick={(e) => {
        if (editing) return
        if (busy) return
        if ((e.target as HTMLElement).closest(".pf-plate-action, .pf-plate-input")) return
        setEditing(true)
      }}
    >
      <div className="pf-plate-body">
        <div className="pf-plate-copy">
          {eyebrow ? <div className="pf-plate-eyebrow">{eyebrow}</div> : null}
          <div className="pf-plate-line" id={`${id}-line`}>{line.text}</div>
          {editing ? (
            <textarea
              ref={ta}
              className="pf-plate-input"
              value={draft}
              maxLength={240}
              rows={1}
              aria-label="Edit line"
              onChange={(e) => { setDraft(e.target.value); grow() }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save() }
                if (e.key === "Escape") { e.preventDefault(); cancel() }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
          <div className="pf-plate-meta"><span>{meta}</span></div>
        </div>
        {editing ? null : (
          <button
            type="button"
            className="pf-plate-edit tm-control-focus"
            aria-label="Edit line"
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            disabled={busy}
          >
            <Icon name="edit" size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="pf-plate-actions">
          <button
            type="button"
            className="pf-plate-action tm-control-focus"
            data-role="drop"
            onClick={(e) => { e.stopPropagation(); onDrop() }}
            disabled={busy}
          >
            Drop
          </button>
          <button
            type="button"
            className="pf-plate-action tm-control-focus"
            data-role="cancel"
            onClick={(e) => { e.stopPropagation(); cancel() }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pf-plate-action tm-control-focus"
            data-role="save"
            onClick={(e) => { e.stopPropagation(); save() }}
            disabled={busy}
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  )
}
