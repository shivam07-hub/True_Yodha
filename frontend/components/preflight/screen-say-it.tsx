"use client"

/**
 * Screen 1 — name the work.
 *
 * Lead with what Myro already has (roles waiting, the CV, the things you've
 * told it), then the question, then the pad. Typing is the last small thing,
 * not the first big one. CV chips are proof, not a second form.
 */

import { useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SayPad } from "@/components/myro/say-pad"
import {
  appendStarter,
  cvReadCopy,
  rolesWaitingCopy,
  searchCostCopy,
  uniqueStarters,
} from "@/lib/preflight/say-it"

import "./screen-say-it.css"

export function ScreenSayIt({
  draft = "",
  starters,
  memoryCount,
  cvReady,
  newJobs,
  runCost,
  balance,
  busy,
  onSubmit,
}: {
  /** Words already said — coming back from the bubble keeps them. */
  draft?: string
  starters: string[]
  memoryCount: number
  cvReady: boolean
  newJobs: number
  runCost: number
  balance: number
  busy?: boolean
  onSubmit: (said: string) => void
}) {
  const [value, setValue] = useState(draft)
  const idle = value.trim().length === 0
  const chips = uniqueStarters(starters)
  const waiting = rolesWaitingCopy(newJobs)
  const know = cvReadCopy(cvReady, memoryCount)
  const price = searchCostCopy(runCost, balance)

  return (
    <>
      {waiting ? (
        <div className="pf-hero">
          <div className="pf-say-count">{waiting.n}</div>
          <p className="pf-hero-lede">{waiting.lede}</p>
        </div>
      ) : null}

      {know ? <p className="pf-know">{know}</p> : null}

      <div className="pf-price" data-short={price.short ? "true" : undefined}>
        {price.text}
      </div>

      <div className="pf-ask-row">Myro · one question</div>
      <h3 className="pf-question">Name the work. I&apos;ll go find it.</h3>
      <p id="pf-say-help" className="pf-sub">
        Say it the way you&apos;d say it to a friend. Place, pay floor, the stuff
        you won&apos;t take. I&apos;ll ask about the rest after.
      </p>

      <div className="pf-compose">
        <SayPad
          className="pf-input"
          value={value}
          maxLength={600}
          autoFocus
          onChange={setValue}
          onSubmit={() => { if (!idle && !busy) onSubmit(value.trim()) }}
          placeholder="e.g. sales strategy in Gurgaon, B2B, nothing below 18L"
          aria-label="Name the work. I'll go find it."
          aria-describedby="pf-say-help"
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

      {chips.length > 0 ? (
        <div className="pf-starters">
          <div className="pf-starters-label">From your CV</div>
          <div className="pf-pill-row">
            {chips.map((word) => {
              const inPad = value.toLowerCase().includes(word.toLowerCase())
              return (
                <button
                  key={word}
                  type="button"
                  className="pf-pill tm-control-focus"
                  data-in={inPad ? "true" : undefined}
                  aria-pressed={inPad}
                  onClick={() => setValue((v) => appendStarter(v, word))}
                >
                  {word}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}
