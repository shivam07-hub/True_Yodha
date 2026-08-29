"use client"

/**
 * A settled line, as a chip.
 *
 * This is the density fix. Every statement in the order used to be a
 * `<Plate>` — a 49px full-width glass card with blur, inset and drop shadow,
 * holding two words ("IT Sales"). Twenty statements cost twenty cards, an
 * empty slot cost 88px, and a typical order came to ~1,100px of content in a
 * 640px box. Two screens of scroll to read six short answers.
 *
 * A chip costs ~31px, shares its row with its neighbours, and carries the same
 * three things the plate did:
 *
 *   - the PROVENANCE rail (2.5px, `data-said`) and the same accessible name,
 *     because per-line provenance is the reason the Order exists at all;
 *   - reword, by clicking the text;
 *   - drop, by the trailing ✕.
 *
 * What it deliberately does NOT carry is the `soft` / `unusable` meta line.
 * "Myro can't run this — reword it" is actionable and must stay visible, so a
 * line with a meta note renders `wide` — a full-row chip with the note under
 * it. Exceptional lines get exceptional space; there are one or two per order,
 * not twenty.
 */

import { useEffect, useRef, useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SOURCE_LABEL, type LineSource, type OrderLine } from "@/lib/preflight/types"

import "./chip.css"

const USER_SOURCES: readonly LineSource[] = ["user_said", "user_reworded"]

/** The note under a wide chip. The rail already says who authored the line, so
 *  only the two things the rail CANNOT say earn a row of their own. */
function metaFor(line: OrderLine): string | null {
  if (line.unusable) return "Myro can't run this — reword it"
  if (line.soft) return "a preference, not a hard line"
  return null
}

export function Chip({
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
  const input = useRef<HTMLInputElement>(null)
  const said = USER_SOURCES.includes(line.source) ? "user" : "myro"
  const meta = metaFor(line)

  // Fresh text from the server (a save landing, another tab rewording)
  // overwrites the draft only while we are not editing.
  useEffect(() => { if (!editing) setDraft(line.text) }, [editing, line.text])

  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    input.current?.select()
  }, [editing])

  function save() {
    const text = draft.trim()
    setEditing(false)
    if (!text || text === line.text) { setDraft(line.text); return }
    onReword(text)
  }

  function cancel() {
    setEditing(false)
    setDraft(line.text)
  }

  if (editing) {
    return (
      <span className="pf-chip" data-said={said} data-editing="true" data-wide={meta ? "true" : undefined}>
        <input
          ref={input}
          className="pf-chip-input"
          value={draft}
          maxLength={240}
          aria-label={`Edit ${line.text}`}
          size={Math.max(draft.length, 8)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save() }
            if (e.key === "Escape") { e.preventDefault(); cancel() }
          }}
        />
      </span>
    )
  }

  return (
    <span
      className="pf-chip"
      data-said={said}
      data-wide={meta ? "true" : undefined}
      /* The rail is a colour bar — invisible to a screen reader. The source it
         encodes travels in the accessible name instead, so the attribution is
         never sighted-only. */
      aria-label={`${line.text} — ${SOURCE_LABEL[line.source]}`}
    >
      <span className="pf-chip-main">
        <button
          type="button"
          className="pf-chip-text tm-control-focus"
          onClick={() => setEditing(true)}
          disabled={busy}
          aria-label={`Edit ${line.text}`}
        >
          {line.text}
        </button>
        <button
          type="button"
          className="pf-chip-drop tm-control-focus"
          onClick={onDrop}
          disabled={busy}
          aria-label={`Remove ${line.text}`}
        >
          <Icon name="x" size={12} />
        </button>
      </span>
      {meta ? <span className="pf-chip-meta">{meta}</span> : null}
    </span>
  )
}
