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
  landingStep,
  overlayFor,
  willCharge,
  type TailorFacts,
} from "../lib/cv/tailor-order"
import { buildSteps, firstUndecidedStep, stepsRemaining } from "../lib/cv/weave-steps"

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
  assert.equal(
    firstUndecidedStep(
      [
        { kind: "role", role: { role_index: 0 } },
        { kind: "role", role: { role_index: 2 } },
        { kind: "role", role: { role_index: 4 } },
      ] as never,
      { decidedRoles: [0, 2], extrasDecided: false },
    ),
    2,
  )
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

test("the summary card is a step — a draft holding it is not settled", () => {
  const steps = buildSteps({
    fingerprint: "f", summary: "New summary.", skills_line: null,
    roles: [{ role_index: 0, changed: true }, { role_index: 1, changed: false }],
    changed_roles: 1, requirements_total: 5, asks_unproven: 2, computed_at: "",
  } as never)
  assert.equal(steps.length, 2, "extras first, then the one changed role")
  assert.equal(steps[0].kind, "extras")
  assert.equal(
    firstUndecidedStep(steps, { decidedRoles: [0], extrasDecided: false }),
    0,
    "every role decided but the summary unseen — the stepper opens on it",
  )
  assert.equal(firstUndecidedStep(steps, { decidedRoles: [0], extrasDecided: true }), 2)
})

test("stepsRemaining counts the CV-wide card alongside the roles", () => {
  assert.equal(stepsRemaining([0, 1], [0], true, false), 2)
  assert.equal(stepsRemaining([0, 1], [0, 1], true, false), 1)
  assert.equal(stepsRemaining([0, 1], [0, 1], true, true), 0)
  assert.equal(stepsRemaining([], [], false, false), 0)
})

test("factsFromGet is not settled while the summary card is unanswered", () => {
  const open = factsFromGet({
    purchased: true, applied: true, decided_roles: [0], extras_decided: false,
    proposal: { roles: [{ changed: true, role_index: 0 }], summary: "New summary." },
  }, 0)
  assert.equal(open.acceptComplete, false)
  assert.equal(landingStep(open), "accept")

  const done = factsFromGet({
    purchased: true, applied: true, decided_roles: [0], extras_decided: true,
    proposal: { roles: [{ changed: true, role_index: 0 }], summary: "New summary." },
  }, 0)
  assert.equal(done.acceptComplete, true)
  assert.equal(landingStep(done), "paper")
})
