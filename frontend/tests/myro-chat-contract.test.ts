import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const chat = readFileSync(new URL("../components/myro/myro-chat.tsx", import.meta.url), "utf8")
const gate = readFileSync(new URL("../components/jobs/MatchRefreshGate.tsx", import.meta.url), "utf8")
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8")

/**
 * Myro Search is conversation-first, and the conversation does not write.
 *
 * The concierge already existed and already read memory and career stories — it
 * was mounted only on the DISAPPOINTMENT path (feed empty, "Not it?"), never on
 * the screen where the user is actively declaring what they want. Seven typed
 * rows meant someone who could not phrase a dealbreaker as a chip typed junk,
 * and that reached the matcher as truth.
 */

test("the shared conversation never persists — the surface owns the commit", () => {
  // The invariant outlived the file. preflight-chat.tsx became MyroChat (one
  // conversation, four surfaces), and the rule it existed to hold is unchanged
  // and now covers every surface: the market sheet applies and re-runs the feed,
  // this component never does. The modal's three exits (Run / Save targeting
  // only / Discard) stay the single commit point, so the distiller's
  // propose-only lock on profile columns holds and Discard still means discard.
  assert.doesNotMatch(chat, /applyIntentDiff\(/)
  assert.doesNotMatch(chat, /cv\.dump\.add\(/)
  assert.match(chat, /mentor\.converse\(/)
  // It hands the proposal upward instead — and only where one is possible.
  assert.match(chat, /onPropose\(res\.proposed_diff\)/)
})

test("a proposal lands in the DRAFT, not the profile", () => {
  assert.match(gate, /const applyProposal = useCallback/)
  assert.match(gate, /setDraft\(\(d\) => \{/)
  assert.match(gate, /<MyroChat[\s\S]{0,300}onPropose=\{applyProposal\}/)
  // Marking the draft touched is what stops the preflight seed overwriting what
  // the user just said out loud.
  const fn = gate.slice(gate.indexOf("const applyProposal"), gate.indexOf("const applyProposal") + 400)
  assert.match(fn, /touched\.current = true/)
})

test("a conversation can fill every row the run actually uses", () => {
  // Two of the modal's five editable rows is a filter tweak wearing the label
  // "tell Myro what you want". The diff carries all of them.
  for (const field of ["deal_breakers", "career_goal", "superpower"]) {
    assert.match(api, new RegExp(`${field}[?]?:`), `IntentFilterDiff is missing ${field}`)
    assert.match(gate, new RegExp(`diff\\.${field}`), `applyProposal ignores ${field}`)
  }
})

test("a new dealbreaker adds to the ones already on screen", () => {
  // Replacing the array would silently drop what the user already entered.
  const fn = gate.slice(gate.indexOf("dealBreakers: ["), gate.indexOf("careerGoal: diff"))
  assert.match(fn, /\.\.\.d\.dealBreakers/)
  assert.match(fn, /diff\.deal_breakers\.filter/)
})

test("the header no longer calls the rows the input", () => {
  // Design over words: the rows are the receipt of the conversation now, and the
  // copy has to say which is which or the screen contradicts itself.
  assert.doesNotMatch(gate, /Myro reads the inputs below/)
  assert.match(gate, /Tell Myro what you want, or edit it below/)
})
