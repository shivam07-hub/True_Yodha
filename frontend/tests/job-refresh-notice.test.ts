import test from "node:test"
import assert from "node:assert/strict"

import { deriveRefreshNotice } from "../lib/job-refresh-notice"

test("exhausted refresh outcome explains that no strong match pool was found", () => {
  const notice = deriveRefreshNotice({
    state: "done",
    progressLabel: "Done",
    matchesWritten: 0,
    errorMessage: null,
    outcomeKind: "exhausted",
  })

  assert.equal(notice?.kind, "info")
  assert.match(notice?.msg ?? "", /no strong matches/i)
  assert.match(notice?.msg ?? "", /tokens refunded/i)
})

test("cache-hit refresh outcome tells the user the batch is current", () => {
  const notice = deriveRefreshNotice({
    state: "done",
    progressLabel: "Done",
    matchesWritten: 0,
    errorMessage: null,
    outcomeKind: "cache_hit",
  })

  assert.equal(notice?.kind, "info")
  assert.match(notice?.msg ?? "", /already current/i)
})
