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
  onReword,
  onDrop,
  busy,
}: {
  line: OrderLine
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

  /**
   * The meta line earns its place or it does not appear.
   *
   * The rail already says who authored the line, so "you set this" under a
   * railed plate and "from your 66 notes" under an unrailed one are both the
   * rail restated in words — twenty rows of it on the shipped surface. What
   * the rail CANNOT say is that a line is soft (it tilts ranking, it does not
   * exclude) or unusable (Myro can't run it). Those two, and nothing else.
   */
  const meta = line.unusable
    ? "Myro can't run this — reword it"
    : line.soft
      ? "a preference, not a hard line"
      : null

  return (
    <div
      className="pf-plate"
      data-said={said}
      data-editing={editing ? "true" : undefined}
      role="group"
      /* The rail is a 2.5px colour bar — invisible to a screen reader. The
         source it encodes travels in the accessible name instead, so the
         attribution is never sighted-only. */
      aria-label={`${line.text} — ${SOURCE_LABEL[line.source]}`}
      onClick={(e) => {
        if (editing) return
        if (busy) return
        if ((e.target as HTMLElement).closest(".pf-plate-action, .pf-plate-input")) return
        setEditing(true)
      }}
    >
      <div className="pf-plate-body">
        <div className="pf-plate-copy">
          {/* No kind eyebrow. The statement says what it is — "Avoids large
              corporations" does not need a label reading WON'T TAKE above it,
              and twenty of those labels is the noise this rebuild removed. */}
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
          {meta ? <div className="pf-plate-meta"><span>{meta}</span></div> : null}
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
