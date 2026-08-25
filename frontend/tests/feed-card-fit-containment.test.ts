import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

/**
 * The fit ring (score + verdict word) rendered OUTSIDE the card's right edge on
 * every row card: the inner container was `className="fc-row"`, the same string
 * the card's own variant class produces (`fc-${variant}`), so the inner row's
 * layout rule also landed on the <article>. `align-items: flex-start` there
 * stopped the card's children stretching, the row sized to its own min-content
 * (the skill strip never wraps), and the fit column was pushed past the border.
 *
 * The mechanism that keeps the number in the box is two rules working together:
 *   1. no inner class may collide with a variant class, so the card's children
 *      keep the default `stretch` and can never exceed the card's content box;
 *   2. `.fc-body` keeps `min-width: 0`, so the squeeze is absorbed by the body
 *      (its chip strip scrolls) instead of by the fit column.
 */
const VARIANTS = ["row", "compact", "immersive"] as const

test("no inner feed-card element wears a class the card's variant also produces", () => {
  const tsx = read("components/jobs/feed-card.tsx")
  for (const v of VARIANTS) {
    assert.doesNotMatch(
      tsx,
      new RegExp(`<div className="fc-${v}"`),
      `an inner <div> is classed fc-${v} — the same class <FeedCard variant="${v}"> puts on the ` +
        `<article>, so its rules hit the card too. Name inner elements uniquely (fc-main).`,
    )
  }
  assert.match(tsx, /<div className="fc-main">/)
})

test("the fit column is contained: body absorbs the squeeze, card children stretch", () => {
  const css = read("components/jobs/feed-card.css")
  assert.match(css, /\.fc-main \{[^}]*display: flex/)
  assert.match(css, /\.fc-body \{[^}]*min-width: 0/)
  // A bare variant rule also matches the <article>. Sizing/alignment there is how
  // the card stopped stretching its children — that is what must never come back.
  for (const v of VARIANTS) {
    const rule = css.match(new RegExp(`^\\.fc-${v} \\{([^}]*)\\}`, "m"))
    if (!rule) continue
    assert.doesNotMatch(
      rule[1],
      /align-items|flex-direction/,
      `.fc-${v} is a bare variant rule setting alignment — it lands on the card itself and ` +
        `un-stretches its children, which pushes the fit column out of the box.`,
    )
  }
})
