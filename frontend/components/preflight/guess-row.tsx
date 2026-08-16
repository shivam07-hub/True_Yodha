"use client"

/**
 * One line, answerable on its own.
 *
 * Used by both the proposals screen and the confirm rounds, because they are the
 * same interaction: Myro states something, says where it came from, and the user
 * settles it without touching anything else. Two components would have drifted —
 * the old surface had two chat implementations and the user met two Myros.
 *
 * The rule this component exists to enforce: **a line Myro cannot run is never
 * offered a `yes`.** A goal that reads "No" gets `no` and `reword` only, so the
 * user cannot sign off on something the matcher will silently ignore.
 */

import { useEffect, useRef, useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SOURCE_LABEL, type OrderLine } from "@/lib/preflight/types"

export function GuessRow({
  line,
  eyebrow,
  onAnswer,
  onReword,
  busy,
}: {
  line: OrderLine
  /** The field this touches — LOCATION, WON'T TAKE, DRAWN TO. */
  eyebrow?: string
  onAnswer: (status: "kept" | "dropped" | "unanswered") => void
  onReword: (text: string) => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(line.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function save() {
    const text = draft.trim()
    if (!text) return
    setEditing(false)
    onReword(text)
  }

  const answered = line.status !== "unanswered"
  const reworded = line.source === "user_reworded"
  const noteTone = reworded ? "reworded" : line.soft || line.unusable ? "soft" : undefined

  return (
    <div
      className="pf-guess"
      data-status={line.status}
      role="group"
      aria-label={`${line.text} — ${SOURCE_LABEL[line.source]}`}
    >
      <div className="pf-guess-main">
        <div className="pf-guess-copy">
          {eyebrow ? <div className="pf-guess-eyebrow">{eyebrow}</div> : null}

          {editing ? (
            <div className="pf-reword">
              <input
                ref={inputRef}
                className="pf-reword-input"
                value={draft}
                maxLength={240}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); save() }
                  if (e.key === "Escape") { e.preventDefault(); setEditing(false); setDraft(line.text) }
                }}
                aria-label="Reword this line"
              />
              <div className="pf-reword-actions">
                <button type="button" className="pf-answer" data-kind="yes" onClick={save}>
                  save · enter
                </button>
                <button
                  type="button"
                  className="pf-undo"
                  onClick={() => { setEditing(false); setDraft(line.text) }}
                >
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="pf-guess-text">{line.text}</div>
              <div className="pf-guess-meta">
                <span className="pf-source">{SOURCE_LABEL[line.source]}</span>
                {line.source_note ? (
                  <span className="pf-note" data-tone={noteTone}>{line.source_note}</span>
                ) : null}
              </div>
            </>
          )}
        </div>

        {editing ? null : answered ? (
          <div className="pf-answered" data-status={line.status}>
            <span>{line.status === "kept" ? "✓ yes" : "✕ no"}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="pf-undo tm-control-focus"
              onClick={() => onAnswer("unanswered")}
              disabled={busy}
            >
              undo
            </button>
          </div>
        ) : (
          <div className="pf-answers">
            {/* No `yes` on a line Myro cannot run. Reword it first — that is the
                only path that turns it into something the matcher can use. */}
            {line.unusable ? null : (
              <button
                type="button"
                className="pf-answer tm-control-focus"
                data-kind="yes"
                onClick={() => onAnswer("kept")}
                disabled={busy}
              >
                <Icon name="check" size={13} /> yes
              </button>
            )}
            <button
              type="button"
              className="pf-answer tm-control-focus"
              data-kind="no"
              onClick={() => onAnswer("dropped")}
              disabled={busy}
            >
              no
            </button>
            <button
              type="button"
              className="pf-answer tm-control-focus"
              data-kind="reword"
              onClick={() => { setDraft(line.text); setEditing(true) }}
              disabled={busy}
            >
              <Icon name="edit" size={13} /> reword
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
