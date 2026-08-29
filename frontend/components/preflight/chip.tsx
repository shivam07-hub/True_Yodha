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
 * What it does not carry inline is the meta note. "Myro can't run this —
 * reword it" is an instruction and must stay visible, so a line carrying one
 * renders `wide`: a full-row chip with the note beneath it. Exceptional lines
 * get exceptional space, and there are one or two per order rather than twenty.
 * See `metaFor` for the one case where a note is suppressed and why.
 */

import { useEffect, useRef, useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SOURCE_LABEL, type LineSource, type OrderLine } from "@/lib/preflight/types"

import "./chip.css"

const USER_SOURCES: readonly LineSource[] = ["user_said", "user_reworded"]

/**
 * The note under a wide chip.
 *
 * The rail already says who authored the line, so only the two things the rail
 * CANNOT say earn a row of their own — and one of them stops earning it inside
 * the group whose whole meaning is softness. "a preference, not a hard line"
 * under a chip in DRAWN TO is the group label restated, and it cost that group
 * 120px against the 56px an ordinary one takes. Under WON'T TAKE, where the
 * label means the opposite, it is the only thing saying this one does not
 * exclude — so the caller decides, per slot.
 *
 * `unusable` is never suppressed. It is an instruction, not a classification.
 */
function metaFor(line: OrderLine, softNote: boolean): string | null {
  if (line.unusable) return "Myro can't run this — reword it"
  if (line.soft && softNote) return "a preference, not a hard line"
  return null
}

export function Chip({
  line,
  onReword,
  onDrop,
  busy,
  softNote = true,
}: {
  line: OrderLine
  onReword: (text: string) => void
  onDrop: () => void
  busy?: boolean
  /** False inside a slot that already means "soft" — see `metaFor`. */
  softNote?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(line.text)
  const input = useRef<HTMLInputElement>(null)
  const said = USER_SOURCES.includes(line.source) ? "user" : "myro"
  const meta = metaFor(line, softNote)

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
      <span
        className="pf-chip"
        role="group"
        aria-label={`Editing ${line.text}`}
        data-said={said}
        data-editing="true"
        data-wide={meta ? "true" : undefined}
      >
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
      /* `role="group"` is load-bearing, not decoration: an `aria-label` on a
         bare span with no role is ignored, so without it the provenance below
         reaches nobody and the rail goes back to being sighted-only — which is
         the one thing this surface exists to prevent. `.pf-plate` had it; the
         chip lost it in the rewrite and nothing caught it, because the test
         checked that the string was in the source rather than that it was
         exposed. */
      role="group"
      data-said={said}
      data-wide={meta ? "true" : undefined}
      /* The rail is a colour bar — invisible to a screen reader. The source it
         encodes travels in the accessible name instead. */
      aria-label={
        line.soft && !softNote
          ? `${line.text} — ${SOURCE_LABEL[line.source]}, a preference, not a hard line`
          : `${line.text} — ${SOURCE_LABEL[line.source]}`
      }
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
