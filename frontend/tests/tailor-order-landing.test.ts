/**
 * Tailor Order landing — the part worth testing, and the part that carries
 * the risk a stepped flow introduces.
 *
 * Always opening the weave overlay is the opposite of remembering: a job
 * whose CV is already written and whose gaps are closed should land on the
 * paper. `landingStep` is the whole answer, so it is asserted here rather
 * than eyeballed once in an authed session.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  factsFromGet,
  firstUndecidedIndex,
  landingStep,
  overlayFor,
  willCharge,
  type TailorFacts,
} from "../lib/cv/tailor-order"

const facts = (partial: Partial<TailorFacts>): TailorFacts => ({
  proposal: "none",
  acceptComplete: false,
  closableGaps: null,
  ...partial,
})

test("a first visit opens Proof — there is no draft yet", () => {
  assert.equal(landingStep(facts({})), "proof")
  assert.equal(overlayFor("proof"), "weave")
  assert.equal(willCharge("proof"), true)
})

test("a current draft with no Keep/Take yet opens Accept", () => {
  assert.equal(landingStep(facts({ proposal: "current" })), "accept")
  assert.equal(overlayFor("accept"), "weave")
  assert.equal(willCharge("accept"), false)
})

test("abort after some Takes still opens Accept — the paper kept what landed", () => {
  assert.equal(landingStep(facts({ proposal: "current", acceptComplete: false })), "accept")
  assert.equal(firstUndecidedIndex([0, 2, 4], [0, 2]), 2)
})

test("a stale draft opens Weave — the paper it was written for is gone", () => {
  assert.equal(landingStep(facts({ proposal: "stale", acceptComplete: true, closableGaps: 0 })), "weave")
  assert.equal(willCharge("weave"), true)
})

test("every role decided and gaps remain — landing is Gaps, not a second weave", () => {
  assert.equal(landingStep(facts({ proposal: "current", acceptComplete: true, closableGaps: 3 })), "gaps")
  assert.equal(overlayFor("gaps"), "gaps")
  assert.equal(willCharge("gaps"), false)
})

test("a settled order opens on the paper — no overlay, no dead Tailor control", () => {
  assert.equal(landingStep(facts({ proposal: "current", acceptComplete: true, closableGaps: 0 })), "paper")
  assert.equal(overlayFor("paper"), null)
  assert.equal(willCharge("paper"), false)
})

test("coverage still loading never claims settled", () => {
  assert.equal(landingStep(facts({ proposal: "current", acceptComplete: true, closableGaps: null })), "gaps")
})

test("draft gone, Accept already complete — do not charge again", () => {
  assert.equal(landingStep(facts({ proposal: "none", acceptComplete: true, closableGaps: 0 })), "paper")
  assert.equal(landingStep(facts({ proposal: "none", acceptComplete: true, closableGaps: 2 })), "gaps")
})

test("factsFromGet treats a partial Accept as not complete", () => {
  const partial = factsFromGet({
    purchased: true,
    applied: true,
    decided_roles: [0],
    proposal: { roles: [{ changed: true }, { changed: true }, { changed: false }] },
  }, 1)
  assert.equal(partial.proposal, "current")
  assert.equal(partial.acceptComplete, false)
  assert.equal(landingStep(partial), "accept")
})

test("factsFromGet maps the weave GET without inventing a second record", () => {
  assert.deepEqual(factsFromGet(undefined, null), {
    proposal: "none", acceptComplete: false, closableGaps: null,
  })
  assert.deepEqual(factsFromGet({ purchased: false }, 0), {
    proposal: "none", acceptComplete: false, closableGaps: 0,
  })
  assert.deepEqual(factsFromGet({ purchased: true, stale: false, applied: false }, 1), {
    proposal: "current", acceptComplete: false, closableGaps: 1,
  })
  assert.deepEqual(factsFromGet({ purchased: true, stale: true, applied: true }, 0), {
    proposal: "stale", acceptComplete: true, closableGaps: 0,
  })
})
