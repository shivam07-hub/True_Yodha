"use client"

/**
 * Screen 1 — the whole screen is ONE question.
 *
 * No fields, no rows, no brief. The surface this replaced opened on a chat box
 * sitting above six form rows, which asked the user to answer the same thing
 * twice in two registers and made the conversation look optional. Someone who
 * cannot phrase a dealbreaker as a chip types junk into the chip, and that junk
 * reaches the matcher as truth — a `career_goal` of "No" is in production right
 * now because of it.
 *
 * So: say it out loud, in your words. Myro asks about the rest afterwards, a few
 * at a time, with the source of every guess shown.
 */

import { useState } from "react"

import { Icon } from "@/components/cv/builder/icons"

export function ScreenSayIt({
  starters,
  memoryCount,
  cvReady,
  busy,
  onSubmit,
}: {
  /** Titles read off the CV. Tapping one APPENDS to the input — nothing is on
   *  the order until the user says it. */
  starters: string[]
  memoryCount: number
  cvReady: boolean
  busy?: boolean
  onSubmit: (said: string) => void
}) {
  const [value, setValue] = useState("")
  const idle = value.trim().length === 0

  function append(word: string) {
    setValue((v) => (v.trim() ? `${v.trim()}, ${word}` : word))
  }

  return (
    <>
      <div className="pf-ask-row">
        <Icon name="sparkle" size={16} />
        Myro · one question
      </div>

      <h4 className="pf-question">What kind of work do you want me to look for?</h4>
      <p className="pf-sub">
        Say it however you&apos;d say it out loud. The place, the pay floor, the
        things you won&apos;t take — I&apos;ll ask after, a few at a time.
      </p>

      <div className="pf-compose">
        <input
          className="pf-input"
          value={value}
          maxLength={600}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !idle && !busy) { e.preventDefault(); onSubmit(value.trim()) }
          }}
          placeholder="e.g. tech sales in Bengaluru, but not people management"
          aria-label="What kind of work do you want Myro to look for?"
        />
        <button
          type="button"
          className="pf-send tm-control-focus"
          data-idle={idle ? "true" : undefined}
          onClick={() => { if (!idle && !busy) onSubmit(value.trim()) }}
          aria-label="Send"
          aria-disabled={idle || busy ? true : undefined}
        >
          <Icon name="arrow-right" size={17} />
        </button>
      </div>

      {starters.length > 0 ? (
        <div className="pf-starters">
          <div className="pf-starters-label">Read off your CV — tap to add</div>
          <div className="pf-pill-row">
            {starters.map((word) => (
              <button
                key={word}
                type="button"
                className="pf-pill tm-control-focus"
                onClick={() => append(word)}
              >
                + {word}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* What Myro brings that the question doesn't name. A source, not a
          setting — and honest about the fact it hasn't read the notes yet. */}
      <div className="pf-source-strip">
        {cvReady ? "CV baseline · ready" : "No CV yet · add one to sharpen matches"}
        {memoryCount > 0 ? ` — ${memoryCount} notes, unread until you name the work` : null}
      </div>
    </>
  )
}
