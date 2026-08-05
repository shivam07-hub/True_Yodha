import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

/* A report is the opposite of a save.
 *
 * `reportIssue` used to call `persistStatus("saved")`: a user reported a dead
 * listing and Myro filed it into Collections, then thanked them for it. The
 * copy and the write agreed with each other and both were wrong. Nothing in the
 * suite read this path, so it survived every gate.
 */

const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
const hook = read("../components/jobs/use-apply-capture.tsx")
const webPrompt = read("../components/jobs/apply-capture-prompt.tsx")
const mobilePrompt = read("../mobile/redesign/apply-capture-prompt.tsx")

/** The body of `reportIssue`, up to the next top-level `const` declaration. */
function reportIssueBody(source) {
  const start = source.indexOf("const reportIssue = React.useCallback")
  assert.notEqual(start, -1, "reportIssue must still exist on the Apply transport")
  const end = source.indexOf("\n  const ", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

test("reporting a listing never persists it as a saved application", () => {
  const body = reportIssueBody(hook)
  assert.doesNotMatch(body, /persistStatus/)
})

test("reporting an unusable listing hides it from this user's own feed", () => {
  const body = reportIssueBody(hook)
  assert.match(body, /dismissMatchCard/)
  // The corpus verdict still travels — the dismissal is the personal half only.
  assert.match(body, /enqueueQuality\(issueFeedbackReason\(issue\)\)/)
})

test("a technical error reports without hiding the job", () => {
  // Our timeout, or theirs, is not evidence about the listing.
  assert.match(reportIssueBody(hook), /if \(issue === "technical"\) return/)
})

test("answering the return prompt still persists status", () => {
  // Guards the fix against being applied one level too high: "Yes"/"Not yet"
  // must keep writing applied/saved.
  assert.match(hook, /run\(\(\) => persistStatus\("saved"\), "saved"\)/)
  assert.match(hook, /await persistStatus\("applied"\)/)
})

test("neither surface thanks the user by claiming it kept the job", () => {
  for (const source of [webPrompt, mobilePrompt]) {
    assert.doesNotMatch(source, /reported[\s\S]{0,80}kept in Collections/)
  }
})
