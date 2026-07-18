import test from "node:test"
import assert from "node:assert/strict"

import {
  answerApplyReturn,
  beginApplyReturn,
  issueFeedbackReason,
} from "../lib/jobs/apply-return-model"

test("leaving Myro starts an attempt and never claims submission", () => {
  assert.deepEqual(beginApplyReturn(), { step: "asking" })
})

test("only explicit confirmation reaches submitted", () => {
  assert.deepEqual(answerApplyReturn("submitted"), { step: "submitted" })
  assert.deepEqual(answerApplyReturn("not_yet"), { step: "saved" })
  assert.deepEqual(answerApplyReturn("couldnt"), { step: "issue" })
})

test("could-not-apply reasons map to the trusted listing feedback vocabulary", () => {
  assert.equal(issueFeedbackReason("link_gone"), "apply_link_closed")
  assert.equal(issueFeedbackReason("wrong_page"), "apply_redirected")
  assert.equal(issueFeedbackReason("wrong_role"), "apply_wrong_role")
  assert.equal(issueFeedbackReason("technical"), "apply_technical_error")
})
