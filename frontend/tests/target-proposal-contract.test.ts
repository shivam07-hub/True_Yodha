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
  assert.match(confirm, /if \(mayPropose\(top\)\) setSelected/, "the proposal is not gated — that is guessing")
  assert.match(
    confirm,
    /function mayPropose\(role: RoleFamily\): boolean/,
    "the gate must be a named predicate, not a condition inlined in the effect",
  )
})

test("a residual bucket is offered, never asserted", () => {
  // "Business Operations" is where a job lands when its skills are generic. It
  // ranked #1 for 41.3% of users and was auto-ticked for 150 of 156 of them,
  // rendered as "Branch Manager-BRANCH BANKING-Branch Head". Myro cannot defend
  // one as somebody's direction, so it may list one and must never pre-select it.
  assert.match(confirm, /if \(role\.is_catch_all\) return false/, "a catch-all can still be proposed")
})

test("the gate reads the skills the screen actually shows", () => {
  // The old gate was `matched_skill_count >= 3` — skills appearing ANYWHERE in
  // the family. That count is a function of family size, which is the bug the
  // ranking migration removed; leaving it in the gate keeps the bug.
  assert.match(confirm, /role\.top_skills/, "the gate does not read what the cluster hires for")
  assert.match(confirm, /role\.matched_skills/, "the gate does not read what the user holds")
  // Narrow to the USAGE: the explanation above mayPropose names the old gate,
  // and a bare-name assertion would trip on its own prose.
  assert.doesNotMatch(
    confirm,
    /top\.matched_skill_count|role\.matched_skill_count/,
    "the size-proxy count is back in the proposal path",
  )
})

test("the gate carries the measurement that justifies it", () => {
  // A threshold with no number behind it is a guess with a constant name.
  assert.match(confirm, /91\.8%/, "the measured distribution is not recorded beside the gate")
  assert.match(confirm, /72\.6%/, "the measured firing rate is not recorded beside the gate")
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
