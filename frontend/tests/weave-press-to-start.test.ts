/**
 * A weave run charges up to 50 coins, so it starts only on a press of a
 * control that showed that price (Shivam, 2026-11-17).
 *
 * Before: when the interview had no question, or the draft was stale, the
 * overlay ran the weave the moment it opened. It opened by itself on a
 * never-tailored job (FD2), on a `?mentor=1` link, and on #62 R2's hand-over
 * from an empty gap deck. Now those openings land on one priced button, kept
 * in view, and the interview's buttons stay in view too.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { interviewActions, openingRun, startLabel } from "../lib/cv/interview-actions"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("a run starts by itself only after a priced press", () => {
  assert.equal(openingRun({ questions: 0, staleDraft: false, pricedPress: true }), "run")
  assert.equal(openingRun({ questions: 0, staleDraft: false, pricedPress: false }), "start")
  assert.equal(openingRun({ questions: 0, staleDraft: true, pricedPress: true }), "refresh")
  assert.equal(openingRun({ questions: 0, staleDraft: true, pricedPress: false }), "start")
})

test("questions are asked whoever opened it, and their buttons carry the price", () => {
  assert.equal(openingRun({ questions: 2, staleDraft: false, pricedPress: false }), "interview")
  assert.equal(openingRun({ questions: 2, staleDraft: false, pricedPress: true }), "interview")
  assert.equal(startLabel(50), "Weave now · up to 50")
  assert.equal(interviewActions(0, 3, 50).weaveNowLabel, startLabel(50))
})

test("only the header's priced button counts as a priced press", () => {
  const hook = code(read("components/cv/builder/use-tailor-landing.ts"))
  assert.match(hook, /const \[pricedPress, setPricedPress\] = useState\(false\)/)
  const header = hook.slice(hook.indexOf("onHeader:"), hook.indexOf("openGapsMap:"))
  assert.match(header, /setPricedPress\(leadCost != null\)/)
  const weave = hook.slice(hook.indexOf("openWeave:"), hook.indexOf("close:"))
  assert.match(weave, /setPricedPress\(false\)/)
  const auto = hook.slice(hook.indexOf("const mentorOpened"), hook.indexOf("const showLead"))
  assert.match(auto, /setPricedPress\(false\)/)
  assert.match(read("components/cv/builder/playground-view.tsx"), /pricedPress=\{tailor\.pricedPress\}/)
})

test("the overlay asks openingRun and never runs the weave from its effect without one", () => {
  const weave = code(read("components/cv/builder/tailor-weave.tsx"))
  const effect = weave.slice(weave.indexOf("const weaveMutate"), weave.indexOf("const loomLines"))
  assert.match(effect, /openingRun\(\{/)
  assert.match(effect, /if \(next === "start"\) \{\s*setAct\("start"\)/)
  assert.match(weave, /type Act = "loom" \| "interview" \| "start" \| "review"/)
  // The start act's one button runs the weave, with the price on it.
  const start = weave.slice(weave.indexOf('act === "start" &&'), weave.indexOf('act === "review" && proposal'))
  assert.ok(start.length > 0, "the start act renders before the review act")
  assert.match(start, /onClick=\{pressStart\}/)
  assert.match(start, /\{startLabel\(cost\)\}/)
  assert.match(start, /className="tw-start-actions"/)
})

test("the start button and the interview's buttons stay in view", () => {
  const css = read("components/cv/builder/tailor-weave.css")
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`)
    assert.ok(at >= 0, `${sel} has a rule`)
    return css.slice(at, css.indexOf("}", at))
  }
  for (const sel of [".tw-start-actions", ".tw-int-actions"]) {
    assert.match(rule(sel), /position: sticky/, `${sel} is pinned`)
    assert.match(rule(sel), /bottom: 0/, `${sel} is pinned to the bottom`)
  }
})
