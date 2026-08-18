import { strict as assert } from "node:assert"
import { test } from "node:test"

import { ApiError } from "../lib/api-error"
import { applyErrorMessage } from "../lib/preflight/apply-error"

test("a 409 keeps the server's reason", () => {
  const err = new ApiError("Your order changed somewhere else. Reopen it and try that again.", {
    kind: "http",
    status: 409,
  })
  assert.equal(applyErrorMessage(err), "Your order changed somewhere else. Reopen it and try that again.")
})

test("an unknown throw still names the failure", () => {
  assert.equal(applyErrorMessage(null), "Couldn't save those. Nothing was applied — try again.")
})
