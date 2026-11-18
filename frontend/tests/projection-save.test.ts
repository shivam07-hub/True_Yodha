/**
 * #62 R0: opening a job's CV must not write its document.
 *
 * The playground's autosave compared the projection on screen with
 * `lastSavedRef`, which started as "". Its first run came before the versions
 * read landed, the empty projection differed from "", and a read slower than
 * the 1.2 s debounce let `saveVersion` create the job document. `_stage` then
 * called the job tailored. Measured 2026-11-16: 11 of 11 real job documents
 * since 2026-09-28 were written within 5 s of the page opening.
 *
 * There is no DOM test runtime here, so the decision is a pure function and
 * the hook is held to using it at every place that persists.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { projectionChanged } from "../lib/cv/projection-save"

const hook = readFileSync(new URL("../lib/hooks/use-cv-playground.ts", import.meta.url), "utf8")
const code = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("nothing hydrated yet is never a change to save", () => {
  assert.equal(projectionChanged(null, "|summary,experience,projects,skills_line,education,certs"), false)
  assert.equal(projectionChanged(null, ""), false)
  assert.equal(projectionChanged(null, "a,b|summary"), false)
})

test("after hydration, only a different projection is a change", () => {
  const hydrated = "x1|summary,experience"
  assert.equal(projectionChanged(hydrated, hydrated), false)
  assert.equal(projectionChanged(hydrated, "x1,x2|summary,experience"), true)
  assert.equal(projectionChanged(hydrated, "x1|experience,summary"), true)
  // An empty projection is a real edit once something was hydrated: every
  // line shown again.
  assert.equal(projectionChanged(hydrated, "|summary,experience"), true)
})

test("the hook starts with nothing hydrated, not an empty projection", () => {
  assert.match(code, /const lastSavedRef = useRef<string \| null>\(null\)/)
  assert.doesNotMatch(code, /lastSavedRef\.current = ""/)
  assert.doesNotMatch(code, /useRef<string>\(""\)/)
})

test("every path that persists asks projectionChanged first", () => {
  const effect = code.slice(code.indexOf("const debounceRef"), code.indexOf("const flushHidden"))
  const flush = code.slice(code.indexOf("const flushHidden"), code.indexOf("const unmountRef"))
  const unmount = code.slice(code.indexOf("const unmountRef"), code.indexOf("const clearLastWrite"))
  for (const [name, part] of [["autosave", effect], ["flushHidden", flush], ["unmount flush", unmount]] as const) {
    assert.match(part, /if \(!projectionChanged\(lastSavedRef\.current, /, `${name} must ask projectionChanged`)
    assert.doesNotMatch(part, /=== lastSavedRef\.current/, `${name} must not compare with the marker directly`)
  }
})

test("only a hydration or a landed write sets what was saved", () => {
  const sets = code.match(/lastSavedRef\.current = /g) ?? []
  const fromVersion = code.match(/lastSavedRef\.current = serializeProjection\(/g) ?? []
  assert.equal(sets.length, fromVersion.length, "the marker is only ever a version's own projection")
  assert.ok(fromVersion.length >= 3)
})
