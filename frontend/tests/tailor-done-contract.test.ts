/**
 * Tailor landing no longer offers a second search. Job Tracks still flips
 * `can_open` on apply; the offer lives on Market / the refresh gate.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const weave = read("components/cv/builder/tailor-weave.tsx")
const landing = read("components/cv/builder/use-weave-landing.ts")
const gate = read("components/cv/builder/use-tailor-gate.ts")
const market = read("components/market/market-jobs-column.tsx")

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("the gate is re-read when a Take lands, not on the next visit", () => {
  assert.match(gate, /export function useTailorGateRefresh/)
  assert.match(gate, /invalidateQueries\(\{ queryKey: trackKeys\.all\(\) \}\)/)
  // The refresh rides the landing's onApplied, which the apply mutation fires
  // on SUCCESS — never on mount, and never on the optimistic advance.
  assert.match(weave, /onApplied: versionId => \{ onApplied\(versionId\); refreshTrackGate\(\) \}/)
  assert.match(landing, /onSuccess: \(res, land\) =>/)
  const apply = landing.slice(landing.indexOf("const apply = useMutation"))
  assert.match(apply, /onApplied\(res\.version_id\)/, "the refresh belongs to the apply, not to mount")
  assert.doesNotMatch(
    apply.slice(apply.indexOf("onMutate"), apply.indexOf("onSuccess")),
    /onApplied/,
    "the optimistic advance must not claim the draft landed",
  )
})

test("a Keep/Take turns the card on the click, and rolls back if it failed", () => {
  const apply = landing.slice(landing.indexOf("const apply = useMutation"))
  const onMutate = apply.slice(apply.indexOf("onMutate"), apply.indexOf("onSuccess"))
  assert.match(onMutate, /setIdx\(/, "the step advances optimistically")
  assert.match(apply, /onError: \(e: Error, _land, before\) =>/)
  assert.match(apply.slice(apply.indexOf("onError")), /setIdx\(before\.idx\)/)
  // Nothing may disable the decision buttons on a pending write.
  assert.doesNotMatch(read("components/cv/builder/weave-review.tsx"), /disabled=/)
})

test("landings reach the server in order — one draft row, one writer", () => {
  assert.match(landing, /queue\.current/)
  assert.match(landing, /queue\.current = next/)
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
