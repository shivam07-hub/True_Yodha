"use client"

/**
 * The say affordance, always on the canvas.
 *
 * This is the surviving half of the market bottom-sheet — the door that used to
 * be a second button ("Not it? Tell Myro →") beside this modal's own. Both
 * called `/preflight/proposals`, both wrote the same Order, and neither told
 * the user they were the same thing. The sheet's one genuinely good idea was
 * the TOPIC CHIPS: a user who knows the feed is wrong usually cannot name why
 * on a blank line, and "the pay" is a whole sentence they didn't have to write.
 *
 * It lives under the slots rather than above them because the slots are the
 * answer to "what will Myro search for" and this is the answer to "and if that
 * is wrong?". A composer above the state it edits reads as a form; below it,
 * as a reply.
 *
 * A chip is a shortcut for SAYING something, so it submits the sentence, not
 * the label — the canvas heading then shows the user's own words, which is the
 * whole rule sentence one of the brief is built on.
 */

import { useEffect, useRef, useState } from "react"

import { Icon } from "@/components/cv/builder/icons"
import { SayPad } from "@/components/myro/say-pad"

/** What each chip means, in the user's voice. */
const TOPICS: readonly { key: string; said: string }[] = [
  { key: "the work", said: "the work isn't right — too many of these" },
  { key: "the place", said: "I'd rather not commute across the city" },
  { key: "the level", said: "these are all too junior" },
  { key: "the pay", said: "the pay is too low" },
]

export function SayBand({
  /** True while the modal is opened straight onto this band. Focuses the pad
   *  and scrolls it up, so the "something's off" door lands where it promised. */
  focused,
  pending,
  onSay,
}: {
  focused?: boolean
  pending: boolean
  onSay: (text: string) => void
}) {
  const [value, setValue] = useState("")
  const [used, setUsed] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focused) return
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      ref.current?.querySelector("textarea")?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [focused])

  function say(text: string) {
    const said = text.trim()
    if (!said || pending) return
    setValue("")
    onSay(said)
  }

  const chips = TOPICS.filter((t) => !used.includes(t.key))
  const idle = value.trim().length === 0

  return (
    <section ref={ref} className="pf-say" aria-label="Tell Myro what's off">
      <h3 className="pf-say-label">Something off?</h3>

      {chips.length > 0 ? (
        <div className="pf-topics">
          {chips.map((topic) => (
            <button
              key={topic.key}
              type="button"
              className="pf-topic tm-control-focus"
              disabled={pending}
              onClick={() => {
                setUsed((u) => [...u, topic.key])
                say(topic.said)
              }}
            >
              {topic.key}
            </button>
          ))}
        </div>
      ) : null}

      <div className="pf-canvas-compose">
        <SayPad
          size="compact"
          value={value}
          maxLength={600}
          onChange={setValue}
          onSubmit={() => say(value)}
          placeholder="or say it your way — one thing at a time works best"
          aria-label="Tell Myro what's off"
        />
        <button
          type="button"
          className="pf-canvas-send tm-control-focus"
          data-idle={idle ? "true" : undefined}
          onClick={() => say(value)}
          aria-label="Send"
          disabled={idle || pending}
        >
          <Icon name="arrow-right" size={17} />
        </button>
      </div>
    </section>
  )
}
