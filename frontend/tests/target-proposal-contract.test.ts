import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const confirm = read("components/onboarding/target-confirm.tsx")

/**
 * Direction must open on an answer, not a blank.
 *
 * 233 users reached this screen, chose nothing, and left. A target roughly
 * triples apply rate (26% with, 9% without), and the list this screen is handed
 * is ALREADY ranked by overlap with the user's own CV skills — we were showing a
 * ranked answer as an empty menu.
 *
 * Seniority on this same screen has always pre-filled from the CV. These tests
 * hold roles to the same contract, including its honest half: never guess.
 */

test("the screen proposes the top CV-ranked family instead of opening blank", () => {
  assert.match(confirm, /proposedRef/, "no proposal effect")
  assert.match(
    confirm,
    /setSelected\(\[top\]\)/,
    "the top-ranked family is not proposed into the selection",
  )
})

test("it proposes only when the CV evidence carries it", () => {
  assert.match(
    confirm,
    /top\.matched_skill_count >= ROLE_SUGGESTION_MIN_SKILLS/,
    "the proposal is not gated on match strength — that is guessing",
  )
  assert.match(
    confirm,
    /const ROLE_SUGGESTION_MIN_SKILLS = \d+/,
    "the floor must be a named constant, not a literal in the condition",
  )
})

test("the floor carries the measurement that justifies it", () => {
  // A threshold with no number behind it is a guess with a constant name.
  assert.match(confirm, /88%/, "the measured distribution is not recorded beside the floor")
})

test("it proposes at most once and never argues with a removal", () => {
  // A user who deselects has ANSWERED. Re-proposing would fight them, and the
  // effect re-runs whenever `selected` changes — including when it empties.
  assert.match(
    confirm,
    /if \(proposedRef\.current\) return/,
    "the proposal is not guarded against re-running",
  )
  assert.match(
    confirm,
    /if \(selected\.length > 0\) \{ proposedRef\.current = true; return \}/,
    "an existing selection does not disarm the proposal",
  )
})

test("an unloaded list is not mistaken for no answer", () => {
  // `result.families` is empty on the confirm-skills path and fills in later.
  // Treating that as "no suggestion" would burn the one proposal on nothing.
  assert.match(confirm, /if \(!top\) return/, "an empty list disarms the proposal")
})

test("a stored choice still wins over the proposal", () => {
  assert.match(
    confirm,
    /useState<RoleFamily\[\]>\(result\.selected\?\.families \?\? \[\]\)/,
    "the restored selection is no longer the seed",
  )
})

test("seniority keeps pre-filling from the CV — roles now match it", () => {
  assert.match(
    confirm,
    /result\.selected\?\.seniority \?\? result\.seniority\.value/,
    "the seniority pre-fill this mirrors has moved",
  )
})
