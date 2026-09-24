import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const steps = read("components/onboarding/target-steps.tsx")
const confirm = read("components/onboarding/target-confirm.tsx")

/**
 * Years of experience: shown, correctable, and never invented.
 *
 * The band cannot answer an employer's "3+ years" — `mid` admits entry and mid
 * alike — so the number is its own field, and it is the one retrieval matches on:
 * her range is [years-1, years+1], and without it she falls back to the band's
 * whole implied span. For a mid-band person that is [2,5] instead of [2.2,4.2],
 * and the Match Quality gate measured the cost: 12 of her 40 jobs failed the level
 * rule at the top end, every one of them because the number was missing.
 *
 * Which makes this screen the only honest home for the `cv_years` forward pass.
 * A pass that reshaped her matches on a CV read, where no surface renders years,
 * would be enrichment she was never told about (`964f1587`).
 */

test("the number is on screen, not behind a disclosure", () => {
  assert.match(steps, /Years of experience/)
  assert.match(steps, /type="number"/)
  // It is what decides her matches, so it must not sit inside a <details> or a
  // "show more" — hiding it hides the input that chose the list.
  const level = steps.slice(steps.indexOf("export function LevelStep"))
  assert.doesNotMatch(level.slice(0, level.indexOf("export function WhereStep")), /<details|aria-expanded/)
})

test("unknown years stays blank and is never sent as zero", () => {
  // A zero would make every "2+ years" listing ineligible — a worse answer than
  // no answer. Blank input clears to null, and null is omitted from the save.
  assert.match(steps, /if \(raw === ""\) return onYearsChange\(null\)/)
  assert.match(confirm, /\.\.\.\(years != null \? \{ years_experience: years \} : \{\}\)/)
})

test("a correction stops the screen crediting the CV for the number", () => {
  // `user` outranks any later parse, forever (CEO decision 2026-09-23). Saying
  // "read from your CV" over a number she typed is a false claim about provenance.
  assert.match(steps, /if \(storedSource === "user"\) return "You set this\."/)
  assert.match(confirm, /setYearsSource\("user"\)/)
})

test("the stored number wins over a fresh parse of the same CV", () => {
  // The pass may have written one, or she may have corrected one. Either way the
  // stored value is the answer; `result.seniority.years` is only the reading.
  assert.match(
    confirm,
    /result\.selected\?\.years_experience \?\? result\.seniority\.years \?\? null/,
  )
})

test("the range the number produces is stated, not left to be inferred", () => {
  // The user should be able to see why a role asking 6 years is not on her list.
  assert.match(steps, /Myro matches you against roles asking roughly/)
})
