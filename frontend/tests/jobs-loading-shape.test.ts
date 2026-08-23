import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

test("Jobs hero loading mirrors CommandRail, not the deleted wide hero", () => {
  const hero = read("components/mission-control/hero-loading.tsx")
  const rail = read("components/mission-control/mission-hero-rail.tsx")
  const bootstrap = read("components/loading/page-skeletons.tsx")
  assert.match(hero, /className="mc-rail cmd-rail"/)
  assert.match(hero, /width:\s*68,\s*height:\s*68/)
  assert.doesNotMatch(hero, /mc-hero/)
  assert.doesNotMatch(hero, /width:\s*168,\s*height:\s*168/)
  assert.doesNotMatch(rail, /TealField/)
  assert.doesNotMatch(bootstrap, /width:\s*168,\s*height:\s*168/)
})

test("feed-card skeleton occupies the live row: tile, fit ring, actions", () => {
  const card = read("components/jobs/feed-card.tsx")
  const skeleton = card.slice(card.indexOf("export function FeedCardSkeleton"))
  assert.match(skeleton, /className="fc-card fc-row"/)
  assert.match(skeleton, /className="fc-fit"/)
  assert.match(skeleton, /className="fc-actions"/)
  assert.match(skeleton, /width:\s*34,\s*height:\s*34/)
  assert.doesNotMatch(skeleton, /width:\s*42,\s*height:\s*42/)
})

test("authed avatar never prints a fake HM identity", () => {
  const strip = read("components/shell/authed-top-strip.tsx")
  assert.doesNotMatch(strip, /["']HM["']/)
  assert.match(strip, /profileLoading/)
  assert.match(strip, /Skeleton/)
})

/** CIE L* of an sRGB hex — perceptual lightness, so "is this a visible step"
 *  is answered in the units the eye uses rather than in raw channel values. */
function lstar(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y
}

function token(block: string, name: string): string {
  const m = block.match(new RegExp(`--tm-${name}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `design-tokens.css must declare --tm-${name} as a hex in this block`)
  return m![1]
}

/**
 * Asserts the RULE, not the hexes. This test pinned #3a3a36 / #1c2a44 until
 * 2026-08-23, when the correct change (the azure palette) failed it — the
 * exact trap ANTI_SLOP.md warns about: a contract test that names a mechanism
 * instead of a rule fails the change it was meant to protect.
 *
 * The real contract from ADR-0011 §B: a loading bar must read as a SHAPE
 * against both the page and the card it sits on. It broke once by matching
 * --tm-surface-2, which made the bars vanish and the load read as empty.
 * 6 L* is the floor for "visible step"; both surfaces clear it with room.
 */
test("skeleton ink is a visible shape on the dark surface, not the card", () => {
  const tokens = read("app/design-tokens.css")
  const lightAt = tokens.search(/^:root\[data-surface="light"\]/m)
  assert.ok(lightAt > 0)

  for (const [name, block] of [["product dark", tokens.slice(0, lightAt)]] as const) {
    const skeleton = lstar(token(block, "skeleton"))
    for (const under of ["surface", "surface-2"] as const) {
      const step = skeleton - lstar(token(block, under))
      assert.ok(
        step >= 6,
        `${name}: --tm-skeleton is only ${step.toFixed(1)} L* above --tm-${under}. ` +
          `Under 6 the bars stop reading as shapes and the load looks empty.`,
      )
    }
  }
})
