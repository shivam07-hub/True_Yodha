import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
const hook = read("../components/jobs/use-apply-capture.tsx")
const webPrompt = read("../components/jobs/apply-capture-prompt.tsx")
const mobilePrompt = read("../mobile/redesign/apply-capture-prompt.tsx")

test("the shared Apply transport blocks a persisted closed verdict before handoff", () => {
  assert.match(hook, /livenessNotice\(livenessState\)\?\.guardsApply/)
  assert.match(hook, /event\?\.preventDefault\(\)/)
  assert.match(hook, /if \(livenessLoading\)/)
  assert.match(hook, /setState\("checking"\)/)
  assert.match(hook, /setState\("closed"\)/)
  assert.match(hook, /if \(!onApply\(\)\) return/)
})

test("desktop and mobile explain the stopped handoff and offer recovery", () => {
  for (const source of [webPrompt, mobilePrompt]) {
    assert.match(source, /capture\.state === "checking"/)
    assert.match(source, /capture\.state === "closed"/)
    assert.match(source, /Myro stopped the handoff/)
    assert.match(source, /Find live alternatives/)
  }
})
