import assert from "node:assert/strict"
import test from "node:test"

import { filingHoldLine, filingLine } from "../lib/jobs/filing"

test("each filing block says what has to happen before a yes is stored", () => {
  assert.equal(filingLine("listing_closed"), "This role is closed.")
  assert.equal(
    filingLine("listing_unconfirmed"),
    "Filing waits until a check finds this role open.",
  )
  assert.equal(filingLine("below_judge"), "Filing waits for a judge score of 3.5 or higher.")
  assert.equal(filingLine("no_tailored_cv"), "Tailor a CV for this role before filing.")
  assert.equal(filingLine("stale_cv"), "Approve the latest CV for this role.")
  assert.equal(filingLine("made_up"), null)
  assert.equal(filingLine(undefined), null)
  assert.equal(filingHoldLine("captcha"), "The company page asked for a check. Finish it there.")
  assert.equal(filingHoldLine("login"), "Sign in on the company page, then fill from the extension.")
  assert.equal(filingHoldLine("resume"), "Attach the CV for this job on the company page.")
  assert.equal(filingHoldLine(null), null)
})
