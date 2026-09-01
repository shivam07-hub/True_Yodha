/**
 * Tailor landing no longer offers a second search. Job Tracks still flips
 * `can_open` on apply; the offer lives on Market / the refresh gate.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const weave = read("components/cv/builder/tailor-weave.tsx")
const gate = read("components/cv/builder/use-tailor-gate.ts")
const market = read("components/market/jobs-tab.tsx")

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("the gate is re-read when a Take lands, not on the next visit", () => {
  assert.match(gate, /export function useTailorGateRefresh/)
  assert.match(gate, /invalidateQueries\(\{ queryKey: trackKeys\.all\(\) \}\)/)
  assert.match(weave, /refreshTrackGate\(\)/)
  assert.match(weave, /onSuccess: \(res, land\) =>/)
  const apply = weave.slice(weave.indexOf("const applyWeave"))
  assert.match(apply, /refreshTrackGate\(\)/, "the refresh belongs to the apply, not to mount")
})

test("this landing does not offer a second search", () => {
  assert.doesNotMatch(code(weave), /Add a search/)
  assert.doesNotMatch(code(weave), /TailorDone/)
  assert.doesNotMatch(code(weave), /openRefreshGate/)
})

test("the second-search offer lives where a search starts", () => {
  assert.match(market, /openRefreshGate\("say"\)/)
})

test("the overlay has no brief act", () => {
  assert.doesNotMatch(code(weave), /"brief"/)
  assert.match(weave, /act === "loom"/)
})
